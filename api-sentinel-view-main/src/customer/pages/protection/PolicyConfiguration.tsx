import React from 'react';
import { RefreshCw } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useThreatConfig } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

const PolicyConfiguration: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useThreatConfig();

  const config = data ?? {};
  const entries = Object.entries(config).filter(([k]) => !k.startsWith('_'));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-text-primary">Security Policies</h2>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'threatConfig'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load policy configuration" onRetry={() => refetch()} />}

      <div className="rounded-lg border border-border-subtle bg-bg-base p-6 space-y-4">
        {isLoading ? <TableSkeleton columns={2} rows={5} /> : (
          <>
            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No threat policies configured. Policies will appear here once the protection module is active.</p>
            )}
            <div className="space-y-2">
              {entries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-surface px-4 py-3">
                  <div className="text-sm text-text-primary">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</div>
                  <span className="text-xs font-mono text-muted-foreground">{typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : String(value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PolicyConfiguration;
