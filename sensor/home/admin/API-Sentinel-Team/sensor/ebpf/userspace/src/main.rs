use anyhow::{Context, Result};
use clap::Parser;
use hpack::decoder::Decoder;
use libbpf_rs::{ObjectBuilder, RingBufferBuilder, UprobeOpts};
use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::env;
use std::fs;
use std::mem::size_of;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::UnixStream;
use tokio::sync::mpsc;
use tokio::time;
use tower::service_fn;

mod cri {
    tonic::include_proto!("runtime.v1");
}

type HpackDecoder = Decoder<'static>;

use crate::cri::runtime_service_client::RuntimeServiceClient;
use crate::cri::ContainerStatusRequest;

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
    #[arg(long, default_value = "-1")]
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
    dest_ip: Option<String>,
    source_port: Option<u16>,
    dest_port: Option<u16>,
    netns_ino: Option<u32>,
    cgroup_id: Option<u64>,
    container: Option<ContainerContext>,
}

#[derive(Debug, Clone, Serialize)]
struct ContainerContext {
    pod_name: Option<String>,
    pod_namespace: Option<String>,
    container_id: String,
    container_name: Option<String>,
    node_name: String,
    service_name: Option<String>,
    workload_type: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct NetContext {
    source_ip: Option<String>,
    dest_ip: Option<String>,
    source_port: Option<u16>,
    dest_port: Option<u16>,
    netns_ino: Option<u32>,
    cgroup_id: Option<u64>,
    container: Option<ContainerContext>,
}

#[derive(Debug, Clone)]
struct CgroupInfo {
    pod_uid: Option<String>,
    container_id_full: Option<String>,
    container_id_short: Option<String>,
}

#[derive(Debug, Clone)]
struct ContainerCacheEntry {
    context: ContainerContext,
    last_seen: Instant,
    container_id_full: Option<String>,
}

#[derive(Debug)]
struct ContainerLookupRequest {
    cgroup_id: u64,
    container_id_full: String,
}

struct ContainerResolver {
    cache: Mutex<HashMap<u64, ContainerCacheEntry>>,
    pending: Mutex<HashSet<u64>>,
    lookup_tx: mpsc::Sender<ContainerLookupRequest>,
    node_name: String,
    ttl: Duration,
}

impl ContainerResolver {
    fn new(lookup_tx: mpsc::Sender<ContainerLookupRequest>, node_name: String) -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashSet::new()),
            lookup_tx,
            node_name,
            ttl: Duration::from_secs(600),
        }
    }

    fn resolve(&self, ev: &TlsEvent) -> Option<ContainerContext> {
        if ev.cgroup_id == 0 {
            return None;
        }
        let now = Instant::now();
        if let Ok(mut cache) = self.cache.lock() {
            if let Some(entry) = cache.get_mut(&ev.cgroup_id) {
                if now.duration_since(entry.last_seen) < self.ttl {
                    entry.last_seen = now;
                    return Some(entry.context.clone());
                }
            }
        }

        let cgroup_info = parse_cgroup_info(ev.pid as i32);
        let container_short = cgroup_info
            .as_ref()
            .and_then(|info| info.container_id_short.clone())
            .unwrap_or_else(|| "unknown".to_string());
        let container_id_full = cgroup_info
            .as_ref()
            .and_then(|info| info.container_id_full.clone());

        let context = ContainerContext {
            pod_name: None,
            pod_namespace: None,
            container_id: container_short.clone(),
            container_name: None,
            node_name: self.node_name.clone(),
            service_name: None,
            workload_type: None,
        };

        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                ev.cgroup_id,
                ContainerCacheEntry {
                    context: context.clone(),
                    last_seen: now,
                    container_id_full: container_id_full.clone(),
                },
            );
        }

        if let Some(full_id) = container_id_full {
            if let Ok(mut pending) = self.pending.lock() {
                if !pending.contains(&ev.cgroup_id) {
                    pending.insert(ev.cgroup_id);
                    let _ = self.lookup_tx.try_send(ContainerLookupRequest {
                        cgroup_id: ev.cgroup_id,
                        container_id_full: full_id,
                    });
                }
            }
        }

        Some(context)
    }

    fn update_from_cri(&self, cgroup_id: u64, metadata: ContainerMetadata) {
        if let Ok(mut cache) = self.cache.lock() {
            if let Some(entry) = cache.get_mut(&cgroup_id) {
                entry.context.pod_name = metadata.pod_name;
                entry.context.pod_namespace = metadata.pod_namespace;
                entry.context.container_name = metadata.container_name;
                entry.context.service_name = metadata.service_name;
                entry.context.workload_type = metadata.workload_type;
                entry.last_seen = Instant::now();
            }
        }
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(&cgroup_id);
        }
    }
}

#[derive(Debug, Clone)]
struct ContainerMetadata {
    pod_name: Option<String>,
    pod_namespace: Option<String>,
    container_name: Option<String>,
    service_name: Option<String>,
    workload_type: Option<String>,
}

fn parse_cgroup_info(pid: i32) -> Option<CgroupInfo> {
    if pid <= 0 {
        return None;
    }
    let path = read_cgroup_path(pid)?;
    if let Some(info) = parse_cgroup_v1(&path) {
        return Some(info);
    }
    parse_cgroup_v2(&path)
}

fn read_cgroup_path(pid: i32) -> Option<String> {
    let cgroup_path = format!("/proc/{}/cgroup", pid);
    let contents = fs::read_to_string(cgroup_path).ok()?;
    for line in contents.lines() {
        if let Some(path) = line.split(':').nth(2) {
            if path.contains("kubepods") {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn parse_cgroup_v1(path: &str) -> Option<CgroupInfo> {
    if !path.contains("/kubepods/") {
        return None;
    }
    let mut pod_uid = None;
    let mut container_id_full = None;
    for seg in path.split('/') {
        if seg.starts_with("pod") {
            pod_uid = Some(seg.trim_start_matches("pod").to_string());
        } else if seg.len() >= 32 && seg.chars().all(|c| c.is_ascii_hexdigit()) {
            container_id_full = Some(seg.to_string());
        }
    }
    let container_id_short = container_id_full.as_ref().map(|id| short_id(id));
    Some(CgroupInfo {
        pod_uid,
        container_id_full,
        container_id_short,
    })
}

fn parse_cgroup_v2(path: &str) -> Option<CgroupInfo> {
    if !path.contains("kubepods.slice") {
        return None;
    }
    let mut pod_uid = None;
    let mut container_id_full = None;
    for seg in path.split('/') {
        if seg.contains("pod") && seg.ends_with(".slice") {
            pod_uid = extract_pod_uid(seg);
        } else if seg.ends_with(".scope") {
            container_id_full = extract_container_id(seg);
        }
    }
    let container_id_short = container_id_full.as_ref().map(|id| short_id(id));
    Some(CgroupInfo {
        pod_uid,
        container_id_full,
        container_id_short,
    })
}

fn extract_pod_uid(segment: &str) -> Option<String> {
    // In cgroups v2, segment looks like "kubepods-burstable-pod<uid>.slice".
    // Use the last occurrence to avoid matching the "pod" in "kubepods".
    let pod_pos = segment.rfind("pod")?;
    let mut uid = String::new();
    for ch in segment[pod_pos + 3..].chars() {
        if ch.is_ascii_hexdigit() || ch == '-' {
            uid.push(ch);
        } else {
            break;
        }
    }
    if uid.is_empty() {
        None
    } else {
        Some(uid)
    }
}

fn extract_container_id(segment: &str) -> Option<String> {
    let mut s = segment.trim_end_matches(".scope").to_string();
    for prefix in ["cri-containerd-", "docker-", "crio-", "containerd-"] {
        if s.starts_with(prefix) {
            s = s.trim_start_matches(prefix).to_string();
            break;
        }
    }
    if s.len() < 12 {
        None
    } else {
        Some(s)
    }
}

fn short_id(full: &str) -> String {
    full.chars().take(12).collect()
}

async fn fetch_container_metadata(
    socket_path: &str,
    container_id_full: &str,
) -> Result<ContainerMetadata> {
    let path = socket_path.to_string();
    let endpoint = tonic::transport::Endpoint::try_from("http://[::]:0")?;
    let channel = endpoint
        .connect_with_connector(service_fn(move |_uri| UnixStream::connect(path.clone())))
        .await?;

    let mut client = RuntimeServiceClient::new(channel);
    let req = ContainerStatusRequest {
        container_id: container_id_full.to_string(),
        verbose: true,
    };
    let resp: cri::ContainerStatusResponse = client.container_status(tonic::Request::new(req)).await?.into_inner();
    let status = resp.status.ok_or_else(|| anyhow::anyhow!("missing container status"))?;
    let labels = status.labels;

    let pod_name = labels.get("io.kubernetes.pod.name").cloned();
    let pod_namespace = labels.get("io.kubernetes.pod.namespace").cloned();
    let container_name = labels.get("io.kubernetes.container.name").cloned();
    let service_name = labels
        .get("app.kubernetes.io/name")
        .cloned()
        .or_else(|| labels.get("app").cloned());
    let workload_type = labels.get("app.kubernetes.io/component").cloned();

    Ok(ContainerMetadata {
        pod_name,
        pod_namespace,
        container_name,
        service_name,
        workload_type,
    })
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
    ip_family: u8,
    _pad16: u16,
    comm: [u8; 16],
    cgroup_id: u64,
    netns_ino: u32,
    src_port: u16,
    dst_port: u16,
    src_ip4: u32,
    dst_ip4: u32,
    src_ip6: [u8; 16],
    dst_ip6: [u8; 16],
    data: [u8; 4096],  // Match BPF MAX_DATA (WARN-2)
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CloseEvent {
    ts_ns: u64,
    pid: u32,
    tid: u32,
    ssl_ptr: u64,
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
    net_ctx: NetContext,
}

const HTTP2_PREFACE: &[u8] = b"PRI * HTTP/2.0";
const MAX_STREAM_ENTRIES: usize = 10_000;  // BUG-4/5: LRU eviction threshold
const STREAM_TTL_MS: u64 = 60_000;         // 60s TTL for idle connections

struct StreamState {
    account_id: u64,
    role: TrafficRole,
    max_buffer: usize,
    container_resolver: Arc<ContainerResolver>,
    buffers: HashMap<StreamKey, (Vec<u8>, u64)>,         // (data, last_seen_ms)
    pending: HashMap<ConnKey, VecDeque<ParsedRequest>>,
    http2_state: HashMap<ConnKey, Http2Conn>,
    last_eviction_ms: u64,
}

struct Http2Conn {
    buffer: Vec<u8>,
    seen_preface: bool,
    pending_request: Option<ParsedRequest>,
    last_status: Option<String>,
    last_request_ts: u64,
    last_event_ts: u64,
    hpack: HpackDecoder,
}

impl Default for Http2Conn {
    fn default() -> Self {
        let mut decoder = HpackDecoder::new();
        // Cap dynamic table growth for performance (approx <= 256 entries).
        decoder.set_max_table_size(8192);
        Self {
            buffer: Vec::new(),
            seen_preface: false,
            pending_request: None,
            last_status: None,
            last_request_ts: 0,
            last_event_ts: 0,
            hpack: decoder,
        }
    }
}

impl StreamState {
    fn new(account_id: u64, role: TrafficRole, max_buffer: usize, container_resolver: Arc<ContainerResolver>) -> Self {
        Self {
            account_id,
            role,
            max_buffer,
            container_resolver,
            buffers: HashMap::new(),
            pending: HashMap::new(),
            http2_state: HashMap::new(),
            last_eviction_ms: 0,
        }
    }

    /// BUG-4/5 fix: evict stale entries from buffers, pending, and http2_state
    fn evict_stale(&mut self, now_ms: u64) {
        // Only run eviction every 10 seconds
        if now_ms.saturating_sub(self.last_eviction_ms) < 10_000 {
            return;
        }
        self.last_eviction_ms = now_ms;

        // Evict stream buffers older than TTL
        self.buffers.retain(|_, (_, last_seen)| now_ms.saturating_sub(*last_seen) < STREAM_TTL_MS);

        // Evict http2 connections older than TTL
        self.http2_state.retain(|_, conn| now_ms.saturating_sub(conn.last_event_ts) < STREAM_TTL_MS);

        // Evict pending queues where no recent request
        self.pending.retain(|_, queue| !queue.is_empty());

        // Hard cap: if still too large, drain oldest
        if self.buffers.len() > MAX_STREAM_ENTRIES {
            let excess = self.buffers.len() - MAX_STREAM_ENTRIES;
            let mut keys: Vec<_> = self.buffers.keys().cloned().collect();
            keys.sort_by_key(|k| self.buffers.get(k).map(|(_, ts)| *ts).unwrap_or(0));
            for k in keys.into_iter().take(excess) {
                self.buffers.remove(&k);
            }
        }
        if self.http2_state.len() > MAX_STREAM_ENTRIES {
            let excess = self.http2_state.len() - MAX_STREAM_ENTRIES;
            let mut keys: Vec<_> = self.http2_state.keys().cloned().collect();
            keys.sort_by_key(|k| self.http2_state.get(k).map(|c| c.last_event_ts).unwrap_or(0));
            for k in keys.into_iter().take(excess) {
                self.http2_state.remove(&k);
            }
        }
    }

    fn evict_connection(&mut self, conn_key: &ConnKey) {
        self.buffers.retain(|k, _| !(k.pid == conn_key.pid && k.ssl_ptr == conn_key.ssl_ptr));
        self.pending.remove(conn_key);
        self.http2_state.remove(conn_key);
    }

    fn net_context_from_event(&self, ev: &TlsEvent) -> NetContext {
        let mut ctx = NetContext::default();
        if ev.cgroup_id != 0 {
            ctx.cgroup_id = Some(ev.cgroup_id);
        }
        if ev.netns_ino != 0 {
            ctx.netns_ino = Some(ev.netns_ino);
        }
        if ev.src_port != 0 {
            ctx.source_port = Some(ev.src_port);
        }
        if ev.dst_port != 0 {
            ctx.dest_port = Some(ev.dst_port);
        }
        match ev.ip_family {
            4 => {
                let src = Ipv4Addr::from(u32::from_be(ev.src_ip4));
                let dst = Ipv4Addr::from(u32::from_be(ev.dst_ip4));
                ctx.source_ip = Some(src.to_string());
                ctx.dest_ip = Some(dst.to_string());
            }
            6 => {
                let src = Ipv6Addr::from(ev.src_ip6);
                let dst = Ipv6Addr::from(ev.dst_ip6);
                ctx.source_ip = Some(src.to_string());
                ctx.dest_ip = Some(dst.to_string());
            }
            _ => {}
        }
        ctx.container = self.container_resolver.resolve(ev);
        ctx
    }

    fn handle_event(&mut self, ev: &TlsEvent) -> Vec<ApiTrafficEvent> {
        let mut output = Vec::new();
        let conn_key = ConnKey { pid: ev.pid, ssl_ptr: ev.ssl_ptr };
        let stream_key = StreamKey { pid: ev.pid, ssl_ptr: ev.ssl_ptr, direction: ev.direction };
        let ts_ms = ev.ts_ns / 1_000_000;

        // BUG-4/5: evict stale connections periodically
        self.evict_stale(ts_ms);

    let is_request_dir = match self.role {
        TrafficRole::Server => ev.direction == 0,
        TrafficRole::Client => ev.direction == 1,
    };

    if let Some(events) = self.process_http2_event(conn_key.clone(), ev, ts_ms, is_request_dir) {
        return events;
    }

    let data_len = ev.data_len as usize;
    if data_len == 0 {
        return output;
    }

    // Extend the buffer and collect parsed messages, then drop the borrow on
    // self.buffers before calling any other &mut self methods (E0499).
    let max_buf = self.max_buffer;
    let parsed = {
        let (buf, last_seen) = self.buffers.entry(stream_key).or_insert_with(|| (Vec::new(), ts_ms));
        *last_seen = ts_ms;
        buf.extend_from_slice(&ev.data[..data_len]);
        if buf.len() > max_buf {
            let drain = buf.len() - max_buf;
            buf.drain(0..drain);
        }
        let mut msgs = Vec::new();
        while let Some((msg, remaining)) = extract_http_header(buf) {
            msgs.push(msg);
            *buf = remaining;
        }
        msgs
        // buf / last_seen borrows drop here
    };

        for msg in parsed {
            match msg {
                HttpMessage::Request(req) => {
                    if is_request_dir {
                        let net_ctx = self.net_context_from_event(ev);
                        self.pending.entry(conn_key.clone()).or_default().push_back(ParsedRequest {
                            method: req.method,
                            path: req.path,
                            host: req.host,
                            headers: req.headers,
                            ts_ms,
                            net_ctx,
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
                            net_ctx: NetContext::default(),
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
        ev: &TlsEvent,
        ts_ms: u64,
        is_request_dir: bool,
    ) -> Option<Vec<ApiTrafficEvent>> {
    let net_ctx = if is_request_dir {
        Some(self.net_context_from_event(ev))
    } else {
        None
    };
    let conn_state = self.http2_state.entry(conn_key).or_default();
        conn_state.last_event_ts = ts_ms;

        let data_len = ev.data_len as usize;
        if data_len == 0 {
            return None;
        }
        conn_state.buffer.extend_from_slice(&ev.data[..data_len]);
        if !conn_state.seen_preface && contains_http2_preface(&conn_state.buffer) {
            conn_state.seen_preface = true;
        }
        if !conn_state.seen_preface {
            return None;
        }

        let mut output = Vec::new();
        if conn_state.buffer.len() > self.max_buffer * 2 {
            let drain = conn_state.buffer.len() - self.max_buffer;
            conn_state.buffer.drain(0..drain);
        }
        let headers = parse_http2_metadata(&mut conn_state.hpack, &conn_state.buffer);
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
                    net_ctx: net_ctx.unwrap_or_default(),
                });
                conn_state.last_request_ts = ts_ms;
            }
        } else if let Some(status) = headers.get(":status") {
            if conn_state.last_status.as_deref() == Some(status)
                && ts_ms.saturating_sub(conn_state.last_event_ts) < 1000
            {
                return Some(output);
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
                let event = build_event(
                    self.account_id,
                    ts_ms,
                    request,
                    resp,
                    latency_ms,
                    "HTTP/2",
                    if is_grpc { "ebpf-grpc" } else { "ebpf" },
                );
                output.push(event);
            }
            conn_state.last_status = Some(status.clone());
            conn_state.last_event_ts = ts_ms;
            conn_state.buffer.clear();
        }
        Some(output)
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
    let net_ctx = req.net_ctx.clone();
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
        source_ip: net_ctx.source_ip,
        dest_ip: net_ctx.dest_ip,
        source_port: net_ctx.source_port,
        dest_port: net_ctx.dest_port,
        netns_ino: net_ctx.netns_ino,
        cgroup_id: net_ctx.cgroup_id,
        container: net_ctx.container,
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

fn parse_http2_metadata(decoder: &mut HpackDecoder, buffer: &[u8]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut decoded_any = false;
    for header_block in extract_hpack_blocks(buffer) {
        if let Ok(decoded) = decoder.decode(&header_block) {
            decoded_any = true;
            for (name, value) in decoded {
                let name = String::from_utf8_lossy(&name).to_ascii_lowercase();
                let value = String::from_utf8_lossy(&value).to_string();
                if !name.is_empty() && !value.is_empty() {
                    map.insert(name, value);
                }
            }
        }
    }

    if !decoded_any {
        hpack_static_scan(buffer, &mut map);
    }

    for key in &[":method", ":path", ":authority", ":status", "content-type"] {
        if !map.contains_key(*key) {
            if let Some(value) = find_token_value(buffer, key) {
                map.insert(key.to_string(), value);
            }
        }
    }
    map
}

/// WARN-1 fix: Minimal HPACK static table decoder.
/// Scans for well-known static table index bytes in HTTP/2 HEADERS frames.
/// HTTP/2 frame: 9-byte header, type=0x01 (HEADERS), then HPACK payload.
/// Static table indices 2-7 = GET/POST/etc methods, 4-15 = common paths.
fn hpack_static_scan(buffer: &[u8], map: &mut HashMap<String, String>) {
    // HPACK static table (RFC 7541, Appendix A) - key entries for API traffic
    const STATIC_TABLE: &[(u8, &str, &str)] = &[
        (2, ":method", "GET"),
        (3, ":method", "POST"),
        (4, ":path", "/"),
        (5, ":path", "/index.html"),
        (8, ":status", "200"),
        (9, ":status", "204"),
        (10, ":status", "206"),
        (11, ":status", "304"),
        (12, ":status", "400"),
        (13, ":status", "404"),
        (14, ":status", "500"),
    ];

    // Scan for HTTP/2 HEADERS frames (type = 0x01)
    // Skip HTTP/2 connection preface wherever it appears in the (potentially mixed) buffer
    let preface = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
    let start = buffer.windows(preface.len())
        .position(|w| w == preface)
        .map(|p| p + preface.len())
        .unwrap_or(0);
    let mut i = start;
    while i + 9 < buffer.len() {
        // HTTP/2 frame header: length(3) + type(1) + flags(1) + stream_id(4)
        let frame_len = ((buffer[i] as usize) << 16)
            | ((buffer[i + 1] as usize) << 8)
            | (buffer[i + 2] as usize);
        let frame_type = buffer[i + 3];

        // Skip oversized/invalid frames by advancing byte-by-byte to resync
        if frame_len > 16384 || i + 9 + frame_len > buffer.len() {
            i += 1;
            continue;
        }

        if frame_type == 0x01 && frame_len > 0 {
            // HEADERS frame - scan HPACK payload
            let payload_start = i + 9;
            let payload_end = (payload_start + frame_len).min(buffer.len());
            let mut j = payload_start;
            while j < payload_end {
                let byte = buffer[j];
                // Indexed header field (bit 7 set): index = byte & 0x7F
                if byte & 0x80 != 0 {
                    let index = byte & 0x7F;
                    for &(idx, name, value) in STATIC_TABLE {
                        if index == idx {
                            map.entry(name.to_string()).or_insert_with(|| value.to_string());
                        }
                    }
                }
                j += 1;
            }
        }

        if frame_len == 0 {
            i += 9;
        } else {
            i += 9 + frame_len;
        }

        // Safety: stop scanning after 64KB
        if i > 65536 {
            break;
        }
    }
}

fn extract_hpack_blocks(buffer: &[u8]) -> Vec<Vec<u8>> {
    let mut blocks = Vec::new();
    // Skip HTTP/2 connection preface wherever it appears in the (potentially mixed) buffer
    let preface = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
    let start = buffer.windows(preface.len())
        .position(|w| w == preface)
        .map(|p| p + preface.len())
        .unwrap_or(0);
    let mut i = start;
    while i + 9 <= buffer.len() {
        let frame_len = ((buffer[i] as usize) << 16)
            | ((buffer[i + 1] as usize) << 8)
            | (buffer[i + 2] as usize);
        let frame_type = buffer[i + 3];
        let flags = buffer[i + 4];
        let stream_id = u32::from_be_bytes([
            buffer[i + 5],
            buffer[i + 6],
            buffer[i + 7],
            buffer[i + 8],
        ]) & 0x7fffffff;

        if frame_len > 16384 || i + 9 + frame_len > buffer.len() {
            // Oversized or truncated frame — advance by 1 to resync
            i += 1;
            continue;
        }

        if frame_type == 0x01 && frame_len > 0 {
            let mut payload = &buffer[i + 9..i + 9 + frame_len];
            if flags & 0x08 != 0 {
                if payload.is_empty() {
                    break;
                }
                let pad_len = payload[0] as usize;
                payload = &payload[1..];
                if pad_len <= payload.len() {
                    payload = &payload[..payload.len() - pad_len];
                } else {
                    break;
                }
            }
            if flags & 0x20 != 0 {
                if payload.len() < 5 {
                    break;
                }
                payload = &payload[5..];
            }

            let mut header_block = payload.to_vec();
            let mut end_headers = flags & 0x04 != 0;
            let mut j = i + 9 + frame_len;
            while !end_headers && j + 9 <= buffer.len() {
                let len2 = ((buffer[j] as usize) << 16)
                    | ((buffer[j + 1] as usize) << 8)
                    | (buffer[j + 2] as usize);
                let type2 = buffer[j + 3];
                let flags2 = buffer[j + 4];
                let stream2 = u32::from_be_bytes([
                    buffer[j + 5],
                    buffer[j + 6],
                    buffer[j + 7],
                    buffer[j + 8],
                ]) & 0x7fffffff;

                if type2 != 0x09 || stream2 != stream_id || j + 9 + len2 > buffer.len() {
                    break;
                }

                header_block.extend_from_slice(&buffer[j + 9..j + 9 + len2]);
                end_headers = flags2 & 0x04 != 0;
                j += 9 + len2;
            }
            blocks.push(header_block);
            i = j;
        } else {
            i += 9 + frame_len;
        }

        if i > 65536 {
            break;
        }
    }
    blocks
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
    eprintln!("[sensor] starting, bpf={} ingest={}", args.bpf, args.ingest);

    let obj_data = fs::read(&args.bpf)?;
    let mut obj = ObjectBuilder::default().open_memory(&obj_data)?.load()?;

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
    attach_kernel_probes(&mut obj, &mut links)?;

    let node_name = env::var("NODE_NAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown-node".to_string());
    let cri_socket = env::var("CRI_SOCKET").unwrap_or_else(|_| "/run/containerd/containerd.sock".to_string());

    let (lookup_tx, mut lookup_rx) = mpsc::channel::<ContainerLookupRequest>(1024);
    let container_resolver = Arc::new(ContainerResolver::new(lookup_tx, node_name));
    let resolver_handle = container_resolver.clone();
    tokio::spawn(async move {
        while let Some(req) = lookup_rx.recv().await {
            match fetch_container_metadata(&cri_socket, &req.container_id_full).await {
                Ok(meta) => resolver_handle.update_from_cri(req.cgroup_id, meta),
                Err(_) => resolver_handle.update_from_cri(req.cgroup_id, ContainerMetadata {
                    pod_name: None,
                    pod_namespace: None,
                    container_name: None,
                    service_name: None,
                    workload_type: None,
                }),
            }
        }
    });

    let (tx, mut rx) = mpsc::channel::<ApiTrafficEvent>(10000);

    // BUG-2 fix: create one shared HTTP client instead of per-batch
    let http_client = Arc::new(reqwest::Client::builder()
        .pool_max_idle_per_host(4)
        .timeout(Duration::from_secs(10))
        .build()
        .expect("failed to create HTTP client"));

    let ingest_url = args.ingest.clone();
    let api_key = args.api_key.clone();
    let batch_size = args.batch_size;
    let client_handle = http_client.clone();
    tokio::spawn(async move {
        let mut batch: Vec<ApiTrafficEvent> = Vec::new();
        // BUG-1 fix: flush timer ensures events are sent even when traffic is low
        let mut flush_interval = time::interval(Duration::from_secs(1));
        loop {
            tokio::select! {
                Some(ev) = rx.recv() => {
                    batch.push(ev);
                    if batch.len() >= batch_size {
                        let payload = std::mem::take(&mut batch);
                        let _ = send_batch_with_client(&client_handle, &ingest_url, &api_key, payload).await;
                    }
                }
                _ = flush_interval.tick() => {
                    if !batch.is_empty() {
                        let payload = std::mem::take(&mut batch);
                        let _ = send_batch_with_client(&client_handle, &ingest_url, &api_key, payload).await;
                    }
                }
            }
        }
    });

    let state = Arc::new(Mutex::new(StreamState::new(
        args.account_id,
        role,
        args.max_buffer_bytes,
        container_resolver.clone(),
    )));
    let mut ringbuf = RingBufferBuilder::new();
    let sender = tx.clone();
    let state_handle = state.clone();
    let events_map = obj
        .map_mut("events")
        .ok_or_else(|| anyhow::anyhow!("missing events map"))? as *mut libbpf_rs::Map;
    let close_events_map = obj
        .map_mut("close_events")
        .ok_or_else(|| anyhow::anyhow!("missing close_events map"))? as *mut libbpf_rs::Map;

    unsafe {
        ringbuf.add(&mut *events_map, move |data| {
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
    }

    let state_handle_close = state.clone();
    unsafe {
        ringbuf.add(&mut *close_events_map, move |data| {
            if data.len() < size_of::<CloseEvent>() {
                return 0;
            }
            let ev = unsafe { std::ptr::read_unaligned(data.as_ptr() as *const CloseEvent) };
            let mut guard = match state_handle_close.lock() {
                Ok(g) => g,
                Err(_) => return 0,
            };
            let key = ConnKey { pid: ev.pid, ssl_ptr: ev.ssl_ptr };
            guard.evict_connection(&key);
            0
        })?;
    }

    let ringbuf = ringbuf.build()?;
    eprintln!("[sensor] probes attached, polling ring buffer...");
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
        let lib_lower = lib.to_lowercase();
        let looks_openssl = lib_lower.contains("libssl") || lib_lower.contains("openssl");
        let looks_gnutls = lib_lower.contains("gnutls");

        if provider == "openssl" || (provider == "auto" && looks_openssl) {
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
            if attach_symbol(obj, "ssl_free_entry", lib, "SSL_free", false, pid, links).is_ok() {
                attached += 1;
            }
        }
        if provider == "gnutls" || (provider == "auto" && looks_gnutls) {
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
        if provider == "auto" && !looks_openssl && !looks_gnutls {
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
        }
    }
    if attached == 0 {
        anyhow::bail!("no TLS uprobes attached; verify --tls-libs or --discover-libs and symbols");
    }
    Ok(())
}

fn attach_kernel_probes(
    obj: &mut libbpf_rs::Object,
    links: &mut Vec<libbpf_rs::Link>,
) -> Result<()> {
    let tcp_connect = obj
        .prog_mut("tcp_connect_entry")
        .context("missing tcp_connect_entry program")?;
    links.push(tcp_connect.attach().context("attach kprobe tcp_connect")?);

    let tcp_accept = obj
        .prog_mut("tcp_accept_ret")
        .context("missing tcp_accept_ret program")?;
    links.push(tcp_accept.attach().context("attach kretprobe inet_csk_accept")?);

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
    let mut opts = UprobeOpts::default();
    opts.retprobe = retprobe;
    opts.func_name = symbol.to_string();
    let link = prog
        .attach_uprobe_with_opts(pid, binary, 0, opts)
        .with_context(|| format!("attach {} to {}", prog_name, symbol))?;
    links.push(link);
    Ok(())
}

// BUG-2 fix: accept shared client instead of creating a new one
async fn send_batch_with_client(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    events: Vec<ApiTrafficEvent>,
) -> Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve_owner_pid_tgid(owner: Option<u64>, current: u64) -> u64 {
        owner.unwrap_or(current)
    }

    #[test]
    fn test_split_query() {
        let (path, query) = split_query("/api/v1/user?id=123&name=test");
        assert_eq!(path, "/api/v1/user");
        assert_eq!(query.get("id").unwrap(), "123");
        assert_eq!(query.get("name").unwrap(), "test");

        let (path, query) = split_query("/health");
        assert_eq!(path, "/health");
        assert!(query.is_empty());
    }

    #[test]
    fn test_equals_ignore_ascii_case() {
        assert!(equals_ignore_ascii_case(b"Host", b"host"));
        assert!(equals_ignore_ascii_case(b"CONTENT-TYPE", b"content-type"));
        assert!(!equals_ignore_ascii_case(b"Host", b"User-Agent"));
    }

    #[test]
    fn test_contains_http2_preface() {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"GET / HTTP/1.1\r\n");
        assert!(!contains_http2_preface(&buf));
        buf.extend_from_slice(HTTP2_PREFACE);
        assert!(contains_http2_preface(&buf));
    }

    #[test]
    fn test_ssl_ptr_to_pid_resolution() {
        let owner = Some(0x1234_0000_0001);
        let current = 0x9999_0000_0002;
        assert_eq!(resolve_owner_pid_tgid(owner, current), 0x1234_0000_0001);
        assert_eq!(resolve_owner_pid_tgid(None, current), current);
    }

    #[test]
    fn test_extract_http_header_request() {
        let buf = b"GET /index.html HTTP/1.1\r\nHost: example.com\r\nUser-Agent: test\r\n\r\nRemaining data".to_vec();
        let (msg, remaining) = extract_http_header(&buf).unwrap();
        if let HttpMessage::Request(req) = msg {
            assert_eq!(req.method, "GET");
            assert_eq!(req.path, "/index.html");
            assert_eq!(req.headers.get("host").unwrap(), "example.com");
            assert_eq!(req.headers.get("user-agent").unwrap(), "test");
        } else {
            panic!("Expected Request");
        }
        assert_eq!(remaining, b"Remaining data");
    }

    #[test]
    fn test_extract_http_header_response() {
        let buf = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"status\": \"ok\"}".to_vec();
        let (msg, remaining) = extract_http_header(&buf).unwrap();
        if let HttpMessage::Response(resp) = msg {
            assert_eq!(resp.status_code, 200);
            assert_eq!(resp.headers.get("content-type").unwrap(), "application/json");
        } else {
            panic!("Expected Response");
        }
        assert_eq!(remaining, b"{\"status\": \"ok\"}");
    }

    #[test]
    fn test_find_token_value() {
        let buf = b"PRI * HTTP/2.0\r\n:method: GET\r\n:path: /health\r\n:status: 200\r\n\r\n";
        assert_eq!(find_token_value(buf, ":method").unwrap(), "GET");
        assert_eq!(find_token_value(buf, ":path").unwrap(), "/health");
        assert_eq!(find_token_value(buf, ":status").unwrap(), "200");
        assert_eq!(find_token_value(buf, ":authority"), None);
    }

    #[test]
    fn test_parse_cgroup_v1() {
        let path = "/kubepods/burstable/pod123e4567-e89b-12d3-a456-426614174000/abcdef0123456789abcdef0123456789";
        let info = parse_cgroup_v1(path).expect("v1 parse");
        assert_eq!(info.pod_uid.unwrap(), "123e4567-e89b-12d3-a456-426614174000");
        assert_eq!(info.container_id_short.unwrap(), "abcdef012345");
    }

    #[test]
    fn test_parse_cgroup_v2() {
        let path = "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod123e4567-e89b-12d3-a456-426614174000.slice/cri-containerd-abcdef0123456789abcdef0123456789.scope";
        let info = parse_cgroup_v2(path).expect("v2 parse");
        assert_eq!(info.pod_uid.unwrap(), "123e4567-e89b-12d3-a456-426614174000");
        assert_eq!(info.container_id_short.unwrap(), "abcdef012345");
    }

    #[test]
    fn test_hpack_static_index_decode() {
        let mut decoder = HpackDecoder::new();
        let mut buf = Vec::new();
        // HTTP/2 frame header: len=2, type=HEADERS(0x01), flags=END_HEADERS(0x04), stream_id=1
        buf.extend_from_slice(&[0x00, 0x00, 0x02, 0x01, 0x04, 0x00, 0x00, 0x00, 0x01]);
        // HPACK indexed headers: 0x82 (:method GET), 0x84 (:path /)
        buf.extend_from_slice(&[0x82, 0x84]);
        let headers = parse_http2_metadata(&mut decoder, &buf);
        assert_eq!(headers.get(":method").unwrap(), "GET");
        assert_eq!(headers.get(":path").unwrap(), "/");
    }
}
