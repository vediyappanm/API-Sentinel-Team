**eBPF Sensor (Kernel + Rust Userspace)**

This sensor captures TLS traffic from the host and streams normalized
events to the API ingestion endpoint.

**Components**
- `bpf/http_trace.bpf.c` - TLS uprobe capture program (CO-RE)
- `userspace/` - Rust agent (libbpf-rs + ring buffer)
- `scripts/verify_env.sh` - kernel + TLS symbol sanity checks

**Build (Linux, kernel 5.8+)**
```bash
cd sensor/ebpf
make
```

**Run**
```bash
./userspace/target/release/api-sec-sensor \
  --bpf ./bpf/http_trace.bpf.o \
  --ingest https://api.example.com/api/ingestion/v2/events \
  --api-key <token> \
  --account-id 1000000 \
  --role server \
  --tls-libs /usr/lib/x86_64-linux-gnu/libssl.so.3
```

**Notes**
- TLS capture uses uprobes on `SSL_read/SSL_write` (OpenSSL/BoringSSL),
  `SSL_read_ex/SSL_write_ex` when available, or `gnutls_record_recv/gnutls_record_send` (GnuTLS).
- Write-side capture is emitted from uretprobes to honor the actual byte count returned by TLS libs.
- Use `scripts/verify_env.sh` to confirm kernel BTF and TLS symbols on target hosts.
- For Kubernetes, deploy as a privileged DaemonSet with host PID namespace.
- HTTP/2/gRPC metadata is heuristically extracted by scanning header frames for
  `:method`, `:path`, `:status`, and `content-type`, and the emitted events set
  `protocol=HTTP/2` with `source=ebpf-grpc` when detected.

**Common Options**
- `--tls-provider auto|openssl|gnutls`
- `--pid <pid>` to scope probes to a single process
- `--max-buffer-bytes <n>` to cap per-connection reassembly buffers
- `--discover-libs` to auto-detect TLS libraries from `/proc/<pid>/maps`
