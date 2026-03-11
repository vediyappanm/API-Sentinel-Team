import React from 'react';
import { RefreshCw } from 'lucide-react';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useModuleInfo } from '@/hooks/use-admin';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const ControllerHealth: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useModuleInfo();

  const modules = data?.moduleInfos ?? [];
  // Filter for controllers (dashboard module)
  const controllers = modules.filter(m =>
    (m.moduleName || '').toLowerCase().includes('dashboard') ||
    (m.moduleName || '').toLowerCase().includes('controller') ||
    !m.moduleName
  );

  return (
    <div className="space-y-4 animate-fade-in w-full">
      {isError && <QueryError message="Failed to load controller health data" onRetry={() => refetch()} />}

      <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-2.5 border-b border-border-subtle flex items-center justify-between bg-bg-base">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'modules'] })} className="text-muted-foreground hover:text-brand transition-colors p-1 rounded-md outline-none cursor-pointer">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>1 – {controllers.length} of {controllers.length}</span>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={10} rows={5} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-base border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[20%]">Host Name</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[12%]">Module Name</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[12%]">Version</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[10%]">IP Address</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[8%]">Status</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[12%] text-center">Last Heartbeat↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[10%] text-center">Policy Version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {controllers.map(row => {
                  const isUp = row.isConnected || row.state === 'RUNNING';
                  return (
                    <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-4 text-[12px] text-text-primary font-mono break-all leading-relaxed">{row.hostName || row.id}</td>
                      <td className="px-4 py-4 text-[12px] text-text-primary font-medium">{row.moduleName}</td>
                      <td className="px-4 py-4 text-[12px] text-muted-foreground font-mono">{row.currentVersion || '-'}</td>
                      <td className="px-4 py-4 text-[12px] text-text-primary font-mono">{row.ipAddress || '-'}</td>
                      <td className="px-4 py-4 text-[13px] font-bold" style={{ color: isUp ? '#22C55E' : '#EF4444' }}>{isUp ? 'Up' : 'Down'}</td>
                      <td className="px-4 py-4 text-[11px] text-muted-foreground font-mono text-center">{formatTs(row.lastHeartbeat)}</td>
                      <td className="px-4 py-4 text-[12px] text-muted-foreground font-mono text-center">{row.policyVersion || '-'}</td>
                    </tr>
                  );
                })}
                {controllers.length === 0 && !isLoading && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    No sensor modules registered. Deploy a traffic sensor to begin monitoring.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ControllerHealth;
