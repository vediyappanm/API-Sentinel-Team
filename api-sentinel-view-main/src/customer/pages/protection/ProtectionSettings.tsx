import React from 'react';
import { RefreshCw } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useThreatConfig, useUpdateThreatConfig } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

const ProtectionSettings: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useThreatConfig();
  const update = useUpdateThreatConfig();

  const config = data ?? {};
  const booleanEntries = Object.entries(config).filter(([, v]) => typeof v === 'boolean');

  const handleToggle = (key: string, current: boolean) => {
    update.mutate({ ...config, [key]: !current });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-text-primary">Protection Settings</h2>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'threatConfig'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load protection settings" onRetry={() => refetch()} />}

      <div className="rounded-lg border border-border-subtle bg-bg-base p-6 space-y-4">
        {isLoading ? <TableSkeleton columns={2} rows={4} /> : (
          <>
            {booleanEntries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No configurable settings found. Settings will appear here once the protection module is active.</p>
            )}
            <div className="space-y-3">
              {booleanEntries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-surface px-4 py-3">
                  <span className="text-sm text-text-primary">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                  <button
                    onClick={() => handleToggle(key, value as boolean)}
                    className={`h-5 w-9 rounded-full relative cursor-pointer transition-colors ${value ? 'bg-[#F97316]' : 'bg-[#484F58]'}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg-base transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProtectionSettings;
