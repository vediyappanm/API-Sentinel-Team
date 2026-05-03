import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import {
  AlertTriangle, RefreshCw, ZoomIn, ZoomOut, Maximize2, Network,
  ChevronRight, Info, Activity
} from 'lucide-react';

interface GraphNode {
  id: string;
  method?: string;
  path?: string;
  call_count?: number;
  avg_latency_ms?: number;
  risk_score?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  transition_count?: number;
}

interface GraphData {
  id: string;
  version: number;
  built_at: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Violation {
  id: string;
  actor_id: string;
  from_path: string;
  to_path: string;
  type: string;
  confidence: number;
  created_at: string;
}

// Simple force layout (no d3 dependency)
function useForceLayout(nodes: GraphNode[], edges: GraphEdge[]) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (!nodes.length) return;

    // Initialize positions in a circle
    const W = 800, H = 560;
    const cx = W / 2, cy = H / 2;
    const radius = Math.min(W, H) * 0.35;
    const pos: Record<string, { x: number; y: number }> = {};

    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      pos[n.id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      };
    });

    // Simple iterative force simulation
    const REPEL = 3000, ATTRACT = 0.05, DAMPING = 0.85;
    let vx: Record<string, number> = {}, vy: Record<string, number> = {};
    nodes.forEach(n => { vx[n.id] = 0; vy[n.id] = 0; });

    for (let iter = 0; iter < 80; iter++) {
      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i].id, b = nodes[j].id;
          const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const force = REPEL / (dist * dist);
          vx[a] += (dx / dist) * force;
          vy[a] += (dy / dist) * force;
          vx[b] -= (dx / dist) * force;
          vy[b] -= (dy / dist) * force;
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const a = e.source, b = e.target;
        if (!pos[a] || !pos[b]) return;
        const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
        vx[a] += dx * ATTRACT;
        vy[a] += dy * ATTRACT;
        vx[b] -= dx * ATTRACT;
        vy[b] -= dy * ATTRACT;
      });

      // Center gravity
      nodes.forEach(n => {
        vx[n.id] += (cx - pos[n.id].x) * 0.01;
        vy[n.id] += (cy - pos[n.id].y) * 0.01;
      });

      // Apply + dampen
      nodes.forEach(n => {
        vx[n.id] *= DAMPING;
        vy[n.id] *= DAMPING;
        pos[n.id].x = Math.max(40, Math.min(W - 40, pos[n.id].x + vx[n.id]));
        pos[n.id].y = Math.max(40, Math.min(H - 40, pos[n.id].y + vy[n.id]));
      });
    }

    setPositions({ ...pos });
  }, [nodes.length, edges.length]);

  return positions;
}

function methodColor(method?: string) {
  switch ((method || '').toUpperCase()) {
    case 'GET': return '#22c55e';
    case 'POST': return '#3b82f6';
    case 'PUT': return '#f59e0b';
    case 'PATCH': return '#a78bfa';
    case 'DELETE': return '#ef4444';
    default: return '#6b7280';
  }
}

function riskColor(risk?: number) {
  if (!risk) return '#6b7280';
  if (risk >= 0.7) return '#ef4444';
  if (risk >= 0.4) return '#f59e0b';
  return '#22c55e';
}

// Fallback demo data when no graph is built
const DEMO_NODES: GraphNode[] = [
  { id: 'POST /auth/login', method: 'POST', path: '/auth/login', call_count: 1240, avg_latency_ms: 42 },
  { id: 'GET /users/me', method: 'GET', path: '/users/me', call_count: 8700, avg_latency_ms: 18 },
  { id: 'GET /orders', method: 'GET', path: '/orders', call_count: 3100, avg_latency_ms: 55 },
  { id: 'POST /orders', method: 'POST', path: '/orders', call_count: 890, avg_latency_ms: 120 },
  { id: 'GET /products', method: 'GET', path: '/products', call_count: 5200, avg_latency_ms: 30 },
  { id: 'PUT /users/:id', method: 'PUT', path: '/users/:id', call_count: 340, avg_latency_ms: 65, risk_score: 0.72 },
  { id: 'DELETE /orders/:id', method: 'DELETE', path: '/orders/:id', call_count: 120, avg_latency_ms: 40, risk_score: 0.45 },
  { id: 'GET /payments', method: 'GET', path: '/payments', call_count: 760, avg_latency_ms: 35 },
];

const DEMO_EDGES: GraphEdge[] = [
  { source: 'POST /auth/login', target: 'GET /users/me', weight: 0.9, transition_count: 1100 },
  { source: 'GET /users/me', target: 'GET /orders', weight: 0.6, transition_count: 890 },
  { source: 'GET /users/me', target: 'GET /products', weight: 0.7, transition_count: 1200 },
  { source: 'GET /products', target: 'POST /orders', weight: 0.4, transition_count: 780 },
  { source: 'POST /orders', target: 'GET /payments', weight: 0.8, transition_count: 820 },
  { source: 'GET /orders', target: 'DELETE /orders/:id', weight: 0.1, transition_count: 95 },
  { source: 'GET /users/me', target: 'PUT /users/:id', weight: 0.05, transition_count: 40 },
];

const DEMO_VIOLATIONS: Violation[] = [
  { id: '1', actor_id: 'ip:1.2.3.4', from_path: 'POST /auth/login', to_path: 'DELETE /orders/:id', type: 'UNEXPECTED_SEQUENCE', confidence: 0.91, created_at: new Date(Date.now() - 120000).toISOString() },
  { id: '2', actor_id: 'user:bob', from_path: 'GET /products', to_path: 'PUT /users/:id', type: 'PRIVILEGE_ESCALATION', confidence: 0.77, created_at: new Date(Date.now() - 900000).toISOString() },
];

export default function BusinessLogicGraph() {
  const qc = useQueryClient();
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<'graph' | 'violations'>('graph');

  const { data: graphData, isLoading, isError } = useQuery<GraphData>({
    queryKey: ['business-logic-graph'],
    queryFn: () => get('/business-logic/graph/latest').catch(() => null),
    retry: false,
  });

  const { data: violationsData } = useQuery({
    queryKey: ['business-logic-violations'],
    queryFn: () => get('/business-logic/violations'),
    retry: false,
  });

  const rebuildMutation = useMutation({
    mutationFn: () => post('/business-logic/rebuild', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['business-logic-graph'] }),
  });

  const nodes: GraphNode[] = graphData?.nodes?.length ? graphData.nodes : DEMO_NODES;
  const edges: GraphEdge[] = graphData?.edges?.length ? graphData.edges : DEMO_EDGES;
  const violations: Violation[] = violationsData?.violations?.length ? violationsData.violations : DEMO_VIOLATIONS;
  const isDemo = !graphData?.nodes?.length;

  const positions = useForceLayout(nodes, edges);
  const W = 800, H = 560;

  const selectedNodeEdges = selectedNode
    ? edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id)
    : [];

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Network className="h-5 w-5 text-brand" />
            Business Logic Graph
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            API sequence model — detects abnormal transitions and privilege escalation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              Demo data · Rebuild to analyse real traffic
            </span>
          )}
          {graphData?.built_at && (
            <span className="text-[10px] text-text-muted">
              Built {new Date(graphData.built_at).toLocaleString()}
            </span>
          )}
          <button
            onClick={() => rebuildMutation.mutate()}
            disabled={rebuildMutation.isPending}
            className="flex items-center gap-1.5 text-xs bg-brand text-white px-3 py-1.5 rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rebuildMutation.isPending ? 'animate-spin' : ''}`} />
            {rebuildMutation.isPending ? 'Rebuilding…' : 'Rebuild Graph'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        {(['graph', 'violations'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand text-brand'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {t === 'graph' ? 'Call Graph' : `Violations (${violations.length})`}
          </button>
        ))}
      </div>

      {tab === 'graph' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-4">
          {/* SVG canvas */}
          <div className="bg-bg-elevated border border-border-subtle rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
              <span className="text-xs text-text-muted">
                {nodes.length} endpoints · {edges.length} transitions
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-bg-subtle rounded">
                  <ZoomOut className="h-3.5 w-3.5 text-text-muted" />
                </button>
                <span className="text-[10px] text-text-muted w-8 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 hover:bg-bg-subtle rounded">
                  <ZoomIn className="h-3.5 w-3.5 text-text-muted" />
                </button>
                <button onClick={() => setZoom(1)} className="p-1 hover:bg-bg-subtle rounded">
                  <Maximize2 className="h-3.5 w-3.5 text-text-muted" />
                </button>
              </div>
            </div>

            <div style={{ overflow: 'hidden' }}>
              <svg
                width="100%"
                viewBox={`0 0 ${W} ${H}`}
                style={{ display: 'block', transform: `scale(${zoom})`, transformOrigin: 'top left', cursor: 'default' }}
              >
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#6b7280" opacity="0.5" />
                  </marker>
                  <marker id="arrow-hot" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#ef4444" opacity="0.8" />
                  </marker>
                </defs>

                {/* Edges */}
                {edges.map((e, i) => {
                  const a = positions[e.source], b = positions[e.target];
                  if (!a || !b) return null;
                  const isSelected = selectedNode && (e.source === selectedNode.id || e.target === selectedNode.id);
                  const isViolation = violations.some(
                    v => v.from_path === e.source && v.to_path === e.target
                  );
                  const midX = (a.x + b.x) / 2 + (b.y - a.y) * 0.1;
                  const midY = (a.y + b.y) / 2 + (a.x - b.x) * 0.1;
                  const strokeW = 1 + (e.weight || 0.1) * 2.5;
                  return (
                    <path
                      key={i}
                      d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`}
                      fill="none"
                      stroke={isViolation ? '#ef4444' : isSelected ? '#8b5cf6' : '#9ca3af'}
                      strokeWidth={isSelected ? strokeW + 1 : strokeW}
                      strokeOpacity={selectedNode && !isSelected ? 0.15 : isViolation ? 0.8 : 0.45}
                      markerEnd={isViolation ? 'url(#arrow-hot)' : 'url(#arrow)'}
                      strokeDasharray={isViolation ? '5,3' : undefined}
                    />
                  );
                })}

                {/* Nodes */}
                {nodes.map(n => {
                  const pos = positions[n.id];
                  if (!pos) return null;
                  const isSelected = selectedNode?.id === n.id;
                  const isConnected = selectedNode
                    ? selectedNodeEdges.some(e => e.source === n.id || e.target === n.id)
                    : false;
                  const isDimmed = selectedNode && !isSelected && !isConnected;
                  const r = 22 + Math.min(n.call_count || 0, 10000) / 1000;
                  const fill = methodColor(n.method);
                  const risk = riskColor(n.risk_score);

                  return (
                    <g
                      key={n.id}
                      transform={`translate(${pos.x},${pos.y})`}
                      style={{ cursor: 'pointer', opacity: isDimmed ? 0.2 : 1 }}
                      onClick={() => setSelectedNode(prev => prev?.id === n.id ? null : n)}
                    >
                      {n.risk_score && n.risk_score > 0.4 && (
                        <circle r={r + 6} fill={risk} opacity={0.15} />
                      )}
                      <circle
                        r={r}
                        fill={fill}
                        fillOpacity={isSelected ? 1 : 0.85}
                        stroke={isSelected ? '#fff' : fill}
                        strokeWidth={isSelected ? 3 : 1.5}
                      />
                      <text
                        textAnchor="middle"
                        y="4"
                        fontSize="9"
                        fill="#fff"
                        fontWeight="bold"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {(n.method || '').slice(0, 4)}
                      </text>

                      {/* Path label below node */}
                      <text
                        textAnchor="middle"
                        y={r + 13}
                        fontSize="8"
                        fill="#374151"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {(n.path || n.id).replace(/\/:[^/]+/g, '/:id').slice(0, 22)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-border-subtle">
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                <span key={m} className="flex items-center gap-1 text-[10px] text-text-muted">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: methodColor(m) }} />
                  {m}
                </span>
              ))}
              <span className="flex items-center gap-1 text-[10px] text-text-muted ml-3">
                <span className="w-2.5 h-2.5 rounded-full inline-block bg-red-500 opacity-20" />
                Risky endpoint
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <span className="border-b border-red-400 border-dashed w-5 inline-block" />
                Violation path
              </span>
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-3">
            {selectedNode ? (
              <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                    style={{ background: methodColor(selectedNode.method) }}
                  >
                    {selectedNode.method}
                  </span>
                  <span className="text-sm font-medium text-text-primary truncate">
                    {selectedNode.path || selectedNode.id}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-bg-subtle rounded p-2">
                    <div className="text-text-muted">Calls / day</div>
                    <div className="font-semibold text-text-primary">{(selectedNode.call_count || 0).toLocaleString()}</div>
                  </div>
                  <div className="bg-bg-subtle rounded p-2">
                    <div className="text-text-muted">Avg latency</div>
                    <div className="font-semibold text-text-primary">{selectedNode.avg_latency_ms ?? '—'}ms</div>
                  </div>
                  {selectedNode.risk_score && (
                    <div className="bg-bg-subtle rounded p-2 col-span-2">
                      <div className="text-text-muted">Risk Score</div>
                      <div className="font-semibold" style={{ color: riskColor(selectedNode.risk_score) }}>
                        {(selectedNode.risk_score * 100).toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Transitions ({selectedNodeEdges.length})</div>
                  <div className="space-y-1">
                    {selectedNodeEdges.map((e, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px]">
                        <ChevronRight className="h-3 w-3 text-text-muted shrink-0" />
                        <span className="text-text-secondary truncate">
                          {e.source === selectedNode.id ? e.target : e.source}
                        </span>
                        <span className="text-text-muted ml-auto shrink-0">{e.transition_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[120px]">
                <Info className="h-4 w-4 text-text-muted" />
                <p className="text-xs text-text-muted text-center">Click a node to inspect transitions</p>
              </div>
            )}

            {/* Stats */}
            <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 space-y-2">
              <div className="text-[10px] text-text-muted uppercase tracking-wide">Summary</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-muted">Endpoints</span>
                  <div className="font-semibold text-text-primary">{nodes.length}</div>
                </div>
                <div>
                  <span className="text-text-muted">Transitions</span>
                  <div className="font-semibold text-text-primary">{edges.length}</div>
                </div>
                <div>
                  <span className="text-text-muted">Violations</span>
                  <div className="font-semibold text-red-500">{violations.length}</div>
                </div>
                <div>
                  <span className="text-text-muted">Graph v</span>
                  <div className="font-semibold text-text-primary">{graphData?.version || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'violations' && (
        <div className="space-y-2">
          {violations.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-text-muted">
              <Activity className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No violations detected</p>
            </div>
          ) : (
            violations.map(v => (
              <div key={v.id} className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-text-primary">{v.type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                      {(v.confidence * 100).toFixed(0)}% conf
                    </span>
                    <span className="text-[10px] text-text-muted ml-auto">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted mt-1">
                    Actor <span className="text-text-secondary font-mono">{v.actor_id}</span>
                    {' '} jumped from{' '}
                    <span className="text-text-secondary font-mono">{v.from_path}</span>
                    {' '} → {' '}
                    <span className="text-text-secondary font-mono">{v.to_path}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
