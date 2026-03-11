import React, { useState } from 'react';
import { useAuditLogs } from '@/hooks/use-admin';
import { ArrowLeft, ClipboardList, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AuditLogs: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const { data, isLoading } = useAuditLogs(page, pageSize);

  const logs = data?.auditLogs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/settings')} className="p-2 rounded-lg hover:bg-bg-hover text-muted-foreground hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Audit Logs</h1>
          <p className="text-xs text-muted-foreground">Review all administrative operations and changes</p>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} className="text-brand" />
            <span className="text-sm font-semibold text-text-primary">Audit Trail ({total})</span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1 rounded hover:bg-bg-hover disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-bg-hover disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">No audit logs found</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle text-muted-foreground">
                <th className="text-left px-5 py-2.5 font-medium">Timestamp</th>
                <th className="text-left px-5 py-2.5 font-medium">User</th>
                <th className="text-left px-5 py-2.5 font-medium">Action</th>
                <th className="text-left px-5 py-2.5 font-medium">Resource</th>
                <th className="text-left px-5 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-border-subtle hover:bg-bg-hover">
                  <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-text-primary">{log.user}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded bg-brand/10 text-brand font-medium">{log.action}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{log.resource || '-'}</td>
                  <td className="px-5 py-3 text-muted-foreground max-w-[200px] truncate">{log.details || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
