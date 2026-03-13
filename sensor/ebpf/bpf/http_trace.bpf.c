// TLS uprobe-based HTTP capture (CO-RE).
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

#define MAX_DATA 4096

struct tls_event {
    __u64 ts_ns;
    __u32 pid;
    __u32 tid;
    __u64 ssl_ptr;
    __u32 data_len;
    __u8 direction; // 0 = READ (ingress), 1 = WRITE (egress)
    __u8 _pad8;
    __u16 _pad16;
    char comm[16];
    char data[MAX_DATA];
};

struct read_args {
    __u64 ssl_ptr;
    const void *buf;
    __u32 len;
};

struct write_args {
    __u64 ssl_ptr;
    const void *buf;
    __u32 len;
};

struct read_ex_args {
    __u64 ssl_ptr;
    void *buf;
    __u64 *bytes_ptr;
    __u64 len;
};

struct write_ex_args {
    __u64 ssl_ptr;
    const void *buf;
    __u64 *bytes_ptr;
    __u64 len;
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 26);
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct read_args);
} ssl_read_args SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct write_args);
} ssl_write_args SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct read_ex_args);
} ssl_read_ex_args SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct write_ex_args);
} ssl_write_ex_args SEC(".maps");

// Separate GnuTLS maps to avoid key collision with OpenSSL maps (BUG-3)
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct write_args);
} gnutls_write_args SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 8192);
    __type(key, __u64);   // pid_tgid
    __type(value, struct read_args);
} gnutls_read_args SEC(".maps");

static __always_inline int emit_event(struct pt_regs *ctx, const void *buf, __u32 len, __u8 direction, __u64 ssl_ptr)
{
    struct tls_event *e;
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    __u32 pid = pid_tgid >> 32;
    __u32 tid = (__u32)pid_tgid;
    __u32 read_len = len > MAX_DATA ? MAX_DATA : len;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        return 0;
    }
    __builtin_memset(e, 0, sizeof(*e));
    e->ts_ns = bpf_ktime_get_ns();
    e->pid = pid;
    e->tid = tid;
    e->ssl_ptr = ssl_ptr;
    e->data_len = read_len;
    e->direction = direction;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    if (read_len > 0) {
        bpf_probe_read_user(e->data, read_len, buf);
    }
    bpf_ringbuf_submit(e, 0);
    return 0;
}

// OpenSSL/BoringSSL
SEC("uprobe/SSL_write")
int ssl_write_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (const void *)PT_REGS_PARM2(ctx);
    args.len = (__u32)PT_REGS_PARM3(ctx);
    bpf_map_update_elem(&ssl_write_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/SSL_write")
int ssl_write_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_args *args = bpf_map_lookup_elem(&ssl_write_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0) {
        emit_event(ctx, args->buf, (__u32)ret, 1, args->ssl_ptr);
    }
    bpf_map_delete_elem(&ssl_write_args, &pid_tgid);
    return 0;
}

SEC("uprobe/SSL_read")
int ssl_read_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (const void *)PT_REGS_PARM2(ctx);
    args.len = (__u32)PT_REGS_PARM3(ctx);
    bpf_map_update_elem(&ssl_read_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/SSL_read")
int ssl_read_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_args *args = bpf_map_lookup_elem(&ssl_read_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0) {
        emit_event(ctx, args->buf, (__u32)ret, 0, args->ssl_ptr);
    }
    bpf_map_delete_elem(&ssl_read_args, &pid_tgid);
    return 0;
}

// OpenSSL 1.1+/3.x extended APIs
SEC("uprobe/SSL_read_ex")
int ssl_read_ex_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_ex_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (void *)PT_REGS_PARM2(ctx);
    args.len = (__u64)PT_REGS_PARM3(ctx);
    args.bytes_ptr = (__u64 *)PT_REGS_PARM4(ctx);
    bpf_map_update_elem(&ssl_read_ex_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/SSL_read_ex")
int ssl_read_ex_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_ex_args *args = bpf_map_lookup_elem(&ssl_read_ex_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0 && args->bytes_ptr) {
        __u64 bytes = 0;
        if (bpf_probe_read_user(&bytes, sizeof(bytes), args->bytes_ptr) == 0) {
            if (bytes > 0) {
                emit_event(ctx, args->buf, (__u32)bytes, 0, args->ssl_ptr);
            }
        }
    }
    bpf_map_delete_elem(&ssl_read_ex_args, &pid_tgid);
    return 0;
}

SEC("uprobe/SSL_write_ex")
int ssl_write_ex_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_ex_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (const void *)PT_REGS_PARM2(ctx);
    args.len = (__u64)PT_REGS_PARM3(ctx);
    args.bytes_ptr = (__u64 *)PT_REGS_PARM4(ctx);
    bpf_map_update_elem(&ssl_write_ex_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/SSL_write_ex")
int ssl_write_ex_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_ex_args *args = bpf_map_lookup_elem(&ssl_write_ex_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0 && args->bytes_ptr) {
        __u64 bytes = 0;
        if (bpf_probe_read_user(&bytes, sizeof(bytes), args->bytes_ptr) == 0) {
            if (bytes > 0) {
                emit_event(ctx, args->buf, (__u32)bytes, 1, args->ssl_ptr);
            }
        }
    }
    bpf_map_delete_elem(&ssl_write_ex_args, &pid_tgid);
    return 0;
}

// GnuTLS
SEC("uprobe/gnutls_record_send")
int gnutls_send_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (const void *)PT_REGS_PARM2(ctx);
    args.len = (__u32)PT_REGS_PARM3(ctx);
    bpf_map_update_elem(&gnutls_write_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/gnutls_record_send")
int gnutls_send_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct write_args *args = bpf_map_lookup_elem(&gnutls_write_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0) {
        emit_event(ctx, args->buf, (__u32)ret, 1, args->ssl_ptr);
    }
    bpf_map_delete_elem(&gnutls_write_args, &pid_tgid);
    return 0;
}

SEC("uprobe/gnutls_record_recv")
int gnutls_recv_entry(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_args args = {};
    args.ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    args.buf = (const void *)PT_REGS_PARM2(ctx);
    args.len = (__u32)PT_REGS_PARM3(ctx);
    bpf_map_update_elem(&gnutls_read_args, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/gnutls_record_recv")
int gnutls_recv_exit(struct pt_regs *ctx)
{
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct read_args *args = bpf_map_lookup_elem(&gnutls_read_args, &pid_tgid);
    int ret = (int)PT_REGS_RC(ctx);
    if (!args) {
        return 0;
    }
    if (ret > 0) {
        emit_event(ctx, args->buf, (__u32)ret, 0, args->ssl_ptr);
    }
    bpf_map_delete_elem(&gnutls_read_args, &pid_tgid);
    return 0;
}
