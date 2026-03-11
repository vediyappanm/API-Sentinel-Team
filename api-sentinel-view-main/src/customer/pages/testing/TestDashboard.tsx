import React from 'react';
import MetricCard from '@/components/shared/MetricCard';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useIssueSummary } from '@/hooks/use-testing';
import { Clock, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

function computeMTTR(total: number, fixed: number): string {
  if (total === 0 || fixed === 0) return 'Tracking...';
  // Estimate: assume issues are created evenly over 30 days
  // MTTR = (avg age of resolved issues) ≈ rough heuristic
  const rate = fixed / total;
  if (rate >= 0.8) return '< 2 days';
  if (rate >= 0.5) return '< 5 days';
  if (rate >= 0.2) return '< 14 days';
  return '> 14 days';
}

function mttrColor(total: number, fixed: number): string {
  const rate = fixed / total;
  if (rate >= 0.5) return '#22C55E';
  if (rate >= 0.2) return '#EAB308';
  return '#F97316';
}

const TestDashboard: React.FC = () => {
  const { data, isLoading, isError, refetch } = useIssueSummary();

  const totalIssues = data?.totalIssues ?? 0;
  const openIssues = data?.openIssues ?? 0;
  const fixedIssues = data?.fixedIssues ?? 0;
  const sev = data?.severityBreakdown ?? {};
  const criticalOpen = (sev as any).CRITICAL ?? 0;
  const mttr = computeMTTR(totalIssues, fixedIssues);
  const color = totalIssues > 0 ? mttrColor(totalIssues, fixedIssues) : '#22C55E';

  return (
    <div className="space-y-4 animate-fade-in">
      {isError && <QueryError message="Failed to load test data" onRetry={() => refetch()} />}

      {isLoading ? <TableSkeleton columns={4} rows={1} /> : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="Total Issues Found" value={String(totalIssues)} />
          <MetricCard label="Critical Open" value={String(criticalOpen)} trend="down" accentColor="hsl(var(--severity-critical))" />
          <MetricCard label="Resolved Issues" value={String(fixedIssues)} trend="up" accentColor="hsl(var(--status-resolved))" />
          <MetricCard label="Avg. MTTR" value={mttr} accentColor={color} />
        </div>
      )}

      {/* MTTR explainer */}
      <div className="rounded-lg border border-border-subtle bg-bg-base p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#F97316]/10 flex items-center justify-center shrink-0 mt-0.5">
          <Clock size={16} className="text-[#F97316]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-text-primary mb-1">Mean Time to Remediate (MTTR)</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            MTTR measures how quickly your team closes vulnerabilities after discovery.
            {fixedIssues > 0
              ? ` ${fixedIssues} of ${totalIssues} issues resolved — estimated remediation cycle: ${mttr}.`
              : ' No resolved issues yet. Track resolution progress here as your team fixes vulnerabilities.'}
          </p>
        </div>
      </div>

      {/* Severity breakdown */}
      {!isLoading && totalIssues > 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-base p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Severity Breakdown</p>
          <div className="flex gap-6 flex-wrap">
            {[
              { label: 'Critical', key: 'CRITICAL', color: '#EF4444', icon: ShieldAlert },
              { label: 'High', key: 'HIGH', color: '#F97316', icon: AlertTriangle },
              { label: 'Medium', key: 'MEDIUM', color: '#EAB308', icon: AlertTriangle },
              { label: 'Low', key: 'LOW', color: '#22C55E', icon: CheckCircle2 },
            ].map(({ label, key, color, icon: Icon }) => (
              <div key={key} className="flex items-center gap-2">
                <Icon size={14} style={{ color }} />
                <span className="text-[11px] text-muted-foreground">{label}:</span>
                <span className="text-sm font-bold font-mono" style={{ color }}>
                  {(sev as any)[key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && totalIssues === 0 && (
        <div className="rounded-lg border border-border-subtle bg-bg-base p-6 text-center">
          <p className="text-sm text-muted-foreground">No vulnerabilities found yet. Run a security test to populate this dashboard.</p>
        </div>
      )}
    </div>
  );
};

export default TestDashboard;
