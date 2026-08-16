/** Shared display helpers for the customer ops console. */

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

export function formatRelative(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const delta = Math.max(0, now - date.getTime());
  if (delta < 1_000) return 'just now';
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function statusTone(code: number): string {
  if (code >= 200 && code < 300) return 'var(--evd-low)';
  if (code >= 300 && code < 400) return 'var(--evd-info)';
  if (code >= 400 && code < 500) return 'var(--evd-medium)';
  if (code >= 500) return 'var(--evd-critical)';
  return 'var(--evd-ink-muted)';
}

export function methodTone(method: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'rgba(59,130,246,0.12)', text: 'var(--evd-info)' },
    POST: { bg: 'rgba(45,164,78,0.12)', text: 'var(--evd-low)' },
    PUT: { bg: 'rgba(212,160,23,0.12)', text: 'var(--evd-medium)' },
    PATCH: { bg: 'rgba(43,76,255,0.12)', text: 'var(--evd-info)' },
    DELETE: { bg: 'rgba(214,61,47,0.12)', text: 'var(--evd-critical)' },
    HEAD: { bg: 'rgba(138,134,126,0.16)', text: 'var(--evd-ink)' },
    OPTIONS: { bg: 'rgba(138,134,126,0.16)', text: 'var(--evd-ink)' },
  };
  return map[method.toUpperCase()] ?? { bg: 'var(--evd-panel-raised)', text: 'var(--evd-ink-muted)' };
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatProtocol(protocol?: string): string {
  if (!protocol) return 'HTTP';
  const value = protocol.replace(/^L7Protocol_?/i, '').replace(/_/g, '/');
  if (value === 'HTTP11' || value === 'HTTP1.1') return 'HTTP/1.1';
  if (value === 'HTTP2') return 'HTTP/2';
  if (value === 'HTTP3') return 'HTTP/3';
  return value;
}
