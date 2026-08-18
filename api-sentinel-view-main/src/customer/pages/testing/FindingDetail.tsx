import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import PageHeader from '@/components/shared/PageHeader';
import { MethodBadge, StatusBadge } from '@/components/shared/Badges';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import { EvidenceStatLine } from '@/components/ui/EvidenceStatLine';
import EvidenceViewer from '@/components/shared/EvidenceViewer';
import { useFinding } from '@/hooks/use-testing';

const SEV_META: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: 'Critical', color: '#EF4444' },
  HIGH: { label: 'High', color: '#F97316' },
  MEDIUM: { label: 'Medium', color: '#EAB308' },
  LOW: { label: 'Low', color: '#22C55E' },
  INFO: { label: 'Informational', color: '#3B82F6' },
};

function hasEvidence(evidence: unknown): boolean {
  if (evidence == null) return false;
  if (typeof evidence === 'string') return evidence.trim().length > 0;
  if (Array.isArray(evidence)) return evidence.length > 0;
  if (typeof evidence === 'object') return Object.keys(evidence as object).length > 0;
  return Boolean(evidence);
}

const FindingDetail: React.FC = () => {
  const { findingId } = useParams<{ findingId: string }>();
  const navigate = useNavigate();
  const finding = useFinding(findingId);
  const row = finding.data;
  const severity = (row?.severity || 'LOW').toUpperCase();
  const meta = SEV_META[severity] || SEV_META.LOW;
  const evidencePresent = hasEvidence(row?.evidence);

  return (
    <div className="w-full space-y-6 pb-10 animate-fade-in">
      <button
        type="button"
        onClick={() => navigate('/app/testing')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={14} /> Findings
      </button>

      {finding.isError && <QueryError message="Failed to load this finding" onRetry={() => finding.refetch()} />}
      {finding.isLoading && <TableSkeleton columns={3} rows={6} />}

      {row && (
        <>
          <PageHeader
            title={row.type || row.template_id || 'Finding'}
            actions={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
                  style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}14` }}
                  aria-label={`Severity ${meta.label}`}
                >
                  <AlertTriangle size={11} aria-hidden />
                  {meta.label}
                </span>
                <StatusBadge status={row.status || 'OPEN'} />
              </span>
            }
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="FACT" title="What we observed" />
              <EvidenceStatLine label="Status" value={row.status || 'OPEN'} />
              <EvidenceStatLine label="Confidence" value={row.confidence ?? 'Not scored'} />
              <EvidenceStatLine label="Endpoint" value={
                <span className="inline-flex items-center gap-2">
                  {row.method && <MethodBadge method={row.method} />}
                  <span>{row.url || 'Unknown'}</span>
                </span>
              } />
              <EvidenceStatLine label="First seen" value={row.first_seen_at || row.created_at || 'Unknown'} />
              <EvidenceStatLine label="Last seen" value={row.last_seen_at || 'Unknown'} />
              {row.endpoint_id && (
                <div className="pt-3">
                  <Link to={`/app/discovery/endpoint/${row.endpoint_id}`} className="text-sm font-semibold text-brand">
                    Open API detail
                  </Link>
                </div>
              )}
            </EvidencePanel>

            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="EVIDENCE" title="Proof" />
              {evidencePresent ? (
                <p className="text-sm leading-6 text-text-secondary">
                  Evidence below is stored on this finding. AI conclusions are not generated here — only persisted artifacts.
                </p>
              ) : (
                <p className="text-sm leading-6 text-text-secondary">
                  No evidence payload is stored on this finding. Do not treat the title as proof.
                </p>
              )}
              {row.ticket_url && (
                <p className="mt-2 text-sm">
                  Ticket: <a className="text-brand" href={row.ticket_url} rel="noreferrer">{row.ticket_url}</a>
                </p>
              )}
            </EvidencePanel>
          </div>

          {row.description && (
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="INFERENCE" title="Description" />
              <p className="text-sm leading-6 text-text-secondary">{row.description}</p>
              <p className="mt-2 text-xs text-text-muted">This text is the detector summary, not an independent confirmation.</p>
            </EvidencePanel>
          )}

          {row.remediation && (
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="RECOMMENDATION" title="Recommended fix" />
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{row.remediation}</p>
            </EvidencePanel>
          )}

          {evidencePresent && (
            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="ARTIFACT" title="Stored evidence" />
              <EvidenceViewer evidence={typeof row.evidence === 'string' ? row.evidence : JSON.stringify(row.evidence, null, 2)} />
            </EvidencePanel>
          )}
        </>
      )}
    </div>
  );
};

export default FindingDetail;
