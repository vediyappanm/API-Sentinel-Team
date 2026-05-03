import React from 'react';
import { Activity, RadioTower, ServerCog } from 'lucide-react';

import GlassCard from '@/components/ui/GlassCard';
import QueryError from '@/components/shared/QueryError';
import { useModuleInfo } from '@/hooks/use-admin';

const InfrastructureStatus: React.FC = () => {
  const modules = useModuleInfo();
  const moduleInfos = modules.data?.moduleInfos ?? [];
  const connected = moduleInfos.filter((module) => module.isConnected).length;
  const disconnected = moduleInfos.length - connected;

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Internal Platform</div>
        <h1 className="mt-2 text-2xl font-extrabold text-text-primary">Infrastructure Status</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
          Internal infrastructure belongs in a separate workspace from tenant admin pages. This screen surfaces controller and sensor posture without mixing it into customer navigation.
        </p>
      </div>

      {modules.isError && (
        <QueryError message="Failed to load infrastructure status" onRetry={() => modules.refetch()} />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Runtime modules', value: moduleInfos.length, icon: ServerCog },
          { label: 'Connected', value: connected, icon: Activity },
          { label: 'Disconnected', value: Math.max(disconnected, 0), icon: RadioTower },
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

      <div className="space-y-3">
        {moduleInfos.map((module) => (
          <GlassCard key={module.id} variant="default" className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-bold text-text-primary">{module.moduleName}</div>
                <div className="mt-1 text-[11px] text-text-muted">{module.hostName} • {module.ipAddress}</div>
              </div>
              <div className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${module.isConnected ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-700'}`}>
                {module.isConnected ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};

export default InfrastructureStatus;
