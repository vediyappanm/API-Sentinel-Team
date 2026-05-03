import React from 'react';
import { Building2, ChevronRight, Users } from 'lucide-react';

import GlassCard from '@/components/ui/GlassCard';
import { useAuth } from '@/lib/auth-context';
import { useAccountSettings, useTeamData } from '@/hooks/use-admin';

const TenantDirectory: React.FC = () => {
  const { user } = useAuth();
  const team = useTeamData();
  const settings = useAccountSettings();

  const accountEntries = Object.entries(user?.accounts ?? {});
  const planTier = settings.data?.accountSettings.license?.planTier ?? 'FREE';
  const completedSteps = settings.data?.accountSettings.onboarding?.completedSteps?.length ?? 0;

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Internal Platform</div>
        <h1 className="mt-2 text-2xl font-extrabold text-text-primary">Tenant Directory</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
          This is the internal control-plane view. Right now the backend only exposes the active tenant context, so this page surfaces the current organization cleanly while keeping the future platform-admin boundary separate.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {accountEntries.length === 0 && (
          <GlassCard variant="default" className="p-6">
            <div className="text-sm font-bold text-text-primary">No tenant metadata available</div>
            <p className="mt-2 text-[11px] leading-5 text-text-secondary">
              When platform-admin APIs are added, this directory should list every tenant with status, plan, health, and support metadata.
            </p>
          </GlassCard>
        )}

        {accountEntries.map(([accountKey, account]) => (
          <GlassCard key={accountKey} variant="elevated" className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Building2 size={18} />
                </div>
                <div>
                  <div className="text-sm font-bold text-text-primary">{String((account as { name?: string }).name ?? 'Tenant')}</div>
                  <div className="text-[11px] text-text-muted">Account ID {String((account as { accountId?: number }).accountId ?? accountKey)}</div>
                </div>
              </div>
              <span className="rounded-full border border-border-subtle px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                {planTier}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Onboarding steps</div>
                <div className="mt-1 text-lg font-bold text-text-primary">{completedSteps}</div>
              </div>
              <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Known users</div>
                <div className="mt-1 text-lg font-bold text-text-primary">{team.data?.users?.length ?? 0}</div>
              </div>
            </div>

            <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand">
              Internal support surface
              <ChevronRight size={13} />
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard variant="default" className="p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          <Users size={12} />
          Next backend step
        </div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Add true platform-admin endpoints for tenant listing, impersonation, billing flags, plan changes, and support operations. The frontend separation is now ready for that backend expansion.
        </p>
      </GlassCard>
    </div>
  );
};

export default TenantDirectory;
