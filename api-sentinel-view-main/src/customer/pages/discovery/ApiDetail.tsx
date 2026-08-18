import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import PageHeader from '@/components/shared/PageHeader';
import { MethodBadge } from '@/components/shared/Badges';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import { EvidenceStatLine } from '@/components/ui/EvidenceStatLine';
import EvidenceViewer from '@/components/shared/EvidenceViewer';
import { useEndpoint, useEndpointEvidence, useEndpointHourly } from '@/hooks/use-discovery';
import { useEndpointFindings } from '@/hooks/use-testing';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
};

const ApiDetail: React.FC = () => {
  const { endpointId } = useParams<{ endpointId: string }>();
  const navigate = useNavigate();
  const endpoint = useEndpoint(endpointId);
  const hourly = useEndpointHourly(endpointId, 24);
  const evidence = useEndpointEvidence(endpointId);
  const findings = useEndpointFindings(endpointId);
  const ep = endpoint.data;
  const metrics = hourly.data?.metrics ?? [];
  const requests = metrics.reduce((sum, row) => sum + (row.request_count || 0), 0);
  const errors = metrics.reduce((sum, row) => sum + (row.error_count || 0), 0);
  const avgLatency = metrics.length
    ? Math.round(metrics.reduce((sum, row) => sum + (row.avg_latency_ms || 0), 0) / metrics.length)
    : null;

  return (
    <div className="w-full space-y-6 pb-10 animate-fade-in">
      <button
        type="button"
        onClick={() => navigate('/app/discovery')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} /> Catalogue
      </button>

      {endpoint.isError && <QueryError message="Failed to load this API" onRetry={() => endpoint.refetch()} />}
      {endpoint.isLoading && <TableSkeleton columns={4} rows={6} />}

      {ep && (
        <>
          <PageHeader
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                {ep.method && <MethodBadge method={ep.method} />}
                <span className="font-mono">{ep.path || ep.path_pattern || '/'}</span>
              </span>
            }
            description={`${ep.host || 'unknown host'} · ${ep.api_type || 'REST'} · ${ep.access_type || 'PRIVATE'}`}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="OVERVIEW" title="What is this API?" />
              <EvidenceStatLine label="Owner" value={ep.owner || 'Unassigned'} />
              <EvidenceStatLine label="Authentication" value={(ep.auth_types_found || []).join(', ') || 'None observed'} />
              <EvidenceStatLine label="Sensitive data" value={ep.is_sensitive ? 'Yes' : 'Not flagged'} />
              <EvidenceStatLine label="Inventory status" value={ep.status || 'ACTIVE'} />
              <EvidenceStatLine label="Last seen" value={ep.last_seen || 'Never'} />
              <EvidenceStatLine label="Last tested" value={ep.last_tested || 'Not tested'} />
              <EvidenceStatLine label="Discovery source" value={(ep.sources || []).join(', ') || 'Traffic'} />
            </EvidencePanel>

            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="TRAFFIC" title="Last 24 hours" />
              {metrics.length === 0 ? (
                <p className="text-sm leading-6 text-text-secondary">
                  No hourly metrics persisted for this endpoint. Last response code: {ep.last_response_code ?? 'n/a'}.
                </p>
              ) : (
                <>
                  <EvidenceStatLine label="Requests" value={requests} />
                  <EvidenceStatLine label="Errors" value={errors} />
                  <EvidenceStatLine label="Avg latency (ms)" value={avgLatency ?? 'n/a'} />
                  <p className="mt-2 text-xs text-text-muted">
                    p95 is not shown here because the in-process aggregator currently copies average latency into that column.
                  </p>
                </>
              )}
            </EvidencePanel>
          </div>

          <EvidencePanel className="p-5">
            <EvidenceSectionHead code="FINDINGS" title="Open and recent findings" />
            {(findings.data?.vulnerabilities || []).length === 0 ? (
              <p className="text-sm leading-6 text-text-secondary">No findings linked to this endpoint.</p>
            ) : (
              <div className="evd-table-wrap">
                <table className="evd-table">
                  <thead>
                    <tr>
                      <th>Finding</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(findings.data?.vulnerabilities || []).map((finding) => (
                      <tr key={finding.id} onClick={() => navigate(`/app/findings/${finding.id}`)}>
                        <td>
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={13} style={{ color: SEV_COLOR[(finding.severity || 'LOW').toUpperCase()] || '#6B7280' }} />
                            <span className="font-semibold text-text-primary">{finding.type || finding.template_id}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-text-muted">{finding.description || 'No description'}</p>
                        </td>
                        <td>{finding.status}</td>
                        <td className="text-xs font-semibold text-brand">Investigate</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </EvidencePanel>

          <EvidencePanel className="p-5">
            <EvidenceSectionHead code="EVIDENCE" title="Evidence records" />
            {(evidence.data?.evidence || []).length === 0 ? (
              <p className="text-sm leading-6 text-text-secondary">No evidence records stored for this endpoint.</p>
            ) : (
              <div className="space-y-3">
                {(evidence.data?.evidence || []).map((record) => (
                  <div key={record.id} className="rounded-lg border border-border-subtle p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{record.type} · {record.severity}</p>
                    <p className="mt-1 text-sm text-text-primary">{record.summary || 'No summary'}</p>
                    <p className="mt-1 font-mono text-xs text-text-muted">{record.created_at}</p>
                  </div>
                ))}
              </div>
            )}
          </EvidencePanel>

          {(ep.last_request_body || ep.last_response_body) && (
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="SAMPLE" title="Last captured sample" />
              <EvidenceViewer
                evidence={JSON.stringify({
                  sent_request: { method: ep.method, url: `${ep.host || ''}${ep.path || ''}`, body: ep.last_request_body },
                  received_response: { status_code: ep.last_response_code ?? undefined, body: ep.last_response_body },
                })}
              />
            </EvidencePanel>
          )}
        </>
      )}
    </div>
  );
};

export default ApiDetail;
