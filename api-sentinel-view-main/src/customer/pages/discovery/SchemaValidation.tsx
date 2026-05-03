import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import {
  FileCode2, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp,
  Filter
} from 'lucide-react';

interface SchemaViolation {
  id: string;
  endpoint: string;
  method: string;
  violation_type: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  last_seen: string;
}

const DEMO_VIOLATIONS: SchemaViolation[] = [
  { id: '1', endpoint: '/api/users', method: 'POST', violation_type: 'MISSING_REQUIRED_FIELD', field: 'email', expected: 'string (required)', actual: 'absent', severity: 'high', count: 23, last_seen: new Date(Date.now() - 300000).toISOString() },
  { id: '2', endpoint: '/api/orders', method: 'POST', violation_type: 'TYPE_MISMATCH', field: 'amount', expected: 'number', actual: 'string "19.99"', severity: 'medium', count: 7, last_seen: new Date(Date.now() - 600000).toISOString() },
  { id: '3', endpoint: '/api/products/:id', method: 'PUT', violation_type: 'EXTRA_FIELD', field: 'internal_cost', expected: 'absent (not in schema)', actual: 'number', severity: 'high', count: 3, last_seen: new Date(Date.now() - 1800000).toISOString() },
  { id: '4', endpoint: '/api/auth/login', method: 'POST', violation_type: 'ENUM_VIOLATION', field: 'role', expected: 'user|admin|guest', actual: '"superuser"', severity: 'high', count: 1, last_seen: new Date(Date.now() - 3600000).toISOString() },
  { id: '5', endpoint: '/api/payments', method: 'POST', violation_type: 'FORMAT_VIOLATION', field: 'card_number', expected: 'pattern: /^[0-9]{16}$/', actual: '4111-1111-1111-1111 (dashes)', severity: 'medium', count: 12, last_seen: new Date(Date.now() - 900000).toISOString() },
  { id: '6', endpoint: '/api/users/:id', method: 'PATCH', violation_type: 'UNEXPECTED_NULL', field: 'username', expected: 'string (not nullable)', actual: 'null', severity: 'low', count: 2, last_seen: new Date(Date.now() - 7200000).toISOString() },
];

const VIOLATION_TYPE_LABELS: Record<string, string> = {
  MISSING_REQUIRED_FIELD: 'Missing Required Field',
  TYPE_MISMATCH: 'Type Mismatch',
  EXTRA_FIELD: 'Extra Field (Mass Assignment)',
  ENUM_VIOLATION: 'Enum Violation',
  FORMAT_VIOLATION: 'Format Violation',
  UNEXPECTED_NULL: 'Unexpected Null',
};

function methodColor(m: string) {
  const colors: Record<string, string> = { GET: 'bg-green-100 text-green-700', POST: 'bg-blue-100 text-blue-700', PUT: 'bg-amber-100 text-amber-700', PATCH: 'bg-purple-100 text-purple-700', DELETE: 'bg-red-100 text-red-700' };
  return colors[m] || 'bg-gray-100 text-gray-600';
}

function sevBadge(s: string) {
  const m: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border border-red-200',
    medium: 'bg-amber-100 text-amber-700 border border-amber-200',
    low: 'bg-blue-100 text-blue-700 border border-blue-200',
  };
  return m[s] || 'bg-gray-100 text-gray-600';
}

function ViolationRow({ v }: { v: SchemaViolation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg-elevated border border-border-subtle rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle/40 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <XCircle className={`h-4 w-4 shrink-0 ${v.severity === 'high' ? 'text-red-500' : v.severity === 'medium' ? 'text-amber-500' : 'text-blue-400'}`} />
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${methodColor(v.method)}`}>{v.method}</span>
          <span className="text-sm font-mono text-text-primary">{v.endpoint}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sevBadge(v.severity)}`}>{v.severity}</span>
          <span className="text-xs text-text-muted">{VIOLATION_TYPE_LABELS[v.violation_type] || v.violation_type}</span>
          <span className="text-[10px] bg-bg-subtle border border-border-subtle px-1.5 py-0.5 rounded ml-auto">{v.count}× occurrences</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-text-muted shrink-0" /> : <ChevronDown className="h-4 w-4 text-text-muted shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border-subtle px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-bg-subtle/30">
          <div>
            <div className="text-text-muted mb-1">Field</div>
            <code className="font-mono text-text-primary">{v.field}</code>
          </div>
          <div>
            <div className="text-text-muted mb-1">Expected</div>
            <code className="font-mono text-green-600">{v.expected}</code>
          </div>
          <div>
            <div className="text-text-muted mb-1">Actual</div>
            <code className="font-mono text-red-500">{v.actual}</code>
          </div>
          <div className="sm:col-span-3 text-text-muted text-[10px]">
            Last seen {new Date(v.last_seen).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchemaValidation() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const { data } = useQuery({
    queryKey: ['schema-violations'],
    queryFn: () => get('/openapi/violations').catch(() => null),
    retry: false,
  });

  const violations: SchemaViolation[] = data?.violations?.length ? data.violations : DEMO_VIOLATIONS;
  const isDemo = !data?.violations?.length;

  const filtered = severityFilter === 'all' ? violations : violations.filter(v => v.severity === severityFilter);
  const highCount = violations.filter(v => v.severity === 'high').length;
  const medCount = violations.filter(v => v.severity === 'medium').length;
  const lowCount = violations.filter(v => v.severity === 'low').length;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-brand" />
            Schema Validation
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Requests that violate your OpenAPI schema — type mismatches, missing fields, mass assignment
          </p>
        </div>
        {isDemo && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data · Upload OpenAPI spec to enable real validation
          </span>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <div className="text-xl font-bold text-text-primary">{violations.length}</div>
            <div className="text-xs text-text-muted">Total Violations</div>
          </div>
        </div>
        <div className="bg-bg-elevated border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <div className="text-xl font-bold text-red-500">{highCount}</div>
            <div className="text-xs text-text-muted">High Severity</div>
          </div>
        </div>
        <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <div className="text-xl font-bold text-amber-500">{medCount}</div>
            <div className="text-xs text-text-muted">Medium</div>
          </div>
        </div>
        <div className="bg-bg-elevated border border-border-subtle rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <div className="text-xl font-bold text-blue-500">{lowCount}</div>
            <div className="text-xs text-text-muted">Low</div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-xs text-text-muted">Severity:</span>
        {['all', 'high', 'medium', 'low'].map(s => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
              severityFilter === s
                ? 'bg-brand text-white'
                : 'bg-bg-subtle border border-border-subtle text-text-secondary hover:bg-bg-elevated'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-text-muted">
            <CheckCircle2 className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No violations for selected filter</p>
          </div>
        ) : (
          filtered.map(v => <ViolationRow key={v.id} v={v} />)
        )}
      </div>
    </div>
  );
}
