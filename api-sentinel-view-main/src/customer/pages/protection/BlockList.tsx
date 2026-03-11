import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Ban,
  Download,
  Zap,
  X,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Filter,
} from 'lucide-react';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlockedIP {
  ip: string;
  reason: string;
  blocked_by: 'AUTO' | 'MANUAL';
  risk_score: number;
  event_count: number;
  blocked_at: string;
  expires_at: string | null;
}

interface BlocklistResponse {
  items: BlockedIP[];
  total: number;
}

interface BlockIPPayload {
  ip: string;
  reason: string;
  expires_in_hours?: number;
}

interface AutoBlockResult {
  blocked_count: number;
  ips: string[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('sentinel_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchBlocklist(signal?: AbortSignal): Promise<BlocklistResponse> {
  const res = await fetch('/api/blocklist/', { headers: authHeaders(), signal });
  if (!res.ok) throw new Error('Failed to fetch blocklist');
  const json = await res.json();
  // Normalise: API may return array or object with items
  if (Array.isArray(json)) return { items: json, total: json.length };
  return json;
}

async function blockIP(payload: BlockIPPayload): Promise<void> {
  const res = await fetch('/api/blocklist/', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to block IP');
}

async function unblockIP(ip: string): Promise<void> {
  const res = await fetch(`/api/blocklist/${encodeURIComponent(ip)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to unblock IP');
}

async function autoBlockHighRisk(): Promise<AutoBlockResult> {
  const res = await fetch('/api/blocklist/auto', {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Auto-block failed');
  return res.json();
}

async function exportNginx(): Promise<void> {
  const token = localStorage.getItem('sentinel_token');
  const res = await fetch('/api/blocklist/export/nginx', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nginx-deny.conf';
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 24 * 60 * 60 * 1000; // within 24h
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, icon, color }) => (
  <div className="flex-1 min-w-[110px] bg-bg-surface border border-border-subtle rounded-lg p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
        {label}
      </span>
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {icon}
      </div>
    </div>
    <span className="text-2xl font-bold font-display" style={{ color }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  </div>
);

// ─── Block IP Modal ───────────────────────────────────────────────────────────

interface BlockModalProps {
  onClose: () => void;
  onSubmit: (payload: BlockIPPayload) => void;
  isLoading: boolean;
}

const BlockModal: React.FC<BlockModalProps> = ({ onClose, onSubmit, isLoading }) => {
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [expiresHours, setExpiresHours] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;
    const payload: BlockIPPayload = {
      ip: ip.trim(),
      reason: reason.trim() || 'Manually blocked',
    };
    if (expiresHours && !isNaN(Number(expiresHours))) {
      payload.expires_in_hours = Number(expiresHours);
    }
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-elevated border border-border-default rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Ban size={16} className="text-[#EF4444]" />
            Block IP Address
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              IP Address <span className="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="e.g. 192.168.1.100"
              required
              className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand placeholder:text-muted-foreground font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for blocking…"
              className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Expires In (hours) — optional
            </label>
            <input
              type="number"
              value={expiresHours}
              onChange={(e) => setExpiresHours(e.target.value)}
              placeholder="Leave blank for permanent"
              min="1"
              className="bg-bg-surface border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none focus:border-brand placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground border border-border-subtle rounded-lg hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !ip.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isLoading && <RefreshCw size={12} className="animate-spin" />}
              Block IP
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Confirm Unblock Dialog ───────────────────────────────────────────────────

interface ConfirmUnblockProps {
  ip: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const ConfirmUnblock: React.FC<ConfirmUnblockProps> = ({ ip, onConfirm, onCancel, isLoading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-bg-elevated border border-border-default rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 flex items-center justify-center">
          <CheckCircle size={24} className="text-[#22C55E]" />
        </div>
        <h3 className="text-base font-bold text-text-primary">Unblock IP Address</h3>
        <p className="text-sm text-muted-foreground">
          Remove <span className="font-mono text-text-primary">{ip}</span> from the block list?
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-muted-foreground border border-border-subtle rounded-lg hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold bg-[#22C55E] text-white rounded-lg hover:bg-[#16A34A] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isLoading && <RefreshCw size={12} className="animate-spin" />}
            Unblock
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ─── Risk Score Bar ───────────────────────────────────────────────────────────

const RiskBar: React.FC<{ score: number }> = ({ score }) => {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 80 ? '#EF4444' : pct >= 50 ? '#F97316' : '#EAB308';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-hover rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-mono" style={{ color }}>
        {pct}
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const BlockList: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [confirmUnblockIp, setConfirmUnblockIp] = useState<string | null>(null);
  const [autoBlockResult, setAutoBlockResult] = useState<AutoBlockResult | null>(null);

  // Queries
  const { data, isLoading, isError, refetch } = useQuery<BlocklistResponse>({
    queryKey: ['blocklist'],
    queryFn: ({ signal }) => fetchBlocklist(signal),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  // Mutations
  const blockMutation = useMutation({
    mutationFn: blockIP,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocklist'] });
      setShowBlockModal(false);
    },
  });

  const unblockMutation = useMutation({
    mutationFn: unblockIP,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blocklist'] });
      setConfirmUnblockIp(null);
    },
  });

  const autoBlockMutation = useMutation({
    mutationFn: autoBlockHighRisk,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['blocklist'] });
      setAutoBlockResult(result);
      setTimeout(() => setAutoBlockResult(null), 5000);
    },
  });

  // Summary stats
  const stats = useMemo(() => {
    const total = items.length;
    const auto = items.filter((i) => i.blocked_by === 'AUTO').length;
    const manual = items.filter((i) => i.blocked_by === 'MANUAL').length;
    const expiringSoon = items.filter((i) => isExpiringSoon(i.expires_at)).length;
    return { total, auto, manual, expiringSoon };
  }, [items]);

  // Filtered rows
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.ip.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      {/* Modals */}
      {showBlockModal && (
        <BlockModal
          onClose={() => setShowBlockModal(false)}
          onSubmit={(p) => blockMutation.mutate(p)}
          isLoading={blockMutation.isPending}
        />
      )}
      {confirmUnblockIp && (
        <ConfirmUnblock
          ip={confirmUnblockIp}
          onConfirm={() => unblockMutation.mutate(confirmUnblockIp)}
          onCancel={() => setConfirmUnblockIp(null)}
          isLoading={unblockMutation.isPending}
        />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Block List</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage blocked IP addresses</p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-text-primary transition-colors p-1 mt-1"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3 flex-wrap">
        <SummaryCard label="Total Blocked" value={stats.total} icon={<Ban size={13} />} color="#EF4444" />
        <SummaryCard label="Auto-Blocked" value={stats.auto} icon={<Zap size={13} />} color="#F97316" />
        <SummaryCard label="Manual" value={stats.manual} icon={<Shield size={13} />} color="#9CA3AF" />
        <SummaryCard label="Expiring Soon" value={stats.expiringSoon} icon={<AlertTriangle size={13} />} color="#EAB308" />
      </div>

      {/* Auto-block success banner */}
      {autoBlockResult && (
        <div className="flex items-center gap-3 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg px-4 py-3 text-sm text-[#22C55E]">
          <CheckCircle size={15} />
          <span>
            Auto-blocked <strong>{autoBlockResult.blocked_count}</strong> high-risk IP
            {autoBlockResult.blocked_count !== 1 ? 's' : ''}.
          </span>
          <button onClick={() => setAutoBlockResult(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-xs">
          <Filter size={13} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Search IP or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-text-primary outline-none placeholder:text-muted-foreground w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-text-primary">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <button
            onClick={() => autoBlockMutation.mutate()}
            disabled={autoBlockMutation.isPending}
            className="flex items-center gap-1.5 bg-[#F97316] text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-[#EA6C0A] disabled:opacity-50 transition-colors"
          >
            {autoBlockMutation.isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Zap size={13} />
            )}
            Auto-Block High Risk
          </button>
          <button
            onClick={() => exportNginx()}
            className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            <Download size={13} />
            Export nginx.conf
          </button>
          <button
            onClick={() => setShowBlockModal(true)}
            className="flex items-center gap-1.5 bg-[#EF4444] text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-[#DC2626] transition-colors"
          >
            <Ban size={13} />
            Block IP
          </button>
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <QueryError message="Failed to load block list" onRetry={() => refetch()} />
      )}

      {/* Table */}
      <div className="bg-bg-base border border-border-subtle rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-subtle bg-bg-surface flex items-center gap-2">
          <Ban size={13} className="text-[#EF4444]" />
          <span className="text-xs font-semibold text-text-primary">Blocked IPs</span>
          <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted-foreground ml-1">
            {filtered.length} entries
          </span>
        </div>

        {isLoading ? (
          <TableSkeleton columns={8} rows={8} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  {[
                    'IP Address',
                    'Reason',
                    'Blocked By',
                    'Risk Score',
                    'Events',
                    'Blocked At',
                    'Expires',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-xs text-muted-foreground">
                      No blocked IPs found.
                    </td>
                  </tr>
                )}
                {filtered.map((item) => (
                  <tr key={item.ip} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 text-[13px] font-mono text-text-primary whitespace-nowrap">
                      {item.ip}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary max-w-[200px] truncate">
                      {item.reason || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.blocked_by === 'AUTO' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]">
                          AUTO
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border-subtle bg-bg-elevated text-muted-foreground">
                          MANUAL
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[120px]">
                      <RiskBar score={item.risk_score} />
                    </td>
                    <td className="px-4 py-3 text-[12px] font-mono text-text-primary">
                      {item.event_count?.toLocaleString() ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {item.blocked_at ? formatDate(item.blocked_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {item.expires_at ? (
                        <span
                          className={`text-[11px] font-mono whitespace-nowrap ${
                            isExpiringSoon(item.expires_at)
                              ? 'text-[#EAB308]'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {formatDate(item.expires_at)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Permanent</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirmUnblockIp(item.ip)}
                        className="text-[11px] font-semibold text-[#22C55E] hover:text-[#4ADE80] transition-colors"
                      >
                        Unblock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockList;
