import React, { useState } from 'react';
import { RefreshCw, Download, FileText, ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { useComplianceReport, useGenerateExport } from '@/hooks/use-compliance';
import TableSkeleton from '@/components/shared/TableSkeleton';

const Reports: React.FC = () => {
  const [selectedFramework, setSelectedFramework] = useState('OWASP_API_2023');
  const [isExporting, setIsExporting] = useState(false);

  const { data: report, isLoading, isError, refetch } = useComplianceReport(selectedFramework);
  const exporter = useGenerateExport();

  const handlePdfExport = () => {
    const frameworkName = frameworks.find(f => f.id === selectedFramework)?.name ?? selectedFramework;
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const total = report?.total_open ?? 0;
    const sections = report?.sections ?? {};
    const posture = total === 0 ? 'Optimal' : total < 5 ? 'Good' : total < 10 ? 'At Risk' : 'Critical';
    const postureColor = total === 0 ? '#22C55E' : total < 5 ? '#EAB308' : '#EF4444';

    const rows = Object.entries(sections).flatMap(([section, vulns]: [string, any]) =>
      vulns.map((v: any) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:#e8edf3">${section}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:#e8edf3">${v.title ?? v.type ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;font-family:monospace;color:#94a3b8">${v.endpoint ?? v.url ?? '-'}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #1e2530;font-size:12px;color:${v.severity === 'CRITICAL' || v.severity === 'HIGH' ? '#ef4444' : v.severity === 'MEDIUM' ? '#eab308' : '#22c55e'}">${v.severity ?? '-'}</td>
        </tr>`).join('')
    );

    const html = `<!DOCTYPE html><html><head><title>Security Compliance Report</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#0d1117;padding:40px}
      .header{border-bottom:3px solid #f97316;padding-bottom:24px;margin-bottom:32px}
      .logo{font-size:24px;font-weight:900;color:#f97316;letter-spacing:-0.5px}
      .subtitle{font-size:13px;color:#6b7280;margin-top:4px}
      .exec-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:32px}
      .exec-title{font-size:16px;font-weight:700;color:#0d1117;margin-bottom:12px}
      .exec-text{font-size:13px;color:#374151;line-height:1.6}
      .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px}
      .kpi{border:1px solid #e5e7eb;border-radius:8px;padding:20px;text-align:center}
      .kpi-val{font-size:36px;font-weight:900;margin-bottom:4px}
      .kpi-label{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      thead tr{background:#f97316}
      thead th{padding:10px 12px;text-align:left;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
      .section-header{background:#0d1117;color:#fff;padding:10px 12px;font-weight:700;font-size:13px}
      .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between}
      @media print{body{padding:20px}.kpis{page-break-inside:avoid}}
    </style></head><body>
    <div class="header">
      <div class="logo">API SENTINEL</div>
      <div class="subtitle">Security Compliance Report &mdash; ${frameworkName}</div>
      <div style="margin-top:8px;font-size:12px;color:#6b7280">Generated: ${date} &nbsp;&bull;&nbsp; Classification: CONFIDENTIAL</div>
    </div>
    <div class="exec-box">
      <div class="exec-title">Executive Summary</div>
      <div class="exec-text">
        This report presents the current API security posture against the <strong>${frameworkName}</strong> framework.
        The platform has identified <strong>${total} open finding${total !== 1 ? 's' : ''}</strong> across <strong>${Object.keys(sections).length} control categories</strong>.
        Overall compliance posture is assessed as <strong style="color:${postureColor}">${posture}</strong>.
        ${total === 0 ? 'All monitored APIs are currently compliant with the selected framework.' : 'Immediate attention is recommended for CRITICAL and HIGH severity findings listed below.'}
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val" style="color:#ef4444">${total}</div><div class="kpi-label">Total Findings</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#f97316">${Object.keys(sections).length}</div><div class="kpi-label">Failed Controls</div></div>
      <div class="kpi"><div class="kpi-val" style="color:${postureColor}">${posture}</div><div class="kpi-label">Compliance Posture</div></div>
    </div>
    ${total > 0 ? `
    <table>
      <thead><tr><th>Category</th><th>Finding</th><th>Endpoint</th><th>Severity</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '<div style="text-align:center;padding:40px;color:#22c55e;font-size:16px;font-weight:700">&#x2713; No compliance violations found</div>'}
    <div class="footer">
      <span>API Sentinel &copy; ${new Date().getFullYear()} &mdash; Confidential Security Report</span>
      <span>Framework: ${frameworkName} &mdash; ${date}</span>
    </div>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 500);
    }
  };

  const handleExport = async (format: string) => {
    setIsExporting(true);
    try {
      const content = await exporter.mutateAsync({ framework: selectedFramework, format });
      // For HTML export, we can open it in a new window or trigger download
      if (format === 'html' && typeof content === 'string') {
        const win = window.open('', '_blank');
        win?.document.write(content);
        win?.document.close();
      }
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const frameworks = [
    { id: 'OWASP_API_2023', name: 'OWASP API Top 10 (2023)' },
    { id: 'GDPR', name: 'GDPR Compliance' },
    { id: 'HIPAA', name: 'HIPAA Security Rule' }
  ];

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10 px-6">

      {/* Top Header */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-brand/10 border border-brand/20 rounded-lg flex items-center justify-center text-brand">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Compliance Reporting</h1>
            <p className="text-xs text-muted-foreground">Mapping vulnerabilities to industry regulatory frameworks</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="p-2 text-muted-foreground hover:text-text-primary transition-colors rounded-lg hover:bg-bg-hover"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-subtle rounded-lg text-sm text-text-primary hover:bg-bg-hover transition-all">
              {frameworks.find(f => f.id === selectedFramework)?.name}
              <ChevronDown size={14} />
            </button>
            <div className="absolute top-full right-0 mt-1 w-64 bg-bg-surface border border-border-subtle rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
              {frameworks.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFramework(f.id)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-brand/10 hover:text-brand transition-colors ${selectedFramework === f.id ? 'bg-brand/10 text-brand' : 'text-text-primary'}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => handlePdfExport()}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-bg-surface border border-border-subtle text-text-primary rounded-lg text-sm hover:bg-bg-hover transition-all mr-2 disabled:opacity-50"
          >
            <Download size={16} />
            Export PDF
          </button>
          <button
            onClick={() => handleExport('html')}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white font-bold rounded-lg text-sm hover:bg-brand/90 transition-all disabled:opacity-50"
          >
            <Download size={16} />
            {isExporting ? 'Exporting...' : 'Export HTML'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-bg-surface border border-border-subtle p-5 rounded-xl">
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total Findings</span>
          <div className="text-3xl font-display font-bold text-text-primary mt-2">{report?.total_open || 0}</div>
        </div>
        <div className="bg-bg-surface border border-border-subtle p-5 rounded-xl">
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Failed Controls</span>
          <div className="text-3xl font-display font-bold text-[#EF4444] mt-2">{report ? Object.keys(report.sections).length : 0}</div>
        </div>
        <div className="bg-bg-surface border border-border-subtle p-5 rounded-xl">
          <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Compliance Posture</span>
          <div className="text-3xl font-display font-bold text-[#22C55E] mt-2">
            {report?.total_open === 0 ? 'Optimal' : report?.total_open < 5 ? 'Good' : 'At Risk'}
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="bg-bg-base border border-border-subtle rounded-xl overflow-hidden mt-6 min-h-[500px]">
        {isLoading ? (
          <div className="p-8"><TableSkeleton columns={3} rows={8} /></div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
            <AlertTriangle size={48} className="mb-4 text-[#EF4444]" />
            <p>Failed to generate compliance summary.</p>
            <button onClick={() => refetch()} className="mt-4 text-brand underline">Try again</button>
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {Object.entries(report?.sections || {}).map(([section, vulns]: [string, any]) => (
              <div key={section} className="space-y-4">
                <div className="flex items-center gap-3 border-b border-border-subtle pb-2">
                  <div className="h-6 w-6 rounded bg-[#EF4444]/10 flex items-center justify-center text-[#EF4444]">
                    <AlertTriangle size={14} />
                  </div>
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">{section}</h3>
                  <span className="ml-auto text-[10px] text-muted-foreground bg-bg-surface px-2 py-0.5 rounded border border-border-subtle">
                    {vulns.length} Findings
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {vulns.map((v: any) => (
                    <div key={v.id} className="group bg-bg-surface hover:bg-bg-hover border border-border-subtle p-4 rounded-lg flex items-center justify-between transition-all">
                      <div className="flex items-center gap-4">
                        <div className={`h-2 w-2 rounded-full ${v.severity === 'HIGH' || v.severity === 'CRITICAL' ? 'bg-[#EF4444]' : v.severity === 'MEDIUM' ? 'bg-[#F97316]' : 'bg-[#EAB308]'}`} />
                        <div>
                          <div className="text-sm font-medium text-text-primary group-hover:text-brand transition-colors">{v.title}</div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-1">{v.endpoint}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${v.severity === 'HIGH' || v.severity === 'CRITICAL' ? 'border-[#EF4444]/20 text-[#EF4444] bg-[#EF4444]/5' : 'border-border-subtle text-muted-foreground'}`}>
                          {v.severity}
                        </span>
                        <button className="p-1.5 rounded bg-bg-surface text-muted-foreground hover:text-text-primary transition-colors">
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {Object.keys(report?.sections || {}).length === 0 && (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                <CheckCircle size={48} className="mb-4 text-[#22C55E]/30" />
                <p className="text-sm">No compliance violations found for this framework.</p>
                <p className="text-[11px] mt-1">Your API security posture is currently satisfying all required controls.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
