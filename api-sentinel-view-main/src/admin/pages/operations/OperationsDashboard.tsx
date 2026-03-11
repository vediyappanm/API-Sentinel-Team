import React, { useState } from 'react';
import { TabNav } from '@/components/layout/TabNav';
import { RefreshCw, Filter } from 'lucide-react';
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

const OperationsDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState('system');
    const qc = useQueryClient();
    const { data, isLoading, isError, refetch } = useModuleInfo();

    const modules = data?.moduleInfos ?? [];

    const tabs = [
        { key: 'system', label: 'System' },
        { key: 'config', label: 'Config' },
        { key: 'secops', label: 'Sec-Ops' },
        { key: 'training', label: 'Global Training' },
    ];

    return (
        <div className="flex flex-col h-full animate-fade-in w-full pb-10">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold text-text-primary">Operations Dashboard
                    <button
                        onClick={() => qc.invalidateQueries({ queryKey: ['admin', 'modules'] })}
                        className="p-1 hover:text-brand transition-colors">
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </h1>
            </div>

            {isError && <QueryError message="Failed to load operations data" onRetry={() => refetch()} />}

            <div className="border-b border-border-subtle -mx-6 mb-4">
                <div className="flex items-center justify-between pr-6">
                    <TabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>1 – {modules.length} of {modules.length}</span>
                        </div>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-surface text-xs font-semibold text-muted-foreground hover:text-text-primary transition-all outline-none">
                            Filter <Filter size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="border border-border-subtle bg-bg-surface rounded-lg overflow-hidden flex-1 overflow-x-auto">
                {isLoading ? <TableSkeleton columns={8} rows={4} /> : (
                    <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
                        <thead className="bg-bg-surface border-b border-border-subtle">
                            <tr>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[14%]">Host Name</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[14%]">Module Name</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[10%]">Version</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[12%]">IP Address</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[8%]">Status</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[8%]">State</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[14%]">Last Heartbeat</th>
                                <th className="px-4 py-3 text-[11px] font-medium tracking-wider text-muted-foreground w-[10%]">Policy Version</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {modules.map((row) => {
                                const isUp = row.isConnected || row.state === 'RUNNING';
                                return (
                                    <tr key={row.id} className="hover:bg-bg-hover transition-colors align-top">
                                        <td className="px-4 py-4 text-[12px] text-brand font-mono font-semibold">{row.hostName || row.id}</td>
                                        <td className="px-4 py-4 text-[11px] text-[#EAB308]">{row.moduleName}</td>
                                        <td className="px-4 py-4 text-[11px] text-muted-foreground font-mono">{row.currentVersion || '-'}</td>
                                        <td className="px-4 py-4 text-[12px] text-text-primary font-mono">{row.ipAddress || '-'}</td>
                                        <td className="px-4 py-4 font-bold text-[13px]" style={{ color: isUp ? '#22C55E' : '#EF4444' }}>{isUp ? 'Up' : 'Down'}</td>
                                        <td className="px-4 py-4 text-[11px] text-muted-foreground">{row.state || '-'}</td>
                                        <td className="px-4 py-4 text-[11px] text-muted-foreground font-mono">{formatTs(row.lastHeartbeat)}</td>
                                        <td className="px-4 py-4 text-[11px] text-muted-foreground font-mono">{row.policyVersion || '-'}</td>
                                    </tr>
                                );
                            })}
                            {modules.length === 0 && !isLoading && (
                                <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-muted-foreground">No operational modules registered yet. Deploy monitoring agents to populate this view.</td></tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default OperationsDashboard;
