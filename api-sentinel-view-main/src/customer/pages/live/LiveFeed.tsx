import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Wifi,
  WifiOff,
  Activity,
  Shield,
  Ban,
  Zap,
  Download,
  Filter,
  X,
  RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttackInfo {
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

interface LogEntry {
  id: string;
  ip: string;
  method: string;
  path: string;
  status: number;
  bytes: string | number;
  timestamp: string;
  attacks: AttackInfo[];
}

interface WsMessage {
  type: 'log_entry';
  data: Omit<LogEntry, 'id'>;
}

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 200;
const WS_URL = 'ws://127.0.0.1:8000/api/stream/live';
const RECENT_URL = '/api/stream/recent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return '#22C55E';
  if (code >= 400 && code < 500) return '#EAB308';
  if (code >= 500) return '#EF4444';
  return '#9CA3AF';
}

function methodColors(method: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'rgba(59,130,246,0.15)', text: '#60A5FA' },
    POST: { bg: 'rgba(34,197,94,0.15)', text: '#4ADE80' },
    PUT: { bg: 'rgba(234,179,8,0.15)', text: '#FACC15' },
    DELETE: { bg: 'rgba(239,68,68,0.15)', text: '#F87171' },
    PATCH: { bg: 'rgba(167,139,250,0.15)', text: '#C4B5FD' },
  };
  return map[method.toUpperCase()] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' };
}

function severityColor(sev: string): string {
  const map: Record<string, string> = {
    CRITICAL: '#EF4444',
    HIGH: '#F97316',
    MEDIUM: '#EAB308',
    LOW: '#22C55E',
  };
  return map[sev.toUpperCase()] ?? '#9CA3AF';
}

function maxEntrySeverity(attacks: AttackInfo[]): string {
  if (!attacks.length) return '';
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of order) {
    if (attacks.some((a) => a.severity === sev)) return sev;
  }
  return attacks[0].severity;
}

function exportCsv(rows: LogEntry[]): void {
  const header = 'Timestamp,IP,Method,Path,Status,Bytes,Threats\n';
  const body = rows
    .map((r) => {
      const threats = r.attacks.map((a) => `${a.category}(${a.severity})`).join('; ');
      return `"${r.timestamp}","${r.ip}","${r.method}","${r.path}",${r.status},${r.bytes},"${threats}"`;
    })
    .join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `live-feed-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

interface FeedStats {
  reqPerMin: number;
  threats: number;
  blockedIps: number;
  sensors: number;
}

function computeStats(rows: LogEntry[]): FeedStats {
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const recent = rows.filter((r) => new Date(r.timestamp).getTime() >= oneMinAgo);
  const threats = rows.filter((r) => r.attacks.length > 0).length;
  const blockedIps = new Set(
    rows.filter((r) => r.attacks.length > 0).map((r) => r.ip),
  ).size;
  return {
    reqPerMin: recent.length,
    threats,
    blockedIps,
    sensors: 1,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => (
  <div className="flex-1 min-w-[120px] bg-bg-surface border border-border-subtle rounded-lg p-4 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
        {label}
      </span>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18`, color }}>
        {icon}
      </div>
    </div>
    <span className="text-2xl font-bold font-display" style={{ color }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  </div>
);

const SkeletonRow: React.FC = () => (
  <tr className="animate-pulse border-b border-border-subtle">
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div className="h-3 bg-bg-hover rounded" style={{ width: i === 3 ? '80%' : '60%' }} />
      </td>
    ))}
  </tr>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const LiveFeed: React.FC = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [userScrolled, setUserScrolled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // REST fallback: fetch initial rows
  const { isLoading: initialLoading } = useQuery({
    queryKey: ['live-feed', 'recent'],
    queryFn: async ({ signal }) => {
      const token = localStorage.getItem('sentinel_token');
      const res = await fetch(RECENT_URL, {
        signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch recent');
      const json = await res.json();
      const items: LogEntry[] = (json.data ?? json ?? []).map((d: Omit<LogEntry, 'id'>) => ({
        ...d,
        id: genId(),
      }));
      setEntries(items.slice(0, MAX_ROWS));
      return items;
    },
    staleTime: Infinity,
    retry: 1,
  });

  // WebSocket connection
  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const token = localStorage.getItem('sentinel_token');
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (ev) => {
      try {
        const msg: WsMessage = JSON.parse(ev.data);
        if (msg.type !== 'log_entry') return;
        const entry: LogEntry = { ...msg.data, id: genId() };
        setEntries((prev) => [entry, ...prev].slice(0, MAX_ROWS));
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => setConnected(false);

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3 s
      reconnectTimerRef.current = setTimeout(connect, 3000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connect]);

  // Scroll-to-top when new entries arrive unless user scrolled down
  useEffect(() => {
    if (!userScrolled && tableBodyRef.current) {
      tableBodyRef.current.scrollTop = 0;
    }
  }, [entries, userScrolled]);

  const handleScroll = useCallback(() => {
    if (!tableBodyRef.current) return;
    setUserScrolled(tableBodyRef.current.scrollTop > 50);
  }, []);

  // Filtered rows
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (severityFilter !== 'ALL') {
        const topSev = maxEntrySeverity(e.attacks);
        if (topSev !== severityFilter) return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!e.ip.toLowerCase().includes(q) && !e.path.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entries, severityFilter, searchQuery]);

  const stats = useMemo(() => computeStats(entries), [entries]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">Live Traffic Feed</h1>
          {connected ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              Disconnected
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi size={16} className="text-[#22C55E]" />
          ) : (
            <WifiOff size={16} className="text-[#EF4444]" />
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3 flex-wrap">
        <StatCard
          label="Requests / min"
          value={stats.reqPerMin}
          icon={<Activity size={13} />}
          color="#F97316"
        />
        <StatCard
          label="Threats Detected"
          value={stats.threats}
          icon={<Shield size={13} />}
          color="#EF4444"
        />
        <StatCard
          label="Blocked IPs"
          value={stats.blockedIps}
          icon={<Ban size={13} />}
          color="#EAB308"
        />
        <StatCard
          label="Active Sensors"
          value={stats.sensors}
          icon={<Zap size={13} />}
          color="#22C55E"
        />
      </div>

      {/* Filter + action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2">
          <Filter size={13} className="text-muted-foreground" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="bg-transparent text-xs text-text-primary outline-none cursor-pointer"
          >
            <option value="ALL">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 flex-1 min-w-[180px] max-w-xs">
          <Filter size={13} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="Search IP or path…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-text-primary outline-none placeholder:text-muted-foreground w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-text-primary">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setEntries([])}
            className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={13} />
            Clear
          </button>
          <button
            onClick={() => exportCsv(filteredEntries)}
            className="flex items-center gap-1.5 bg-bg-surface border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-bg-base border border-border-subtle rounded-lg flex flex-col">
        <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between bg-bg-surface rounded-t-lg">
          <span className="text-xs font-semibold text-text-primary flex items-center gap-2">
            <Activity size={13} className="text-brand" />
            Live Events
            <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted-foreground">
              {filteredEntries.length} rows
            </span>
          </span>
          {userScrolled && (
            <button
              onClick={() => {
                setUserScrolled(false);
                tableBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-1 text-[10px] text-brand hover:text-brand-light"
            >
              <RefreshCw size={10} />
              Resume live scroll
            </button>
          )}
        </div>

        <div
          ref={tableBodyRef}
          onScroll={handleScroll}
          className="overflow-auto"
          style={{ maxHeight: '580px' }}
        >
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="sticky top-0 bg-bg-surface border-b border-border-subtle z-10">
              <tr>
                {['Timestamp', 'IP Address', 'Method', 'Path', 'Status', 'Threat', 'Bytes'].map((h) => (
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
              {initialLoading &&
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}

              {!initialLoading && filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    {connected ? 'Waiting for traffic…' : 'Disconnected. Reconnecting…'}
                  </td>
                </tr>
              )}

              {filteredEntries.map((entry) => {
                const attacks = entry.attacks ?? [];
                const isThreat = attacks.length > 0;
                const topAttack = isThreat ? attacks[0] : null;
                const mc = methodColors(entry.method);
                const sc = statusColor(entry.status);

                return (
                  <tr
                    key={entry.id}
                    className={`transition-colors hover:bg-bg-hover ${isThreat ? 'bg-red-950/30' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {formatTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text-primary whitespace-nowrap">
                      {entry.ip}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[11px] font-bold font-mono px-2 py-0.5 rounded"
                        style={{ backgroundColor: mc.bg, color: mc.text }}
                      >
                        {entry.method}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-text-secondary max-w-[280px] truncate">
                      {entry.path}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="text-[12px] font-bold font-mono"
                        style={{ color: sc }}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {topAttack ? (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
                          style={{
                            color: severityColor(topAttack.severity),
                            borderColor: `${severityColor(topAttack.severity)}40`,
                            backgroundColor: `${severityColor(topAttack.severity)}15`,
                          }}
                        >
                          {topAttack.category}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                      {entry.bytes != null && entry.bytes !== '-' ? Number(entry.bytes).toLocaleString() + ' B' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LiveFeed;
