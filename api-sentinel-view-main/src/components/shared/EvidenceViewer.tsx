import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, ShieldCheck, ShieldAlert } from 'lucide-react';
import { MethodBadge } from '@/components/shared/Badges';

interface HttpMessage {
  method?: string;
  url?: string;
  status_code?: number;
  headers?: Record<string, unknown>;
  body?: unknown;
}

interface EvidenceCompleteness {
  complete?: boolean;
  present?: string[];
  missing?: string[];
}

interface ParsedEvidence {
  finding_status?: string;
  engine?: string;
  sent_request?: HttpMessage;
  received_response?: HttpMessage;
  matched_rule?: Record<string, unknown>;
  similarity?: Record<string, unknown>;
  reproduction?: { curl?: string };
  remediation?: string;
  evidence_completeness?: EvidenceCompleteness;
  [key: string]: unknown;
}

function bodyToText(body: unknown): string {
  if (body === undefined || body === null || body === '') return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function headersToLines(headers: Record<string, unknown> | undefined): string[] {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers).map(([key, value]) => `${key}: ${String(value)}`);
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'finding_status',
  'sent_request',
  'received_response',
  'matched_rule',
  'similarity',
  'reproduction',
  'remediation',
  'evidence_completeness',
  'evidence_hash',
  'hash_algorithm',
  'content_minimization',
  'evidence_reproducibility',
  'endpoint',
  'confirmation',
  'results',
  'context',
  'retest_support',
  'observation',
  'safety_policies',
  'scope_validation',
  'security_category',
  'business_logic_scenario',
  'llm_judge_validation',
  'judge_validation',
  'skip_reason',
]);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard access denied — silently no-op, nothing to recover from
        }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[10px] font-semibold text-text-muted hover:text-brand hover:border-brand/30 transition-colors"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function HttpMessageBlock({ title, message }: { title: string; message?: HttpMessage }) {
  if (!message) return null;
  const headerLines = headersToLines(message.headers);
  const bodyText = bodyToText(message.body);
  return (
    <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </div>
        {message.status_code !== undefined && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              message.status_code >= 500
                ? 'bg-red-500/10 text-red-500'
                : message.status_code >= 400
                  ? 'bg-amber-500/10 text-amber-700'
                  : 'bg-emerald-500/10 text-emerald-600'
            }`}
          >
            {message.status_code}
          </span>
        )}
      </div>
      {(message.method || message.url) && (
        <div className="flex items-center gap-2 text-[11px] font-mono mb-2">
          {message.method && <MethodBadge method={message.method} />}
          {message.url && <span className="text-text-primary break-all">{message.url}</span>}
        </div>
      )}
      {headerLines.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {headerLines.map((line, i) => (
            <div key={i} className="text-[10px] font-mono text-text-muted truncate">{line}</div>
          ))}
        </div>
      )}
      {bodyText && (
        <pre className="max-h-32 overflow-auto rounded-lg bg-black/[0.03] px-2 py-2 text-[10px] font-mono text-text-primary whitespace-pre-wrap">
          {bodyText}
        </pre>
      )}
    </div>
  );
}

const EvidenceViewer: React.FC<{ evidence: string }> = ({ evidence }) => {
  const [showRaw, setShowRaw] = useState(false);

  const parsed = useMemo<ParsedEvidence | null>(() => {
    try {
      const value = JSON.parse(evidence);
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as ParsedEvidence) : null;
    } catch {
      return null;
    }
  }, [evidence]);

  if (!parsed) {
    // Not JSON (or an unparseable shape) — fall back to the raw text rather
    // than hide it, so nothing that used to be visible disappears.
    return (
      <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-border-subtle bg-black/[0.03] px-3 py-3 text-[11px] text-text-primary font-mono whitespace-pre-wrap">
        {evidence}
      </pre>
    );
  }

  const completeness = parsed.evidence_completeness;
  const extraEntries = Object.entries(parsed).filter(
    ([key, value]) => !KNOWN_TOP_LEVEL_KEYS.has(key) && value !== null && value !== undefined && value !== '',
  );

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {parsed.finding_status && (
          <span className="rounded-full bg-bg-elevated border border-border-subtle px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-text-secondary">
            {parsed.finding_status}
          </span>
        )}
        {completeness && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${
              completeness.complete
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-amber-500/10 text-amber-700'
            }`}
            title={
              completeness.missing?.length
                ? `Missing: ${completeness.missing.join(', ')}`
                : undefined
            }
          >
            {completeness.complete ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
            {completeness.complete ? 'Evidence complete' : `Missing ${completeness.missing?.length ?? 0} field(s)`}
          </span>
        )}
      </div>

      {(parsed.sent_request || parsed.received_response) && (
        <div className="grid gap-2 md:grid-cols-2">
          <HttpMessageBlock title="Sent request" message={parsed.sent_request} />
          <HttpMessageBlock title="Received response" message={parsed.received_response} />
        </div>
      )}

      {parsed.reproduction?.curl && (
        <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Reproduction</span>
            <CopyButton text={parsed.reproduction.curl} />
          </div>
          <pre className="overflow-auto rounded-lg bg-black/[0.03] px-2 py-2 text-[10px] font-mono text-text-primary whitespace-pre-wrap">
            {parsed.reproduction.curl}
          </pre>
        </div>
      )}

      {parsed.remediation && (
        <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">Remediation</div>
          <p className="text-[11px] text-text-secondary">{parsed.remediation}</p>
        </div>
      )}

      {extraEntries.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1.5">Details</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {extraEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-2 text-[11px] min-w-0">
                <span className="text-text-muted shrink-0">{key}:</span>
                <span className="text-text-primary font-mono truncate">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setShowRaw((v) => !v)}
        className="inline-flex items-center gap-1 text-[10px] font-semibold text-text-muted hover:text-brand transition-colors"
      >
        {showRaw ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {showRaw ? 'Hide raw evidence JSON' : 'Show raw evidence JSON'}
      </button>
      {showRaw && (
        <pre className="max-h-40 overflow-auto rounded-xl border border-border-subtle bg-black/[0.03] px-3 py-3 text-[10px] text-text-primary font-mono whitespace-pre-wrap">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default EvidenceViewer;
