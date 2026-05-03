import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import {
  Bot, AlertTriangle, Activity, ShieldAlert, Eye, ChevronDown, ChevronUp,
  Server, Cpu, Layers
} from 'lucide-react';

interface AgentIdentity {
  agent_id: string;
  agent_type: string;
  parent_agent_id: string | null;
  declared_scope: string[];
  effective_scope: string[];
  human_principal: string | null;
  created_at: string;
}

interface Invocation {
  agent_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  status: string;
  created_at: string;
}

interface Violation {
  agent_id: string;
  type: string;
  severity: string;
  details: Record<string, unknown>;
  created_at: string;
}

const DEMO_IDENTITIES: AgentIdentity[] = [
  { agent_id: 'agent-copilot-01', agent_type: 'LLM_COPILOT', parent_agent_id: null, declared_scope: ['read:docs', 'write:code'], effective_scope: ['read:docs', 'write:code', 'read:env'], human_principal: 'alice@acme.com', created_at: new Date(Date.now() - 3600000).toISOString() },
  { agent_id: 'agent-orchestrator-02', agent_type: 'ORCHESTRATOR', parent_agent_id: null, declared_scope: ['manage:tasks'], effective_scope: ['manage:tasks', 'exec:shell'], human_principal: null, created_at: new Date(Date.now() - 7200000).toISOString() },
  { agent_id: 'agent-sub-03', agent_type: 'SUBAGENT', parent_agent_id: 'agent-orchestrator-02', declared_scope: ['read:files'], effective_scope: ['read:files', 'write:files', 'exec:network'], human_principal: null, created_at: new Date(Date.now() - 7100000).toISOString() },
];

const DEMO_INVOCATIONS: Invocation[] = [
  { agent_id: 'agent-copilot-01', tool_name: 'read_file', parameters: { path: '.env' }, status: 'BLOCKED', created_at: new Date(Date.now() - 60000).toISOString() },
  { agent_id: 'agent-sub-03', tool_name: 'exec_shell', parameters: { cmd: 'curl http://internal-api/secrets' }, status: 'BLOCKED', created_at: new Date(Date.now() - 120000).toISOString() },
  { agent_id: 'agent-copilot-01', tool_name: 'write_code', parameters: { file: 'src/main.ts' }, status: 'ALLOWED', created_at: new Date(Date.now() - 300000).toISOString() },
  { agent_id: 'agent-orchestrator-02', tool_name: 'manage_task', parameters: { task_id: 'T-001' }, status: 'ALLOWED', created_at: new Date(Date.now() - 600000).toISOString() },
];

const DEMO_VIOLATIONS: Violation[] = [
  { agent_id: 'agent-copilot-01', type: 'SCOPE_CREEP', severity: 'HIGH', details: { declared: 'read:docs', effective: 'read:env', tool: 'read_file', path: '.env' }, created_at: new Date(Date.now() - 60000).toISOString() },
  { agent_id: 'agent-sub-03', type: 'PROMPT_INJECTION', severity: 'CRITICAL', details: { tool: 'exec_shell', pattern: 'Ignore previous instructions', cmd: 'curl http://internal-api/secrets' }, created_at: new Date(Date.now() - 120000).toISOString() },
  { agent_id: 'agent-orchestrator-02', type: 'UNAUTHORIZED_TOOL', severity: 'MEDIUM', details: { tool: 'exec:shell', not_in_declared_scope: true }, created_at: new Date(Date.now() - 900000).toISOString() },
];

function severityBadge(sev: string) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border border-orange-200',
    MEDIUM: 'bg-amber-100 text-amber-700 border border-amber-200',
    LOW: 'bg-blue-100 text-blue-700 border border-blue-200',
  };
  return styles[sev] || 'bg-gray-100 text-gray-600';
}

function statusBadge(s: string) {
  return s === 'BLOCKED'
    ? 'bg-red-100 text-red-700 border border-red-200'
    : 'bg-green-100 text-green-700 border border-green-200';
}

function scopeDiff(declared: string[], effective: string[]) {
  const extra = effective.filter(s => !declared.includes(s));
  return extra;
}

function AgentCard({ agent }: { agent: AgentIdentity }) {
  const [expanded, setExpanded] = useState(false);
  const extraScope = scopeDiff(agent.declared_scope, agent.effective_scope);
  const hasScopeCreep = extraScope.length > 0;

  return (
    <div className={`bg-bg-elevated border rounded-xl overflow-hidden ${hasScopeCreep ? 'border-orange-200' : 'border-border-subtle'}`}>
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg-subtle/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary font-mono">{agent.agent_id}</span>
            <span className="text-[10px] bg-bg-subtle border border-border-subtle px-1.5 py-0.5 rounded">
              {agent.agent_type}
            </span>
            {hasScopeCreep && (
              <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">
                ⚠ Scope creep +{extraScope.length}
              </span>
            )}
            {agent.parent_agent_id && (
              <span className="text-[10px] text-text-muted">sub-agent of {agent.parent_agent_id}</span>
            )}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            Principal: {agent.human_principal || <span className="italic">no human principal</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border-subtle pt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Declared Scope</div>
              <div className="flex flex-wrap gap-1">
                {agent.declared_scope.map(s => (
                  <span key={s} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-mono">{s}</span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Effective Scope</div>
              <div className="flex flex-wrap gap-1">
                {agent.effective_scope.map(s => {
                  const isExtra = !agent.declared_scope.includes(s);
                  return (
                    <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                      isExtra ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'
                    }`}>{s}{isExtra && ' ⚠'}</span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="text-[10px] text-text-muted">
            Registered: {new Date(agent.created_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgenticSecurity() {
  const [tab, setTab] = useState<'identities' | 'invocations' | 'violations'>('violations');

  const { data: idData } = useQuery({
    queryKey: ['agentic-identities'],
    queryFn: () => get('/agentic/identities').catch(() => null),
    retry: false,
  });

  const { data: invData } = useQuery({
    queryKey: ['agentic-invocations'],
    queryFn: () => get('/agentic/invocations').catch(() => null),
    retry: false,
  });

  const { data: violData } = useQuery({
    queryKey: ['agentic-violations'],
    queryFn: () => get('/agentic/violations').catch(() => null),
    retry: false,
  });

  const identities: AgentIdentity[] = idData?.identities?.length ? idData.identities : DEMO_IDENTITIES;
  const invocations: Invocation[] = invData?.invocations?.length ? invData.invocations : DEMO_INVOCATIONS;
  const violations: Violation[] = violData?.violations?.length ? violData.violations : DEMO_VIOLATIONS;
  const isDemo = !idData?.identities?.length;

  const blocked = invocations.filter(i => i.status === 'BLOCKED').length;
  const critical = violations.filter(v => v.severity === 'CRITICAL').length;
  const scopeCreep = identities.filter(a => scopeDiff(a.declared_scope, a.effective_scope).length > 0).length;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Cpu className="h-5 w-5 text-brand" />
            AI / Agentic Security
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Monitor AI agent identities, tool invocations, prompt injection, and scope violations
          </p>
        </div>
        {isDemo && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data · Ingest real agent telemetry via <code className="font-mono">POST /api/agentic/invocations</code>
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Agents', value: identities.length, icon: Bot, color: 'text-brand' },
          { label: 'Scope Creep', value: scopeCreep, icon: Layers, color: 'text-orange-500' },
          { label: 'Blocked Calls', value: blocked, icon: ShieldAlert, color: 'text-red-500' },
          { label: 'Critical Violations', value: critical, icon: AlertTriangle, color: 'text-red-600' },
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {([
          ['violations', `Violations (${violations.length})`],
          ['identities', `Agent Identities (${identities.length})`],
          ['invocations', `Tool Invocations (${invocations.length})`],
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

      {tab === 'violations' && (
        <div className="space-y-2">
          {violations.map((v, i) => (
            <div key={i} className="bg-bg-elevated border border-border-subtle rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${v.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text-primary">{v.type.replace(/_/g, ' ')}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${severityBadge(v.severity)}`}>{v.severity}</span>
                    <span className="text-[10px] text-text-muted ml-auto">{new Date(v.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Agent: <span className="font-mono text-text-secondary">{v.agent_id}</span>
                  </div>
                  <div className="mt-2 bg-bg-subtle rounded p-2">
                    <pre className="text-[10px] text-text-secondary overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(v.details, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'identities' && (
        <div className="space-y-2">
          {identities.map(a => <AgentCard key={a.agent_id} agent={a} />)}
        </div>
      )}

      {tab === 'invocations' && (
        <div className="bg-bg-elevated border border-border-subtle rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-border-subtle text-text-muted">
                  <th className="text-left px-4 py-2.5 font-medium">Agent</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tool</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {invocations.map((inv, i) => (
                  <tr key={i} className="border-b border-border-subtle/50 last:border-0 hover:bg-bg-subtle/30">
                    <td className="px-4 py-2.5 font-mono text-text-secondary">{inv.agent_id}</td>
                    <td className="px-4 py-2.5 font-mono text-text-primary">{inv.tool_name}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadge(inv.status)}`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-text-muted">{new Date(inv.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
