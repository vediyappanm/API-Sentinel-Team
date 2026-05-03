import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { Eye, EyeOff, AlertTriangle, ShieldAlert, Filter, Lock } from 'lucide-react';

interface SensitiveDataFinding {
  id: string;
  endpoint: string;
  method: string;
  location: 'request' | 'response';
  data_type: string;
  field_path: string;
  sample_masked: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  occurrences: number;
  last_seen: string;
  encrypted: boolean;
  regulations: string[];
}

const DEMO_FINDINGS: SensitiveDataFinding[] = [
  { id: '1', endpoint: '/api/users', method: 'GET', location: 'response', data_type: 'SSN', field_path: 'data[].ssn', sample_masked: '***-**-6789', severity: 'critical', occurrences: 148, last_seen: new Date(Date.now() - 300000).toISOString(), encrypted: false, regulations: ['PCI-DSS', 'HIPAA', 'GDPR'] },
  { id: '2', endpoint: '/api/payments', method: 'POST', location: 'request', data_type: 'CREDIT_CARD', field_path: 'body.card_number', sample_masked: '4111-****-****-1111', severity: 'critical', occurrences: 34, last_seen: new Date(Date.now() - 600000).toISOString(), encrypted: false, regulations: ['PCI-DSS'] },
  { id: '3', endpoint: '/api/auth/login', method: 'POST', location: 'response', data_type: 'PASSWORD_HASH', field_path: 'user.password_hash', sample_masked: '$2b$12$****', severity: 'high', occurrences: 7, last_seen: new Date(Date.now() - 1800000).toISOString(), encrypted: true, regulations: ['SOC2'] },
  { id: '4', endpoint: '/api/logs', method: 'GET', location: 'response', data_type: 'EMAIL', field_path: 'entries[].user_email', sample_masked: 'a***@e*****.com', severity: 'medium', occurrences: 892, last_seen: new Date(Date.now() - 900000).toISOString(), encrypted: false, regulations: ['GDPR'] },
  { id: '5', endpoint: '/api/profile', method: 'GET', location: 'response', data_type: 'PHONE_NUMBER', field_path: 'phone', sample_masked: '+1-***-***-7890', severity: 'medium', occurrences: 254, last_seen: new Date(Date.now() - 3600000).toISOString(), encrypted: false, regulations: ['GDPR', 'CCPA'] },
  { id: '6', endpoint: '/api/debug/trace', method: 'GET', location: 'response', data_type: 'JWT_TOKEN', field_path: 'trace.auth_header', sample_masked: 'eyJhbGc...****', severity: 'high', occurrences: 2, last_seen: new Date(Date.now() - 7200000).toISOString(), encrypted: false, regulations: ['SOC2'] },
];

const TYPE_ICONS: Record<string, string> = {
  SSN: '🪪', CREDIT_CARD: '💳', EMAIL: '📧', PHONE_NUMBER: '📱',
  PASSWORD_HASH: '🔑', JWT_TOKEN: '🎫', API_KEY: '🗝', IP_ADDRESS: '🌐',
};

function sevColor(s: string) {
  return { critical: 'text-red-600', high: 'text-red-500', medium: 'text-amber-500', low: 'text-blue-400' }[s] || 'text-gray-500';
}

function sevBadge(s: string) {
  return { critical: 'bg-red-100 text-red-700 border border-red-200', high: 'bg-orange-100 text-orange-700 border border-orange-200', medium: 'bg-amber-100 text-amber-700 border border-amber-200', low: 'bg-blue-100 text-blue-700 border border-blue-200' }[s] || 'bg-gray-100 text-gray-600';
}

function methodColor(m: string) {
  return { GET: 'bg-green-100 text-green-700', POST: 'bg-blue-100 text-blue-700', PUT: 'bg-amber-100 text-amber-700', PATCH: 'bg-purple-100 text-purple-700', DELETE: 'bg-red-100 text-red-700' }[m] || 'bg-gray-100 text-gray-600';
}

export default function SensitiveData() {
  const [filter, setFilter] = useState<string>('all');
  const [locFilter, setLocFilter] = useState<string>('all');
  const [showSamples, setShowSamples] = useState(false);

  const { data } = useQuery({
    queryKey: ['sensitive-data'],
    queryFn: () => get('/pii/findings').catch(() => null),
    retry: false,
  });

  const findings: SensitiveDataFinding[] = data?.findings?.length ? data.findings : DEMO_FINDINGS;
  const isDemo = !data?.findings?.length;

  const filtered = findings.filter(f =>
    (filter === 'all' || f.severity === filter) &&
    (locFilter === 'all' || f.location === locFilter)
  );

  const critCount = findings.filter(f => f.severity === 'critical').length;
  const unencrypted = findings.filter(f => !f.encrypted).length;
  const regulations = [...new Set(findings.flatMap(f => f.regulations))];
  const totalOccurrences = findings.reduce((s, f) => s + f.occurrences, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Eye className="h-5 w-5 text-brand" />
            Sensitive Data Exposure
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            PII, credentials, and regulated data detected in API traffic
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSamples(s => !s)}
            className="flex items-center gap-1.5 text-xs border border-border-subtle px-2.5 py-1.5 rounded-lg hover:bg-bg-subtle transition-colors"
          >
            {showSamples ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSamples ? 'Hide samples' : 'Show masked samples'}
          </button>
          {isDemo && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              Demo data
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Findings', value: findings.length, sub: `${totalOccurrences.toLocaleString()} occurrences`, icon: ShieldAlert, color: 'text-brand' },
          { label: 'Critical', value: critCount, sub: 'Requires immediate action', icon: AlertTriangle, color: 'text-red-500' },
          { label: 'Unencrypted', value: unencrypted, sub: 'Exposed in plaintext', icon: Lock, color: unencrypted > 0 ? 'text-red-500' : 'text-green-500' },
          { label: 'Regulations Impacted', value: regulations.length, sub: regulations.join(', '), icon: Eye, color: 'text-amber-500' },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-bg-elevated border border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`h-4 w-4 ${color} shrink-0`} />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
            <div className="text-2xl font-bold text-text-primary">{value}</div>
            <div className="text-[10px] text-text-muted truncate mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {critCount > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-700">Unencrypted PII in API responses</div>
            <div className="text-xs text-red-600 mt-0.5">
              {critCount} critical finding{critCount > 1 ? 's' : ''} — SSNs, credit cards, or equivalent data exposed without encryption.
              This likely violates PCI-DSS, HIPAA, and GDPR requirements.
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-xs text-text-muted">Severity:</span>
          {['all', 'critical', 'high', 'medium', 'low'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${filter === s ? 'bg-brand text-white' : 'bg-bg-subtle border border-border-subtle text-text-secondary hover:bg-bg-elevated'}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted">Location:</span>
          {['all', 'request', 'response'].map(l => (
            <button key={l} onClick={() => setLocFilter(l)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${locFilter === l ? 'bg-brand text-white' : 'bg-bg-subtle border border-border-subtle text-text-secondary hover:bg-bg-elevated'}`}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Findings list */}
      <div className="space-y-2">
        {filtered.map(f => (
          <div key={f.id} className={`bg-bg-elevated border rounded-xl p-4 ${f.severity === 'critical' ? 'border-red-200' : 'border-border-subtle'}`}>
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[f.data_type] || '🔍'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary">{f.data_type.replace(/_/g, ' ')}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevBadge(f.severity)}`}>{f.severity}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${methodColor(f.method)}`}>{f.method}</span>
                  <span className="text-xs font-mono text-text-secondary">{f.endpoint}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ml-auto ${f.location === 'response' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                    in {f.location}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                  <div className="flex items-center gap-1 text-text-muted">
                    <span>Field:</span>
                    <code className="font-mono text-text-secondary">{f.field_path}</code>
                  </div>
                  {showSamples && (
                    <div className="flex items-center gap-1 text-text-muted">
                      <span>Sample:</span>
                      <code className="font-mono text-amber-600">{f.sample_masked}</code>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-text-muted">
                    {f.encrypted
                      ? <><Lock className="h-3 w-3 text-green-500" /><span className="text-green-600">Encrypted</span></>
                      : <><Lock className="h-3 w-3 text-red-500" /><span className="text-red-500">Plaintext</span></>
                    }
                  </div>
                  <span className="text-text-muted">{f.occurrences.toLocaleString()} occurrences</span>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {f.regulations.map(r => (
                    <span key={r} className="text-[10px] bg-brand/10 text-brand border border-brand/20 px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                  <span className="text-[10px] text-text-muted ml-auto">
                    Last seen {new Date(f.last_seen).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
