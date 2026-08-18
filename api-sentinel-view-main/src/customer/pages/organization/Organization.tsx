import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ChevronRight, Eye, Globe, Lock, RefreshCw, ShieldAlert } from 'lucide-react';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import PageHeader from '@/components/shared/PageHeader';
import { MethodBadge } from '@/components/shared/Badges';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import { EvidenceStatLine } from '@/components/ui/EvidenceStatLine';
import EvidenceStamp from '@/components/ui/EvidenceStamp';
import EvidenceLedgerItem from '@/components/ui/EvidenceLedger';
import { useApiCollections } from '@/hooks/use-discovery';
import { useOrganizationAttention } from '@/hooks/use-organization';
import { useOnboarding } from '@/lib/onboarding-context';
import type { AktoApiCollection } from '@/services/discovery.service';

const SEV_META: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: 'Critical', color: '#EF4444' },
  HIGH: { label: 'High', color: '#F97316' },
  MEDIUM: { label: 'Medium', color: '#EAB308' },
  LOW: { label: 'Low', color: '#22C55E' },
  INFO: { label: 'Informational', color: '#3B82F6' },
};

const SeverityChip: React.FC<{ severity: string }> = ({ severity }) => {
  const key = (severity || 'LOW').toUpperCase();
  const meta = SEV_META[key] || SEV_META.LOW;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}14` }}
      aria-label={`Severity ${meta.label}`}
    >
      {meta.label}
    </span>
  );
};

const Organization: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const windowHours = timeRange === '24h' ? 24 : 168;
  const attention = useOrganizationAttention(windowHours);
  const { data: collectionsData, isLoading: collectionsLoading } = useApiCollections();
  const collections = collectionsData?.apiCollections ?? [];

  const data = attention.data;
  const posture = data?.posture.score ?? 0;
  const postureTone = posture >= 70 ? 'warn' : posture >= 35 ? 'signal' : 'ok';

  return (
    <div className="w-full space-y-6 pb-10 animate-fade-in">
      <PageHeader
        eyebrow="Workspace"
        title="Organization"
        description="Open findings ranked by the documented risk model. Inventory facts are listed separately — they are not extra score points."
        actions={
          <>
            <button
              type="button"
              aria-label="Refresh organization attention"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['organization'] });
                qc.invalidateQueries({ queryKey: ['discovery'] });
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-muted-foreground transition-colors hover:text-brand"
            >
              <RefreshCw size={13} className={attention.isLoading ? 'animate-spin' : ''} />
            </button>
            <TimeFilter value={timeRange} onChange={setTimeRange} />
          </>
        }
      />

      {attention.isError && (
        <QueryError message="Failed to load organization attention" onRetry={() => attention.refetch()} />
      )}

      {!onboarding.data.completed && (
        <EvidencePanel className="p-5">
          <EvidenceSectionHead code="SETUP" title="Onboarding incomplete" />
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            Finish deployment, traffic, and application setup before treating posture as a baseline.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/admin/onboarding')}
              className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Continue onboarding
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/applications/add')}
              className="rounded-lg border border-border-subtle px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
            >
              Register app
            </button>
          </div>
        </EvidencePanel>
      )}

      {attention.isLoading && !data ? (
        <TableSkeleton columns={4} rows={4} />
      ) : data ? (
        <>
          <div className="evd-ledger">
            <EvidenceLedgerItem icon={ShieldAlert} color="#EF4444" label="Critical" value={data.severity.critical} />
            <EvidenceLedgerItem icon={ShieldAlert} color="#F97316" label="High" value={data.severity.high} />
            <EvidenceLedgerItem icon={AlertTriangle} color="#EAB308" label="Medium" value={data.severity.medium} />
            <EvidenceLedgerItem icon={Activity} color="#22C55E" label="Low" value={data.severity.low} />
            <EvidenceLedgerItem icon={Globe} color="#3B82F6" label="APIs" value={data.inventory.apis_discovered} />
            <EvidenceLedgerItem icon={Lock} color="#22C55E" label="Open alerts" value={data.activity.open_alerts} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EvidencePanel className="p-5">
              <div className="flex items-start justify-between gap-3">
                <EvidenceSectionHead code="POSTURE" title="Security posture" />
                <EvidenceStamp tone={postureTone}>{posture}</EvidenceStamp>
              </div>
              <p className="text-sm leading-6 text-text-secondary">{data.posture.scale}. {data.risk_model.formula}</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{data.risk_model.rationale}</p>
              <div className="mt-3">
                {data.posture.reasons.map((reason) => (
                  <EvidenceStatLine
                    key={reason.factor}
                    label={`${reason.factor} (${reason.count})`}
                    value={`+${reason.points}`}
                  />
                ))}
              </div>
            </EvidencePanel>

            <EvidencePanel className="p-5">
              <EvidenceSectionHead code="INVENTORY" title="API surface" desc={`${windowHours}h window`} />
              <EvidenceStatLine label="Discovered APIs" value={data.inventory.apis_discovered} />
              <EvidenceStatLine label="Internet exposed (PUBLIC)" value={data.inventory.internet_facing} />
              <EvidenceStatLine label="Shadow / rogue" value={data.inventory.shadow} />
              <EvidenceStatLine label="Unauthenticated" value={data.inventory.unauthenticated} />
              <EvidenceStatLine label="Sensitive" value={data.inventory.sensitive} />
              <EvidenceStatLine label="New findings" value={data.activity.new_findings} />
              <EvidenceStatLine label="Resolved findings" value={data.activity.resolved_findings} />
            </EvidencePanel>
          </div>

          {data.notes.length > 0 && (
            <EvidencePanel className="p-4">
              {data.notes.map((note) => (
                <p key={note} className="text-sm leading-6 text-text-secondary">{note}</p>
              ))}
            </EvidencePanel>
          )}

          <div>
            <EvidenceSectionHead
              code="RISKS"
              title="Top risks"
              action={<span className="text-xs text-text-muted">{data.top_risks.length} open</span>}
            />
            {data.top_risks.length === 0 ? (
              <EvidencePanel className="p-10 text-center">
                <Eye size={22} className="mx-auto mb-3 text-text-muted" />
                <p className="text-sm text-text-secondary">
                  No open findings in this tenant. That is not the same as a verified-clean estate.
                </p>
              </EvidencePanel>
            ) : (
              <div className="evd-table-wrap">
                <table className="evd-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Finding</th>
                      <th>API</th>
                      <th>Evidence</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_risks.map((risk) => {
                      const path = risk.api.url || 'Unknown API';
                      return (
                        <tr key={risk.id} onClick={() => navigate(`/app/findings/${risk.id}`)}>
                          <td><SeverityChip severity={risk.severity} /></td>
                          <td>
                            <div className="font-semibold text-text-primary">{risk.title}</div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                              {risk.facts.map((fact) => (
                                <span key={`${fact.label}-${fact.value}`}>
                                  {fact.label}: {fact.value}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2 font-mono text-xs text-text-secondary">
                              {risk.api.method && <MethodBadge method={risk.api.method} />}
                              <span className="truncate">{risk.api.host ? `${risk.api.host}${path}` : path}</span>
                            </div>
                          </td>
                          <td>
                            {risk.has_evidence ? (
                              <span className="text-xs font-semibold text-emerald-600">Ready</span>
                            ) : (
                              <span className="text-xs text-text-muted">None yet</span>
                            )}
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                              {risk.next_action} <ChevronRight size={12} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      <div>
        <EvidenceSectionHead
          code="APPS"
          title="Applications"
          action={<span className="text-xs text-text-muted">{collections.length} apps</span>}
        />
        {collectionsLoading ? (
          <TableSkeleton columns={3} rows={2} />
        ) : collections.length === 0 ? (
          <EvidencePanel className="p-10 text-center">
            <Globe size={22} className="mx-auto mb-3 text-text-muted" />
            <p className="text-sm text-text-secondary">No applications found. Connect a traffic source to start discovering APIs.</p>
          </EvidencePanel>
        ) : (
          <div className="evd-table-wrap">
            <table className="evd-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Host</th>
                  <th>Endpoints</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {collections.map((app: AktoApiCollection) => (
                  <tr key={String(app.id)} onClick={() => navigate('/app/discovery')}>
                    <td className="font-semibold text-text-primary">{app.displayName || app.hostName || `Collection ${app.id}`}</td>
                    <td className="font-mono text-xs">{app.hostName || '—'}</td>
                    <td>{app.urlsCount ?? 0}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                        Open catalogue <ChevronRight size={12} />
                      </span>
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

export default Organization;
