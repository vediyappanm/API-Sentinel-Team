import React from 'react';
import { Building2, Cpu, Layers3, ShieldCheck } from 'lucide-react';

import GlassCard from '@/components/ui/GlassCard';
import QueryError from '@/components/shared/QueryError';
import { useAccountSettings, useModuleInfo } from '@/hooks/use-admin';
import { useApiCollections, useEndpointsCount } from '@/hooks/use-discovery';

const PlatformOverview: React.FC = () => {
  const accountSettings = useAccountSettings();
  const modules = useModuleInfo();
  const collections = useApiCollections();
  const endpoints = useEndpointsCount();

  const connectedModules = (modules.data?.moduleInfos ?? []).filter((module) => module.isConnected).length;
  const applications = collections.data?.apiCollections?.length ?? 0;
  const endpointCount = endpoints.data?.endpointsCount ?? 0;
  const planTier = accountSettings.data?.accountSettings.license?.planTier ?? 'FREE';

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Internal Platform</div>
        <h1 className="mt-2 text-2xl font-extrabold text-text-primary">Platform Admin Overview</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
          This workspace is reserved for internal operators. In this repo it is intentionally separated from the customer and org-admin experiences, even though the backend still exposes only tenant-scoped data.
        </p>
      </div>

      {accountSettings.isError && (
        <QueryError message="Failed to load platform overview" onRetry={() => accountSettings.refetch()} />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Current tenant plan', value: planTier, icon: ShieldCheck },
          { label: 'Connected modules', value: connectedModules, icon: Cpu },
          { label: 'Applications', value: applications, icon: Building2 },
          { label: 'Endpoints', value: endpointCount, icon: Layers3 },
        ].map((card) => (
          <GlassCard key={card.label} variant="elevated" className="p-5">
            <div className="flex items-center justify-between">
              <card.icon size={18} className="text-brand" />
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{card.label}</div>
            </div>
            <div className="mt-4 text-2xl font-extrabold text-text-primary">{card.value}</div>
          </GlassCard>
        ))}
      </div>

      <GlassCard variant="accent" className="p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Architecture Note</div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">
          Production-grade separation means internal platform controls should be isolated from tenant admin controls. This frontend now does that at the workspace and route level, while the next backend step is adding true platform-admin APIs and non-tenant-scoped data access.
        </p>
      </GlassCard>
    </div>
  );
};

export default PlatformOverview;
