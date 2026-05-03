import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSearch, ShieldAlert, TriangleAlert } from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import { useTestRunDetail, useTestRuns } from '@/hooks/use-security-ops';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp || timestamp === 'None') return 'Pending';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusTone(status?: string) {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'bg-emerald-500/10 text-emerald-600';
    case 'RUNNING':
      return 'bg-brand/10 text-brand';
    case 'FAILED':
      return 'bg-red-500/10 text-red-500';
    default:
      return 'bg-amber-500/10 text-amber-700';
  }
}

const TestInspector: React.FC = () => {
  const runs = useTestRuns(12);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runDetail = useTestRunDetail(selectedRunId);

  useEffect(() => {
    if (!selectedRunId && runs.data?.runs?.length) {
      setSelectedRunId(runs.data.runs[0].id);
    }
  }, [runs.data, selectedRunId]);

  const activeRun = useMemo(
    () => runs.data?.runs?.find((run) => run.id === selectedRunId) ?? null,
    [runs.data, selectedRunId],
  );

  const openFindingExport = (format: 'sarif' | 'junit') => {
    if (!selectedRunId) return;
    window.open(`${API_BASE_URL}/api/tests/runs/${selectedRunId}/findings?format=${format}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {runs.isError && <QueryError message="Failed to load recent test runs" onRetry={() => runs.refetch()} />}
      {runDetail.isError && <QueryError message="Failed to load the selected run details" onRetry={() => runDetail.refetch()} />}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <FileSearch size={12} />
            Recent runs
          </div>

          <div className="mt-4 space-y-3 max-h-[620px] overflow-auto pr-1">
            {runs.isLoading ? (
              <SkeletonLoader variant="list" count={5} />
            ) : runs.data?.runs?.length ? (
              runs.data.runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                    selectedRunId === run.id
                      ? 'border-brand/30 bg-brand/5 shadow-sm'
                      : 'border-border-subtle bg-bg-base hover:border-brand/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-text-primary">{run.id.slice(0, 8)}...</div>
                      <div className="mt-1 text-[11px] text-text-muted">{formatTimestamp(run.created_at)}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-text-muted">
                    <div>{run.total_tests} tests</div>
                    <div>{run.vulnerable_count} findings</div>
                    <div>{run.error_count} errors</div>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState title="No runs yet" description="Start a verification run from Configuration to inspect results here." />
            )}
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-6">
          {runDetail.isLoading && <SkeletonLoader variant="metric" count={3} />}

          {!runDetail.isLoading && !runDetail.data && (
            <EmptyState title="Select a run" description="Choose a test run from the left rail to inspect requests, findings, and export artifacts." />
          )}

          {!runDetail.isLoading && runDetail.data && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Run inspector</div>
                  <h2 className="mt-1 text-sm font-bold text-text-primary">{runDetail.data.id}</h2>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Started {formatTimestamp(runDetail.data.started_at || activeRun?.created_at)} · completed {formatTimestamp(runDetail.data.completed_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone(runDetail.data.status)}`}>
                    {runDetail.data.status}
                  </span>
                  <button onClick={() => openFindingExport('sarif')} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-brand/20 transition-colors">
                    <Download size={12} />
                    SARIF
                  </button>
                  <button onClick={() => openFindingExport('junit')} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-brand/20 transition-colors">
                    <Download size={12} />
                    JUnit
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="text-[11px] text-text-muted">Total tests</div>
                  <div className="mt-1 text-2xl font-bold text-text-primary">{runDetail.data.total_tests}</div>
                </div>
                <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="text-[11px] text-text-muted">Findings</div>
                  <div className="mt-1 text-2xl font-bold text-red-500">{runDetail.data.vulnerable_count}</div>
                </div>
                <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="text-[11px] text-text-muted">Errors</div>
                  <div className="mt-1 text-2xl font-bold text-amber-600">{runDetail.data.error_count}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Result records</div>
                {runDetail.data.results.length ? (
                  runDetail.data.results.map((result, index) => (
                    <div key={`${result.endpoint_id}-${result.template_id}-${index}`} className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-sm font-bold text-text-primary">{result.template_id}</div>
                          <div className="mt-1 text-[11px] text-text-muted">Endpoint {result.endpoint_id}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.is_vulnerable ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-500">
                              <ShieldAlert size={10} />
                              vulnerable
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">
                              clean
                            </span>
                          )}
                          {result.severity ? (
                            <span className="rounded-full bg-bg-elevated border border-border-subtle px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">
                              {result.severity}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {result.error ? (
                        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
                          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                          <span>{result.error}</span>
                        </div>
                      ) : null}

                      {result.evidence ? (
                        <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-border-subtle bg-black/[0.03] px-3 py-3 text-[11px] text-text-primary font-mono whitespace-pre-wrap">
                          {String(result.evidence)}
                        </pre>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <EmptyState title="No result rows" description="This run has not persisted individual result records yet." />
                )}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};

export default TestInspector;
