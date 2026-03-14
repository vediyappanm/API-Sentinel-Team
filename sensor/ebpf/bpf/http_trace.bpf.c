// TLS uprobe-based HTTP capture (CO-RE).
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_endian.h>

char LICENSE[] SEC("license") = "GPL";

#define MAX_DATA 4096

#ifndef AF_INET
#define AF_INET 2
#endif
#ifndef AF_INET6
#define AF_INET6 10
#endif

struct tls_event {
    __u64 ts_ns;
    __u32 pid;
    __u32 tid;
    __u64 ssl_ptr;
    __u32 data_len;
    __u8 direction; // 0 = READ (ingress), 1 = WRITE (egress)
    __u8 ip_family; // 4 = IPv4, 6 = IPv6, 0 = unknown
    __u16 _pad16;
    char comm[16];
    __u64 cgroup_id;
    __u32 netns_ino;
    __u16 src_port;
    __u16 dst_port;
    __u32 src_ip4;
    __u32 dst_ip4;
    __u8 src_ip6[16];
    __u8 dst_ip6[16];
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
    __uint(max_entries, 1 << 27);
} events SEC(".maps");

struct close_event {
    __u64 ts_ns;
    __u32 pid;
    __u32 tid;
    __u64 ssl_ptr;
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 20);
} close_events SEC(".maps");

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
    __type(key, __u64);   // ssl_ptr
    __type(value, __u64); // pid_tgid
} ssl_ptr_to_pid SEC(".maps");

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

struct conn_info {
    __u16 family;
    __u16 src_port;
    __u16 dst_port;
    __u16 _pad;
    __u32 src_ip4;
    __u32 dst_ip4;
    __u8 src_ip6[16];
    __u8 dst_ip6[16];
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 65536);
    __type(key, __u64); // pid_tgid
    __type(value, struct conn_info);
} active_connections SEC(".maps");
// NOTE: pid_tgid-based correlation can be incorrect for async runtimes.
// Phase 2 will map ssl_ptr -> sock via SSL_set_fd for accurate tuples.

static __always_inline void fill_conn_info(struct conn_info *out, struct sock *sk)
{
    __u16 family = 0;
    bpf_core_read(&family, sizeof(family), &sk->__sk_common.skc_family);
    out->family = family;
    if (family == AF_INET6) {
        bpf_core_read(out->src_ip6, sizeof(out->src_ip6), &sk->__sk_common.skc_v6_rcv_saddr);
        bpf_core_read(out->dst_ip6, sizeof(out->dst_ip6), &sk->__sk_common.skc_v6_daddr);
    } else {
        bpf_core_read(&out->src_ip4, sizeof(out->src_ip4), &sk->__sk_common.skc_rcv_saddr);
        bpf_core_read(&out->dst_ip4, sizeof(out->dst_ip4), &sk->__sk_common.skc_daddr);
    }
    bpf_core_read(&out->src_port, sizeof(out->src_port), &sk->__sk_common.skc_num);
    bpf_core_read(&out->dst_port, sizeof(out->dst_port), &sk->__sk_common.skc_dport);
    out->dst_port = bpf_ntohs(out->dst_port);
}

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
    e->ts_ns = bpf_ktime_get_ns();
    e->pid = pid;
    e->tid = tid;
    e->ssl_ptr = ssl_ptr;
    e->data_len = read_len;
    e->direction = direction;
    e->ip_family = 0;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    e->cgroup_id = bpf_get_current_cgroup_id();
    e->netns_ino = 0;
    e->src_port = 0;
    e->dst_port = 0;
    e->src_ip4 = 0;
    e->dst_ip4 = 0;
    __builtin_memset(e->src_ip6, 0, sizeof(e->src_ip6));
    __builtin_memset(e->dst_ip6, 0, sizeof(e->dst_ip6));

    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    struct nsproxy *nsproxy = NULL;
    bpf_core_read(&nsproxy, sizeof(nsproxy), &task->nsproxy);
    if (nsproxy) {
        struct net *net_ns = NULL;
        bpf_core_read(&net_ns, sizeof(net_ns), &nsproxy->net_ns);
        if (net_ns) {
            unsigned int ino = 0;
            bpf_core_read(&ino, sizeof(ino), &net_ns->ns.inum);
            e->netns_ino = ino;
        }
    }

    struct conn_info *info = bpf_map_lookup_elem(&active_connections, &pid_tgid);
    if (info) {
        e->src_port = info->src_port;
        e->dst_port = info->dst_port;
        if (info->family == AF_INET6) {
            e->ip_family = 6;
            __builtin_memcpy(e->src_ip6, info->src_ip6, sizeof(e->src_ip6));
            __builtin_memcpy(e->dst_ip6, info->dst_ip6, sizeof(e->dst_ip6));
        } else if (info->family == AF_INET) {
            e->ip_family = 4;
            e->src_ip4 = info->src_ip4;
            e->dst_ip4 = info->dst_ip4;
        }
    }

    if (read_len > 0) {
        bpf_probe_read_user(e->data, read_len, buf);
    }
    bpf_ringbuf_submit(e, 0);
    return 0;
}

SEC("kprobe/tcp_connect")
int tcp_connect_entry(struct pt_regs *ctx)
{
    struct sock *sk = (struct sock *)PT_REGS_PARM1(ctx);
    if (!sk) {
        return 0;
    }
    struct conn_info info = {};
    fill_conn_info(&info, sk);
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    bpf_map_update_elem(&active_connections, &pid_tgid, &info, BPF_ANY);
    return 0;
}

SEC("kretprobe/inet_csk_accept")
int tcp_accept_ret(struct pt_regs *ctx)
{
    struct sock *sk = (struct sock *)PT_REGS_RC(ctx);
    if (!sk) {
        return 0;
    }
    struct conn_info info = {};
    fill_conn_info(&info, sk);
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    bpf_map_update_elem(&active_connections, &pid_tgid, &info, BPF_ANY);
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
    bpf_map_update_elem(&ssl_ptr_to_pid, &args.ssl_ptr, &pid_tgid, BPF_ANY);
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
    bpf_map_update_elem(&ssl_ptr_to_pid, &args.ssl_ptr, &pid_tgid, BPF_ANY);
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
    bpf_map_update_elem(&ssl_ptr_to_pid, &args.ssl_ptr, &pid_tgid, BPF_ANY);
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
    bpf_map_update_elem(&ssl_ptr_to_pid, &args.ssl_ptr, &pid_tgid, BPF_ANY);
    return 0;
}

SEC("uprobe/SSL_free")
int ssl_free_entry(struct pt_regs *ctx)
{
    __u64 ssl_ptr = (__u64)PT_REGS_PARM1(ctx);
    __u64 *owner = bpf_map_lookup_elem(&ssl_ptr_to_pid, &ssl_ptr);
    __u64 pid_tgid = owner ? *owner : bpf_get_current_pid_tgid();

    struct close_event *e = bpf_ringbuf_reserve(&close_events, sizeof(*e), 0);
    if (e) {
        e->ts_ns = bpf_ktime_get_ns();
        e->pid = pid_tgid >> 32;
        e->tid = (__u32)pid_tgid;
        e->ssl_ptr = ssl_ptr;
        bpf_ringbuf_submit(e, 0);
    }

    bpf_map_delete_elem(&ssl_read_args, &pid_tgid);
    bpf_map_delete_elem(&ssl_write_args, &pid_tgid);
    bpf_map_delete_elem(&ssl_read_ex_args, &pid_tgid);
    bpf_map_delete_elem(&ssl_write_ex_args, &pid_tgid);
    bpf_map_delete_elem(&ssl_ptr_to_pid, &ssl_ptr);
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
