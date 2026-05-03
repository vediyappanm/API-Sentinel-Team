import React, { useState, useMemo } from 'react';
import { GitBranch, RefreshCw, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import GlassCard from '@/components/ui/GlassCard';
import { get } from '@/lib/api-client';

interface GraphNode { id: string; label: string; }
interface GraphEdge { from: string; to: string; count: number; }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; }

async function fetchGraph(): Promise<GraphData> {
  return get<GraphData>('/lineage/graph');
}

// Demo data shown when backend has no data yet
const DEMO: GraphData = {
  nodes: [
    { id: '/api/auth/login', label: '/auth/login' },
    { id: '/api/users/me', label: '/users/me' },
    { id: '/api/endpoints', label: '/endpoints' },
    { id: '/api/alerts', label: '/alerts' },
    { id: '/api/reports', label: '/reports' },
  ],
  edges: [
    { from: '/api/auth/login', to: '/api/users/me', count: 142 },
    { from: '/api/users/me', to: '/api/endpoints', count: 98 },
    { from: '/api/users/me', to: '/api/alerts', count: 76 },
    { from: '/api/endpoints', to: '/api/reports', count: 34 },
  ],
};

const NODE_COLORS = ['#632CA6', '#3B82F6', '#22C55E', '#F97316', '#EAB308', '#EC4899', '#8B5CF6'];

function layoutNodes(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cols = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.set(n.id, {
      x: 80 + col * 180,
      y: 40 + row * 110,
    });
  });
  return positions;
}

const ApiSequenceFlow: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<GraphData>({
    queryKey: ['lineage-graph'],
    queryFn: fetchGraph,
    retry: 1,
  });

  const graph = useMemo<GraphData>(() => {
    if (data && data.nodes.length > 0) return data;
    return DEMO;
  }, [data]);

  const positions = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);

  const svgH = useMemo(() => {
    let maxY = 200;
    positions.forEach(p => { if (p.y + 60 > maxY) maxY = p.y + 60; });
    return maxY + 40;
  }, [positions]);

  const selectedEdges = useMemo(
    () => graph.edges.filter(e => !selectedNode || e.from === selectedNode || e.to === selectedNode),
    [graph.edges, selectedNode],
  );

  const maxCount = graph.edges.reduce((m, e) => Math.max(m, e.count), 1);

  return (
    <div className="space-y-5 animate-fade-in">
      <GlassCard variant="elevated" className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <GitBranch size={18} className="text-brand" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">API Sequence Flow</h2>
              <p className="text-[11px] text-text-muted">Call chains detected from live traffic analysis</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-brand transition-all"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* SVG Graph */}
        <div className="relative bg-bg-base rounded-xl border border-border-subtle overflow-auto">
          <svg width="100%" height={svgH} style={{ minWidth: 600, display: 'block' }}>
            {/* Edges */}
            {graph.edges.map((edge, i) => {
              const fp = positions.get(edge.from);
              const tp = positions.get(edge.to);
              if (!fp || !tp) return null;
              const highlight = !selectedNode || edge.from === selectedNode || edge.to === selectedNode;
              const weight = 1 + Math.round((edge.count / maxCount) * 3);
              const x1 = fp.x + 70;
              const y1 = fp.y + 16;
              const x2 = tp.x;
              const y2 = tp.y + 16;
              const midX = (x1 + x2) / 2;
              return (
                <g key={i} opacity={highlight ? 1 : 0.15}>
                  <path
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={highlight ? 'rgba(99,44,175,0.6)' : 'rgba(99,44,175,0.15)'}
                    strokeWidth={weight}
                    strokeDasharray={highlight ? undefined : '4 3'}
                    markerEnd="url(#arrow)"
                  />
                  <text
                    x={midX}
                    y={Math.min(y1, y2) - 6}
                    textAnchor="middle"
                    fill="#6B6B80"
                    fontSize={9}
                    fontFamily="monospace"
                  >
                    {edge.count}x
                  </text>
                </g>
              );
            })}

            {/* Arrow marker */}
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill="rgba(99,44,175,0.6)" />
              </marker>
            </defs>

            {/* Nodes */}
            {graph.nodes.map((node, i) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const color = NODE_COLORS[i % NODE_COLORS.length];
              const isSelected = selectedNode === node.id;
              const hasEdge = selectedEdges.some(e => e.from === node.id || e.to === node.id);
              const dim = selectedNode && !isSelected && !hasEdge;
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1 }}
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                >
                  <rect
                    width={140}
                    height={32}
                    rx={8}
                    fill={`${color}12`}
                    stroke={isSelected ? color : 'rgba(255,255,255,0.08)'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  <rect width={4} height={32} rx={2} fill={color} />
                  <text
                    x={14}
                    y={20}
                    fill="#e8edf3"
                    fontSize={10}
                    fontFamily="monospace"
                    fontWeight={isSelected ? 700 : 400}
                  >
                    {node.label.length > 18 ? node.label.slice(-18) : node.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected node details */}
        {selectedNode && (
          <div className="mt-3 p-3 bg-bg-base rounded-lg border border-border-subtle animate-fade-in">
            <p className="text-[11px] font-bold text-text-primary font-mono mb-2">{selectedNode}</p>
            <div className="space-y-1">
              {selectedEdges.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <span className="font-mono text-brand truncate max-w-[180px]">{e.from}</span>
                  <ArrowRight size={10} className="shrink-0 text-text-muted" />
                  <span className="font-mono text-text-primary truncate max-w-[180px]">{e.to}</span>
                  <span className="ml-auto text-text-muted tabular-nums">{e.count}x</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="mt-2 text-[10px] text-text-muted hover:text-brand transition-colors"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] text-text-muted">
            {graph.nodes.length} nodes &bull; {graph.edges.length} edges
            {(isError || !data?.nodes.length) && ' (demo data — connect traffic to populate)'}
          </p>
          <p className="text-[10px] text-text-muted">Click a node to highlight its connections</p>
        </div>
      </GlassCard>

      {/* Top paths adjacency list */}
      {graph.edges.length > 0 && (
        <GlassCard variant="default" className="p-4">
          <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-3">
            Most Traveled Paths
          </p>
          <div className="space-y-1.5">
            {[...graph.edges].sort((a, b) => b.count - a.count).slice(0, 8).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-5 text-text-muted tabular-nums">{i + 1}.</span>
                <span className="font-mono text-brand truncate max-w-[200px]">{e.from}</span>
                <ArrowRight size={10} className="shrink-0 text-text-muted" />
                <span className="font-mono text-text-primary truncate max-w-[200px]">{e.to}</span>
                <div className="flex-1 h-1 bg-bg-elevated rounded-full overflow-hidden mx-2">
                  <div
                    className="h-full bg-brand/50 rounded-full"
                    style={{ width: `${(e.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-text-muted tabular-nums">{e.count}x</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default ApiSequenceFlow;
