import React, { useMemo } from 'react';
import { ChevronRight, Folder, FileText, RefreshCw } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useApiCollections } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

const ApiTree: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useApiCollections();

  const collections = data?.apiCollections ?? [];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-primary">API Tree</h2>
        <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery', 'collections'] })} className="text-muted-foreground hover:text-brand transition-colors p-1 rounded-md outline-none cursor-pointer">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load API tree" onRetry={() => refetch()} />}

      {isLoading ? <TableSkeleton columns={2} rows={4} /> : (
        <>
          {collections.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No API collections found. Connect a traffic source to populate the tree.</p>
          )}
          {collections.map((col) => (
            <div key={col.id} className="space-y-1 mb-3">
              <div className="flex items-center gap-2 text-sm text-text-primary font-medium py-1">
                <Folder className="h-4 w-4 text-brand" />
                {col.hostName || col.displayName || `Collection ${col.id}`}
                <span className="text-[10px] text-muted-foreground ml-2">{col.urlsCount ?? 0} endpoints</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default ApiTree;
