use anyhow::{Context, Result};
use clap::Parser;
use libbpf_rs::{ObjectBuilder, RingBufferBuilder, UprobeBuilder};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::mem::size_of;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;

#[derive(Parser, Debug)]
#[command(about = "API Security eBPF Sensor")]
struct Args {
    #[arg(long)]
    bpf: String,
    #[arg(long)]
    ingest: String,
    #[arg(long)]
    api_key: String,
    #[arg(long, default_value = "1000000")]
    account_id: u64,
    #[arg(long, default_value = "200")]
    batch_size: usize,
    #[arg(long, default_value = "server")]
    role: String, // server | client
    #[arg(long, value_delimiter = ',', default_value = "/usr/lib/x86_64-linux-gnu/libssl.so.3")]
    tls_libs: Vec<String>,
    #[arg(long, default_value = "auto")]
    tls_provider: String, // auto | openssl | gnutls
    #[arg(long, default_value = "0")]
    pid: i32,
    #[arg(long, default_value_t = false)]
    discover_libs: bool,
    #[arg(long, default_value = "65536")]
    max_buffer_bytes: usize,
}

#[derive(Debug, Serialize)]
struct ApiRequest {
    method: String,
    path: String,
    host: Option<String>,
    scheme: String,
    headers: HashMap<String, String>,
    query: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
struct ApiResponse {
    status_code: i32,
    headers: HashMap<String, String>,
    body: Option<String>,
    latency_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
struct ApiTrafficEvent {
    version: String,
    event_type: String,
    source: String,
    account_id: u64,
    observed_at: u64,
    protocol: String,
    request: ApiRequest,
    response: ApiResponse,
    collection_id: Option<String>,
    source_ip: Option<String>,
}

#[derive(Debug, Serialize)]
struct EventBatch {
    version: String,
    events: Vec<ApiTrafficEvent>,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct TlsEvent {
    ts_ns: u64,
    pid: u32,
    tid: u32,
    ssl_ptr: u64,
    data_len: u32,
    direction: u8,
    _pad8: u8,
    _pad16: u16,
    comm: [u8; 16],
    data: [u8; 512],
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrafficRole {
    Server,
    Client,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct StreamKey {
    pid: u32,
    ssl_ptr: u64,
    direction: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ConnKey {
    pid: u32,
    ssl_ptr: u64,
}

#[derive(Debug, Clone)]
struct ParsedRequest {
    method: String,
    path: String,
    host: Option<String>,
    headers: HashMap<String, String>,
    ts_ms: u64,
}

const HTTP2_PREFACE: &[u8] = b"PRI * HTTP/2.0";

struct StreamState {
    account_id: u64,
    role: TrafficRole,
    max_buffer: usize,
    buffers: HashMap<StreamKey, Vec<u8>>,
    pending: HashMap<ConnKey, VecDeque<ParsedRequest>>,
    http2_state: HashMap<ConnKey, Http2Conn>,
}

#[derive(Default)]
struct Http2Conn {
    buffer: Vec<u8>,
    seen_preface: bool,
    pending_request: Option<ParsedRequest>,
    last_status: Option<String>,
    last_request_ts: u64,
    last_event_ts: u64,
}

impl StreamState {
    fn new(account_id: u64, role: TrafficRole, max_buffer: usize) -> Self {
        Self {
            account_id,
            role,
            max_buffer,
            buffers: HashMap::new(),
            pending: HashMap::new(),
            http2_state: HashMap::new(),
        }
    }

    fn handle_event(&mut self, ev: &TlsEvent) -> Vec<ApiTrafficEvent> {
        let mut output = Vec::new();
        let conn_key = ConnKey { pid: ev.pid, ssl_ptr: ev.ssl_ptr };
        let stream_key = StreamKey { pid: ev.pid, ssl_ptr: ev.ssl_ptr, direction: ev.direction };
        let buf = self.buffers.entry(stream_key).or_insert_with(Vec::new);
        let data_len = ev.data_len as usize;
        if data_len == 0 {
            return output;
        }
        buf.extend_from_slice(&ev.data[..data_len]);
        if buf.len() > self.max_buffer {
            let drain = buf.len() - self.max_buffer;
            buf.drain(0..drain);
        }

        let ts_ms = ev.ts_ns / 1_000_000;
        let is_request_dir = match self.role {
            TrafficRole::Server => ev.direction == 0,
            TrafficRole::Client => ev.direction == 1,
        };

        let http2_conn = self.http2_state.entry(conn_key.clone()).or_default();
        http2_conn.buffer.extend_from_slice(&ev.data[..data_len]);
        if !http2_conn.seen_preface && contains_http2_preface(&http2_conn.buffer) {
            http2_conn.seen_preface = true;
        }
        if http2_conn.seen_preface {
            buf.clear();
            output.extend(self.process_http2_event(
                conn_key.clone(),
                http2_conn,
                ev,
                ts_ms,
                is_request_dir,
            ));
            return output;
        }

        let mut parsed = Vec::new();
        while let Some((msg, remaining)) = extract_http_header(buf) {
            parsed.push(msg);
            *buf = remaining;
        }

        for msg in parsed {
            match msg {
                HttpMessage::Request(req) => {
                    if is_request_dir {
                        self.pending.entry(conn_key.clone()).or_default().push_back(ParsedRequest {
                            method: req.method,
                            path: req.path,
                            host: req.host,
                            headers: req.headers,
                            ts_ms,
                        });
                    }
                }
                HttpMessage::Response(resp) => {
                    let is_response_dir = !is_request_dir;
                    if !is_response_dir {
                        continue;
                    }
                    let request = self.pending
                        .entry(conn_key.clone())
                        .or_default()
                        .pop_front()
                        .unwrap_or_else(|| ParsedRequest {
                            method: "UNKNOWN".to_string(),
                            path: "/".to_string(),
                            host: None,
                            headers: HashMap::new(),
                            ts_ms,
                        });
                    let latency_ms = ts_ms.saturating_sub(request.ts_ms);
                    output.push(build_event(
                        self.account_id,
                        ts_ms,
                        request,
                        resp,
                        latency_ms,
                        "HTTP/1.1",
                        "ebpf",
                    ));
                }
            }
        }

        output
    }

    fn process_http2_event(
        &mut self,
        conn_key: ConnKey,
        conn_state: &mut Http2Conn,
        ev: &TlsEvent,
        ts_ms: u64,
        is_request_dir: bool,
    ) -> Vec<ApiTrafficEvent> {
        let mut output = Vec::new();
        if conn_state.buffer.len() > self.max_buffer * 2 {
            let drain = conn_state.buffer.len() - self.max_buffer;
            conn_state.buffer.drain(0..drain);
        }
        let headers = parse_http2_metadata(&conn_state.buffer);
        if is_request_dir {
            if let Some(method) = headers.get(":method") {
                let path = headers.get(":path").cloned().unwrap_or_else(|| "/".to_string());
                let host = headers.get(":authority").cloned();
                    conn_state.pending_request = Some(ParsedRequest {
                        method: method.clone(),
                        path,
                        host,
                        headers: headers.clone(),
                        ts_ms,
                    });
                    conn_state.last_request_ts = ts_ms;
                }
            } else if let Some(status) = headers.get(":status") {
                if conn_state.last_status.as_deref() == Some(status)
                    && ts_ms.saturating_sub(conn_state.last_event_ts) < 1000
                {
                    return output;
                }
                if let Some(request) = conn_state.pending_request.take() {
                    let resp = HttpResponseParsed {
                        status_code: status.parse::<i32>().unwrap_or(0),
                        headers: headers.clone(),
                    };
                    let latency_ms = ts_ms.saturating_sub(conn_state.last_request_ts);
                    let is_grpc = headers
                        .get("content-type")
                        .map(|v| v.contains("grpc"))
                        .unwrap_or(false);
                    let mut event = build_event(
                        self.account_id,
                        ts_ms,
                        request,
                        resp,
                        latency_ms,
                        "HTTP/2",
                        if is_grpc { "ebpf-grpc" } else { "ebpf" },
                    );
                    event.source_ip = None;
                    output.push(event);
                }
                conn_state.last_status = Some(status.clone());
                conn_state.last_event_ts = ts_ms;
                conn_state.buffer.clear();
            }
        }
        output
    }
}

#[derive(Debug)]
struct HttpRequestParsed {
    method: String,
    path: String,
    host: Option<String>,
    headers: HashMap<String, String>,
}

#[derive(Debug)]
struct HttpResponseParsed {
    status_code: i32,
    headers: HashMap<String, String>,
}

#[derive(Debug)]
enum HttpMessage {
    Request(HttpRequestParsed),
    Response(HttpResponseParsed),
}

fn build_event(
    account_id: u64,
    ts_ms: u64,
    req: ParsedRequest,
    resp: HttpResponseParsed,
    latency_ms: u64,
    protocol: &str,
    source: &str,
) -> ApiTrafficEvent {
    let (path, query) = split_query(&req.path);
    ApiTrafficEvent {
        version: "v1".to_string(),
        event_type: "api_traffic".to_string(),
        source: source.to_string(),
        protocol: protocol.to_string(),
        account_id,
        observed_at: ts_ms,
        request: ApiRequest {
            method: req.method,
            path,
            host: req.host,
            scheme: "https".to_string(),
            headers: req.headers,
            query,
            body: None,
        },
        response: ApiResponse {
            status_code: resp.status_code,
            headers: resp.headers,
            body: None,
            latency_ms: Some(latency_ms),
        },
        collection_id: None,
        source_ip: None,
    }
}

fn split_query(path: &str) -> (String, HashMap<String, String>) {
    let mut query = HashMap::new();
    if let Some((base, qs)) = path.split_once('?') {
        for pair in qs.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            query.insert(k.to_string(), v.to_string());
        }
        return (base.to_string(), query);
    }
    (path.to_string(), query)
}

fn contains_http2_preface(buffer: &[u8]) -> bool {
    buffer.windows(HTTP2_PREFACE.len()).any(|w| w == HTTP2_PREFACE)
}

fn parse_http2_metadata(buffer: &[u8]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for key in &[":method", ":path", ":authority", ":status", "content-type"] {
        if let Some(value) = find_token_value(buffer, key) {
            map.insert(key.to_string(), value);
        }
    }
    map
}

fn find_token_value(buffer: &[u8], key: &str) -> Option<String> {
    let key_bytes = key.as_bytes();
    if buffer.len() < key_bytes.len() + 1 {
        return None;
    }
    for i in 0..buffer.len() - key_bytes.len() {
        if equals_ignore_ascii_case(&buffer[i..i + key_bytes.len()], key_bytes)
            && buffer.get(i + key_bytes.len()).map_or(false, |b| *b == b':')
        {
            let mut idx = i + key_bytes.len() + 1;
            while idx < buffer.len() && (buffer[idx] == b' ' || buffer[idx] == b'\t') {
                idx += 1;
            }
            let start = idx;
            while idx < buffer.len() && !matches!(buffer[idx], b'\r' | b'\n' | 0) {
                idx += 1;
            }
            if start < idx {
                let value = String::from_utf8_lossy(&buffer[start..idx]).trim().to_string();
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn equals_ignore_ascii_case(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter()
        .zip(b.iter())
        .all(|(x, y)| x.to_ascii_lowercase() == y.to_ascii_lowercase())
}

fn extract_http_header(buf: &[u8]) -> Option<(HttpMessage, Vec<u8>)> {
    let needle = b"\r\n\r\n";
    let pos = buf.windows(needle.len()).position(|w| w == needle)?;
    let header_bytes = &buf[..pos + needle.len()];
    let remaining = buf[pos + needle.len()..].to_vec();
    let header_str = match std::str::from_utf8(header_bytes) {
        Ok(s) => s,
        Err(_) => return Some((HttpMessage::Request(HttpRequestParsed {
            method: "UNKNOWN".to_string(),
            path: "/".to_string(),
            host: None,
            headers: HashMap::new(),
        }), remaining)),
    };
    let mut lines = header_str.split("\r\n");
    let first = lines.next().unwrap_or("");
    if first.starts_with("HTTP/") {
        let mut parts = first.split_whitespace();
        let _ = parts.next();
        let status = parts.next().unwrap_or("0").parse::<i32>().unwrap_or(0);
        let headers = parse_headers(lines);
        return Some((HttpMessage::Response(HttpResponseParsed {
            status_code: status,
            headers,
        }), remaining));
    }
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("GET").to_string();
    if !is_http_method(&method) {
        return Some((HttpMessage::Request(HttpRequestParsed {
            method: "UNKNOWN".to_string(),
            path: "/".to_string(),
            host: None,
            headers: HashMap::new(),
        }), remaining));
    }
    let path = parts.next().unwrap_or("/").to_string();
    let headers = parse_headers(lines);
    let host = headers.get("host").cloned();
    Some((HttpMessage::Request(HttpRequestParsed {
        method,
        path,
        host,
        headers,
    }), remaining))
}

fn parse_headers<'a>(lines: impl Iterator<Item = &'a str>) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    for line in lines {
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }
    headers
}

fn is_http_method(method: &str) -> bool {
    matches!(
        method,
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "TRACE" | "CONNECT"
    )
}

fn discover_tls_libs(pid: i32) -> Vec<String> {
    if pid <= 0 {
        return Vec::new();
    }
    let mut libs = HashMap::<String, bool>::new();
    let maps_path = format!("/proc/{}/maps", pid);
    let Ok(contents) = fs::read_to_string(&maps_path) else {
        return Vec::new();
    };
    for line in contents.lines() {
        if let Some(path) = line.split_whitespace().nth(5) {
            if path.contains("libssl") || path.contains("libgnutls") {
                libs.insert(path.to_string(), true);
            }
        }
    }
    libs.keys().cloned().collect()
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    let obj_data = fs::read(&args.bpf)?;
    let mut obj = ObjectBuilder::default().open_memory("http_trace", &obj_data)?.load()?;

    let role = match args.role.as_str() {
        "client" => TrafficRole::Client,
        _ => TrafficRole::Server,
    };

    let mut links = Vec::new();
    let mut tls_libs = args.tls_libs.clone();
    if args.discover_libs {
        let discovered = discover_tls_libs(args.pid);
        if !discovered.is_empty() {
            tls_libs = discovered;
        }
    }
    attach_tls_uprobes(&mut obj, &args, &tls_libs, &mut links)?;

    let (tx, mut rx) = mpsc::channel::<ApiTrafficEvent>(10000);

    let ingest_url = args.ingest.clone();
    let api_key = args.api_key.clone();
    let batch_size = args.batch_size;
    tokio::spawn(async move {
        let mut batch: Vec<ApiTrafficEvent> = Vec::new();
        loop {
            if let Some(ev) = rx.recv().await {
                batch.push(ev);
                if batch.len() >= batch_size {
                    let payload = std::mem::take(&mut batch);
                    let _ = send_batch(&ingest_url, &api_key, payload).await;
                }
            }
        }
    });

    let state = Arc::new(Mutex::new(StreamState::new(args.account_id, role, args.max_buffer_bytes)));
    let mut ringbuf = RingBufferBuilder::new();
    let sender = tx.clone();
    let state_handle = state.clone();
    ringbuf.add(obj.map_mut("events")?, move |data| {
        if data.len() < size_of::<TlsEvent>() {
            return 0;
        }
        let ev = unsafe { std::ptr::read_unaligned(data.as_ptr() as *const TlsEvent) };
        let mut guard = match state_handle.lock() {
            Ok(g) => g,
            Err(_) => return 0,
        };
        let events = guard.handle_event(&ev);
        for item in events {
            let _ = sender.try_send(item);
        }
        0
    })?;

    let mut ringbuf = ringbuf.build()?;
    loop {
        ringbuf.poll(Duration::from_millis(200))?;
    }
}

fn attach_tls_uprobes(
    obj: &mut libbpf_rs::Object,
    args: &Args,
    tls_libs: &[String],
    links: &mut Vec<libbpf_rs::Link>,
) -> Result<()> {
    let provider = args.tls_provider.as_str();
    let pid = args.pid;
    let mut attached = 0;
    for lib in tls_libs {
        if provider == "auto" || provider == "openssl" {
            if attach_symbol(obj, "ssl_write_entry", lib, "SSL_write", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_write_exit", lib, "SSL_write", true, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_read_entry", lib, "SSL_read", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_read_exit", lib, "SSL_read", true, pid, links).is_ok() {
                attached += 1;
            }
            // Optional OpenSSL 1.1+/3.x extended symbols
            if attach_symbol(obj, "ssl_read_ex_entry", lib, "SSL_read_ex", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_read_ex_exit", lib, "SSL_read_ex", true, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_write_ex_entry", lib, "SSL_write_ex", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "ssl_write_ex_exit", lib, "SSL_write_ex", true, pid, links).is_ok() {
                attached += 1;
            }
        }
        if provider == "auto" || provider == "gnutls" {
            if attach_symbol(obj, "gnutls_send_entry", lib, "gnutls_record_send", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "gnutls_send_exit", lib, "gnutls_record_send", true, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "gnutls_recv_entry", lib, "gnutls_record_recv", false, pid, links).is_ok() {
                attached += 1;
            }
            if attach_symbol(obj, "gnutls_recv_exit", lib, "gnutls_record_recv", true, pid, links).is_ok() {
                attached += 1;
            }
        }
    }
    if attached == 0 {
        anyhow::bail!("no TLS uprobes attached; verify --tls-libs or --discover-libs and symbols");
    }
    Ok(())
}

fn attach_symbol(
    obj: &mut libbpf_rs::Object,
    prog_name: &str,
    binary: &str,
    symbol: &str,
    retprobe: bool,
    pid: i32,
    links: &mut Vec<libbpf_rs::Link>,
) -> Result<()> {
    let prog = obj
        .prog_mut(prog_name)
        .with_context(|| format!("missing BPF program {}", prog_name))?;
    let mut builder = UprobeBuilder::new(prog);
    builder.binary(binary).symbol(symbol).retprobe(retprobe);
    if pid > 0 {
        builder.pid(pid);
    }
    let link = builder.attach().with_context(|| format!("attach {} to {}", prog_name, symbol))?;
    links.push(link);
    Ok(())
}

async fn send_batch(url: &str, api_key: &str, events: Vec<ApiTrafficEvent>) -> Result<()> {
    let client = reqwest::Client::new();
    let body = EventBatch {
        version: "v1".to_string(),
        events,
    };
    let resp = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("ingest failed: {}", text);
    }
    Ok(())
}
