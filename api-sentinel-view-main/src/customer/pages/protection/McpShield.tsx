import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import {
  ShieldCheck, AlertTriangle, Activity, Server, Eye, Lock, Unlock,
  Terminal, ChevronRight
} from 'lucide-react';

interface McpServer {
  server_id: string;
  name: string;
  transport: string;
  tool_count: number;
  status: 'trusted' | 'untrusted' | 'shadow';
  last_seen: string;
  risk_score: number;
}

interface McpAlert {
  id: string;
  server_id: string;
  tool_name: string;
  alert_type: string;
  severity: string;
  details: string;
  blocked: boolean;
  created_at: string;
}

const DEMO_SERVERS: McpServer[] = [
  { server_id: 'mcp-github', name: 'GitHub MCP', transport: 'stdio', tool_count: 12, status: 'trusted', last_seen: new Date(Date.now() - 60000).toISOString(), risk_score: 0.08 },
  { server_id: 'mcp-fs', name: 'Filesystem MCP', transport: 'stdio', tool_count: 8, status: 'trusted', last_seen: new Date(Date.now() - 120000).toISOString(), risk_score: 0.25 },
  { server_id: 'mcp-unknown-2941', name: 'Unknown Server', transport: 'sse', tool_count: 3, status: 'shadow', last_seen: new Date(Date.now() - 300000).toISOString(), risk_score: 0.82 },
  { server_id: 'mcp-slack', name: 'Slack MCP', transport: 'stdio', tool_count: 6, status: 'trusted', last_seen: new Date(Date.now() - 900000).toISOString(), risk_score: 0.12 },
];

const DEMO_ALERTS: McpAlert[] = [
  {
    id: 'a1', server_id: 'mcp-unknown-2941', tool_name: 'exec_command',
    alert_type: 'SHADOW_MCP_SERVER', severity: 'CRITICAL',
    details: 'Unregistered MCP server discovered via SSE transport at 192.168.1.45:9000. Tool "exec_command" invoked shell with elevated privileges.',
    blocked: true, created_at: new Date(Date.now() - 300000).toISOString()
  },
  {
    id: 'a2', server_id: 'mcp-fs', tool_name: 'read_file',
    alert_type: 'SENSITIVE_PATH_ACCESS', severity: 'HIGH',
    details: 'read_file tool accessed /etc/passwd and .env files. Path pattern matches known credential exfiltration.',
    blocked: true, created_at: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: 'a3', server_id: 'mcp-github', tool_name: 'create_pull_request',
    alert_type: 'PROMPT_INJECTION_IN_TOOL_RESULT', severity: 'MEDIUM',
    details: 'Tool result contained "Ignore previous instructions" pattern. Possible prompt injection via issue body.',
    blocked: false, created_at: new Date(Date.now() - 3600000).toISOString()
  },
];

function riskColor(score: number) {
  if (score >= 0.7) return { text: 'text-red-500', bg: 'bg-red-50 border-red-200' };
  if (score >= 0.4) return { text: 'text-amber-500', bg: 'bg-amber-50 border-amber-200' };
  return { text: 'text-green-500', bg: 'bg-green-50 border-green-200' };
}

function statusIcon(status: McpServer['status']) {
  if (status === 'trusted') return <Lock className="h-3.5 w-3.5 text-green-500" />;
  if (status === 'shadow') return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
  return <Unlock className="h-3.5 w-3.5 text-amber-500" />;
}

function severityBadge(sev: string) {
  const m: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border border-orange-200',
    MEDIUM: 'bg-amber-100 text-amber-700 border border-amber-200',
    LOW: 'bg-blue-100 text-blue-700 border border-blue-200',
  };
  return m[sev] || 'bg-gray-100 text-gray-600';
}

export default function McpShield() {
  const [tab, setTab] = useState<'servers' | 'alerts'>('alerts');

  const { data: shieldData } = useQuery({
    queryKey: ['mcp-shield'],
    queryFn: () => get('/mcp-shield/servers').catch(() => null),
    retry: false,
  });

  const servers: McpServer[] = shieldData?.servers?.length ? shieldData.servers : DEMO_SERVERS;
  const alerts: McpAlert[] = DEMO_ALERTS;
  const isDemo = !shieldData?.servers?.length;

  const shadowCount = servers.filter(s => s.status === 'shadow').length;
  const blockedCount = alerts.filter(a => a.blocked).length;
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" />
            MCP Shield
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Detect shadow MCP servers, monitor tool invocations, block prompt injection
          </p>
        </div>
        {isDemo && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data · Deploy MCP proxy to enable real monitoring
          </span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Registered Servers', value: servers.filter(s => s.status !== 'shadow').length, icon: Server, color: 'text-brand' },
          { label: 'Shadow Servers', value: shadowCount, icon: Eye, color: shadowCount > 0 ? 'text-red-500' : 'text-green-500' },
          { label: 'Blocked Invocations', value: blockedCount, icon: ShieldCheck, color: 'text-red-500' },
          { label: 'Critical Alerts', value: criticalCount, icon: AlertTriangle, color: criticalCount > 0 ? 'text-red-600' : 'text-green-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-3">
            <Icon className={`h-5 w-5 ${color} shrink-0`} />
            <div>
              <div className="text-xl font-bold text-text-primary">{value}</div>
              <div className="text-xs text-text-muted">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {shadowCount > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-700">Shadow MCP server(s) detected</div>
            <div className="text-xs text-red-600 mt-0.5">
              {shadowCount} unregistered server{shadowCount > 1 ? 's are' : ' is'} communicating with your AI agents.
              Review and block immediately.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {([
          ['alerts', `Alerts (${alerts.length})`],
          ['servers', `MCP Servers (${servers.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <div className="space-y-2">
          {alerts.map(a => (
            <div key={a.id} className={`bg-bg-elevated border rounded-xl p-4 ${a.severity === 'CRITICAL' ? 'border-red-200' : 'border-border-subtle'}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">
                      {a.alert_type.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${severityBadge(a.severity)}`}>
                      {a.severity}
                    </span>
                    {a.blocked && (
                      <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">
                        BLOCKED
                      </span>
                    )}
                    <span className="text-[10px] text-text-muted ml-auto">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    <span className="font-mono text-text-secondary">{a.server_id}</span>
                    <ChevronRight className="h-3 w-3 inline mx-1" />
                    <span className="font-mono text-text-secondary">{a.tool_name}</span>
                  </div>
                  <div className="mt-2 text-xs text-text-secondary bg-bg-subtle rounded p-2">
                    {a.details}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'servers' && (
        <div className="space-y-2">
          {servers.map(s => {
            const rc = riskColor(s.risk_score);
            return (
              <div key={s.server_id} className={`bg-bg-elevated border rounded-xl p-4 ${s.status === 'shadow' ? 'border-red-200' : 'border-border-subtle'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${s.status === 'shadow' ? 'bg-red-50 border-red-200' : 'bg-bg-subtle border-border-subtle'}`}>
                    <Terminal className={`h-4 w-4 ${s.status === 'shadow' ? 'text-red-500' : 'text-text-muted'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusIcon(s.status)}
                      <span className="text-sm font-medium text-text-primary">{s.name}</span>
                      <span className="text-[10px] text-text-muted font-mono">{s.server_id}</span>
                      <span className="text-[10px] bg-bg-subtle border border-border-subtle px-1.5 py-0.5 rounded">{s.transport}</span>
                      {s.status === 'shadow' && (
                        <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">SHADOW</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                      <span>{s.tool_count} tools</span>
                      <span>Last seen {new Date(s.last_seen).toLocaleTimeString()}</span>
                      <span className={rc.text}>Risk {(s.risk_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className={`w-1.5 h-10 rounded-full ${s.status === 'shadow' ? 'bg-red-400' : s.risk_score > 0.4 ? 'bg-amber-400' : 'bg-green-400'}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
