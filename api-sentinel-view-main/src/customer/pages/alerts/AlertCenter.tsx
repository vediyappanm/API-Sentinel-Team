import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Activity,
  Filter,
} from 'lucide-react';
import QueryError from '@/components/shared/QueryError';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TabValue = 'ALL' | AlertStatus | 'CRITICAL';

interface Alert {
  id: string;
  severity: AlertSeverity;
  category: string;
  title: string;
  message: string;
  source_ip: string;
  endpoint: string;
  timestamp: string;
  status: AlertStatus;
}

interface AlertSummary {
  total: number;
  open: number;
  critical: number;
  high: number;
  acknowledged: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('sentinel_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchAlerts(
  status?: string,
  severity?: string,
  signal?: AbortSignal,
): Promise<Alert[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (status && status !== 'ALL') params.set('status', status);
  if (severity && severity !== 'ALL') params.set('severity', severity);
  const res = await fetch(`/api/alerts/?${params}`, {
    headers: authHeaders(),
    signal,
  });
  if (!res.ok) throw new Error('Failed to fetch alerts');
  const json = await res.json();
  if (Array.isArray(json)) return json;
  return json.items ?? json.alerts ?? [];
}

async function fetchAlertSummary(signal?: AbortSignal): Promise<AlertSummary> {
  const res = await fetch('/api/alerts/summary', { headers: authHeaders(), signal });
  if (!res.ok) throw new Error('Failed to fetch alert summary');
  return res.json();
}

async function acknowledgeAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}/acknowledge`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to acknowledge alert');
}

async function resolveAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}/resolve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to resolve alert');
}

async function dismissAlert(id: string): Promise<void> {
  const res = await fetch(`/api/alerts/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to dismiss alert');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#3B82F6',
};

const SEVERITY_BADGE: Record<AlertSeverity, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  HIGH: { bg: 'rgba(249,115,22,0.15)', text: '#F97316' },
  MEDIUM: { bg: 'rgba(234,179,8,0.15)', text: '#EAB308' },
  LOW: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
};

const STATUS_CHIP: Record<AlertStatus, { bg: string; text: string; label: string }> = {
  OPEN: { bg: 'rgba(239,68,68,0.1)', text: '#EF4444', label: 'OPEN' },
  ACKNOWLEDGED: { bg: 'rgba(234,179,8,0.1)', text: '#EAB308', label: 'ACKNOWLEDGED' },
  RESOLVED: { bg: 'rgba(34,197,94,0.1)', text: '#22C55E', label: 'RESOLVED' },
};

const TABS: { key: TabValue; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'CRITICAL', label: 'Critical' },
  { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { key: 'RESOLVED', label: 'Resolved' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string;
  value: number | string;
  color: string;
  icon: React.ReactNode;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, color, icon }) => (
  <div className="flex-1 min-w-[100px] bg-bg-surface border border-border-subtle rounded-lg p-4 flex flex-col gap-2">
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

// ─── Skeleton card ────────────────────────────────────────────────────────────

const AlertCardSkeleton: React.FC = () => (
  <div className="bg-bg-surface border border-border-subtle rounded-lg p-4 flex gap-4 animate-pulse">
    <div className="w-1 self-stretch rounded-full bg-bg-hover flex-shrink-0" />
    <div className="flex-1 space-y-3">
      <div className="flex gap-2">
        <div className="h-4 w-16 bg-bg-hover rounded" />
        <div className="h-4 w-24 bg-bg-hover rounded" />
      </div>
      <div className="h-4 w-3/4 bg-bg-hover rounded" />
      <div className="h-3 w-1/2 bg-bg-hover rounded" />
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-bg-hover rounded" />
        <div className="h-6 w-20 bg-bg-hover rounded" />
      </div>
    </div>
  </div>
);

// ─── Alert Card ───────────────────────────────────────────────────────────────

interface AlertCardProps {
  alert: Alert;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
  isActioning: boolean;
}

const AlertCard: React.FC<AlertCardProps> = ({
  alert,
  onAcknowledge,
  onResolve,
  onDismiss,
  isActioning,
}) => {
  const borderColor = SEVERITY_BORDER[alert.severity] ?? '#9CA3AF';
  const sevBadge = SEVERITY_BADGE[alert.severity] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' };
  const statusChip = STATUS_CHIP[alert.status];

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg flex overflow-hidden transition-all hover:border-border-default">
      {/* Left severity bar */}
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: borderColor }} />

      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: badges + content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Badge row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{
                  backgroundColor: sevBadge.bg,
                  color: sevBadge.text,
                  borderColor: `${sevBadge.text}40`,
                }}
              >
                {alert.severity}
              </span>
              {alert.category && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border-subtle bg-bg-elevated text-muted-foreground">
                  {alert.category}
                </span>
              )}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto"
                style={{
                  backgroundColor: statusChip.bg,
                  color: statusChip.text,
                  borderColor: `${statusChip.text}40`,
                }}
              >
                {statusChip.label}
              </span>
            </div>

            {/* Title */}
            <p className="text-sm font-semibold text-text-primary leading-snug">{alert.title}</p>

            {/* Message */}
            {alert.message && (
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {alert.message}
              </p>
            )}

            {/* Source + endpoint */}
            <div className="flex items-center gap-4 flex-wrap">
              {alert.source_ip && (
                <span className="text-[11px] font-mono text-text-secondary">
                  {alert.source_ip}
                </span>
              )}
              {alert.endpoint && (
                <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[300px]">
                  {alert.endpoint}
                </span>
              )}
              <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                {timeAgo(alert.timestamp)}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {alert.status === 'OPEN' && (
            <button
              onClick={() => onAcknowledge(alert.id)}
              disabled={isActioning}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[#EAB308]/30 bg-[#EAB308]/10 text-[#EAB308] hover:bg-[#EAB308]/20 disabled:opacity-50 transition-colors"
            >
              {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <Activity size={10} />}
              Acknowledge
            </button>
          )}
          {alert.status !== 'RESOLVED' && (
            <button
              onClick={() => onResolve(alert.id)}
              disabled={isActioning}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E]/20 disabled:opacity-50 transition-colors"
            >
              {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <CheckCircle size={10} />}
              Resolve
            </button>
          )}
          <button
            onClick={() => onDismiss(alert.id)}
            disabled={isActioning}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-elevated text-muted-foreground hover:bg-bg-hover disabled:opacity-50 transition-colors"
          >
            {isActioning ? <RefreshCw size={10} className="animate-spin" /> : <XCircle size={10} />}
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
    <div className="w-16 h-16 rounded-full bg-[#22C55E]/10 flex items-center justify-center">
      <Shield size={28} className="text-[#22C55E]" />
    </div>
    <p className="text-base font-semibold text-text-primary">No alerts. System is clean.</p>
    <p className="text-xs text-muted-foreground">All clear — no active threats or anomalies detected.</p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const AlertCenter: React.FC = () => {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>('ALL');
  const [actioningIds, setActioningIds] = useState<Set<string>>(new Set());

  // Build query params from active tab
  const queryStatus = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(activeTab)
    ? (activeTab as AlertStatus)
    : undefined;
  const querySeverity = activeTab === 'CRITICAL' ? 'CRITICAL' : undefined;

  const {
    data: alerts = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Alert[]>({
    queryKey: ['alerts', 'list', queryStatus, querySeverity],
    queryFn: ({ signal }) => fetchAlerts(queryStatus, querySeverity, signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: summary } = useQuery<AlertSummary>({
    queryKey: ['alerts', 'summary'],
    queryFn: ({ signal }) => fetchAlertSummary(signal),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Mark all as acknowledged mutation helper
  const handleMarkAllRead = () => {
    const openAlerts = alerts.filter((a) => a.status === 'OPEN');
    openAlerts.forEach((a) => acknowledgeMutation.mutate(a.id));
  };

  // Mutations
  const withActioning = (id: string, fn: () => void) => {
    setActioningIds((prev) => new Set([...prev, id]));
    fn();
  };

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeAlert,
    onSettled: (_data, _err, id) => {
      setActioningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: resolveAlert,
    onSettled: (_data, _err, id) => {
      setActioningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: dismissAlert,
    onSettled: (_data, _err, id) => {
      setActioningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const unreadCount = useMemo(
    () => alerts.filter((a) => a.status === 'OPEN').length,
    [alerts],
  );

  const tabCounts = useMemo(() => ({
    ALL: alerts.length,
    OPEN: alerts.filter((a) => a.status === 'OPEN').length,
    CRITICAL: alerts.filter((a) => a.severity === 'CRITICAL').length,
    ACKNOWLEDGED: alerts.filter((a) => a.status === 'ACKNOWLEDGED').length,
    RESOLVED: alerts.filter((a) => a.status === 'RESOLVED').length,
  }), [alerts]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">Alert Center</h1>
          {unreadCount > 0 && (
            <span className="bg-[#EF4444] text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={acknowledgeMutation.isPending}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-text-primary border border-border-subtle bg-bg-surface rounded-lg px-3 py-2 transition-colors"
            >
              <CheckCircle size={13} />
              Mark All Read
            </button>
          )}
          <button
            onClick={() => refetch()}
            className="text-muted-foreground hover:text-text-primary transition-colors p-2"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3 flex-wrap">
        <SummaryCard
          label="Total"
          value={summary?.total ?? alerts.length}
          color="#F97316"
          icon={<Filter size={13} />}
        />
        <SummaryCard
          label="Open"
          value={summary?.open ?? tabCounts.OPEN}
          color="#EF4444"
          icon={<AlertTriangle size={13} />}
        />
        <SummaryCard
          label="Critical"
          value={summary?.critical ?? tabCounts.CRITICAL}
          color="#EF4444"
          icon={<XCircle size={13} />}
        />
        <SummaryCard
          label="High"
          value={summary?.high ?? alerts.filter((a) => a.severity === 'HIGH').length}
          color="#F97316"
          icon={<AlertTriangle size={13} />}
        />
        <SummaryCard
          label="Acknowledged"
          value={summary?.acknowledged ?? tabCounts.ACKNOWLEDGED}
          color="#EAB308"
          icon={<Activity size={13} />}
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border-subtle overflow-x-auto pb-0">
        {TABS.map((tab) => {
          const count = tabCounts[tab.key as keyof typeof tabCounts];
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors outline-none ${
                isActive
                  ? 'border-brand text-brand'
                  : 'border-transparent text-muted-foreground hover:text-text-primary'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-brand/20 text-brand'
                      : 'bg-bg-elevated text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {isError && (
        <QueryError message="Failed to load alerts" onRetry={() => refetch()} />
      )}

      {/* Alert list */}
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 5 }).map((_, i) => <AlertCardSkeleton key={i} />)}

        {!isLoading && alerts.length === 0 && <EmptyState />}

        {!isLoading &&
          alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={(id) =>
                withActioning(id, () => acknowledgeMutation.mutate(id))
              }
              onResolve={(id) =>
                withActioning(id, () => resolveMutation.mutate(id))
              }
              onDismiss={(id) =>
                withActioning(id, () => dismissMutation.mutate(id))
              }
              isActioning={actioningIds.has(alert.id)}
            />
          ))}
      </div>
    </div>
  );
};

export default AlertCenter;
