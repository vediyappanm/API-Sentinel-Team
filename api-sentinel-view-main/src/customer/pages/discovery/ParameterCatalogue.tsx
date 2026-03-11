import React, { useState } from 'react';
import { RefreshCw, Filter } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { MethodBadge } from '@/components/shared/Badges';
import { useSensitiveParameters } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

const ParameterCatalogue: React.FC = () => {
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useSensitiveParameters(page, pageSize);

  const params = data?.data?.endpoints ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 animate-fade-in w-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Sensitive Parameters</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery', 'sensitiveParams'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{total > 0 ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)}` : '0'} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
            </div>
          </div>
          <button className="flex items-center gap-1.5 rounded bg-bg-surface border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover cursor-pointer outline-none transition-colors">
            <Filter size={14} /> Filter
          </button>
        </div>
      </div>

      {isError && <QueryError message="Failed to load sensitive parameters" onRetry={() => refetch()} />}

      <div className="bg-bg-base border border-border-subtle rounded-lg flex flex-col min-h-[500px]">
        {isLoading ? <TableSkeleton columns={5} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Parameter</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Data Type</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Location</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Collection ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {params.map((p, i) => (
                  <tr key={`${p.url}-${p.param}-${i}`} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3 text-[13px] font-mono text-brand font-semibold">{p.param}</td>
                    <td className="px-4 py-3 text-xs text-[#EAB308]">{p.subType || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={p.method || 'GET'} />
                        <span className="text-[12px] font-mono text-text-primary truncate">{p.url}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.isHeader ? 'Header' : 'Body'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{p.apiCollectionId}</td>
                  </tr>
                ))}
                {params.length === 0 && !isLoading && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">No sensitive parameters detected yet. Parameters will appear here once API traffic is analyzed.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParameterCatalogue;
