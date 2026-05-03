import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-admin';
import { toast } from '@/hooks/use-toast';

const SCOPE_OPTIONS = [
  'discovery:read',
  'testing:run',
  'protection:manage',
  'reports:read',
  'integrations:write',
] as const;

const ApiKeysManagement: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [name, setName] = useState('Controller bootstrap');
  const [expiresInDays, setExpiresInDays] = useState<number>(90);
  const [scopes, setScopes] = useState<string[]>(['discovery:read', 'protection:manage']);
  const [rawToken, setRawToken] = useState<string | null>(null);

  const apiKeys = data?.apiKeys ?? [];
  const activeCount = useMemo(() => apiKeys.filter((key) => key.status === 'ACTIVE').length, [apiKeys]);

  const toggleScope = (scope: string) => {
    setScopes((current) => (
      current.includes(scope)
        ? current.filter((entry) => entry !== scope)
        : [...current, scope]
    ));
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: 'Store it in your secret manager before leaving this page.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard access was denied by the browser.',
        variant: 'destructive',
      });
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name required',
        description: 'Give the key a descriptive name so the team can rotate it safely later.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await createKey.mutateAsync({
        name: name.trim(),
        scopes,
        expiresInDays,
      });
      setRawToken(response.token);
      toast({
        title: 'API key created',
        description: 'This value is only shown once. Copy it now.',
      });
    } catch {
      toast({
        title: 'API key creation failed',
        description: 'The backend did not accept the request.',
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = async (apiKeyId: string) => {
    try {
      await revokeKey.mutateAsync(apiKeyId);
      toast({
        title: 'API key revoked',
        description: 'The key is no longer available for future integrations.',
      });
    } catch {
      toast({
        title: 'Revoke failed',
        description: 'The key could not be revoked.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/settings')}
            className="w-9 h-9 rounded-xl border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary hover:border-brand/20 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-sm font-bold text-text-primary">API Keys Management</h2>
            <p className="text-[11px] text-text-muted mt-0.5">
              Create organization-level keys for controllers, sensors, CI jobs, and integration automation.
            </p>
          </div>
        </div>
        <div className="rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-[11px] font-semibold text-text-secondary">
          {activeCount} active keys
        </div>
      </div>

      {isError && <QueryError message="Failed to load API keys" onRetry={() => refetch()} />}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <KeyRound size={12} />
            Create org key
          </div>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Key name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Controller bootstrap"
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Expiry</label>
              <select
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(Number(event.target.value))}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Scopes</div>
              <div className="space-y-2">
                {SCOPE_OPTIONS.map((scope) => (
                  <label key={scope} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                    <span className="text-sm font-medium text-text-primary">{scope}</span>
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: 'var(--brand)' }}
                    />
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={createKey.isPending}
              className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
            >
              {createKey.isPending ? 'Creating key...' : 'Create API key'}
            </button>
          </div>
        </GlassCard>

        <div className="space-y-4">
          {rawToken && (
            <GlassCard variant="accent" className="p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                <ShieldCheck size={12} />
                Copy this now
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                This is the only time the raw key will be shown. Save it into your controller, sensor, or CI secret store before leaving this page.
              </p>
              <div className="mt-4 rounded-2xl border border-brand/10 bg-brand/5 p-4">
                <div className="font-mono text-[12px] break-all text-text-primary">{rawToken}</div>
                <button
                  onClick={() => copy(rawToken, 'API key')}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary hover:border-brand/20 transition-colors"
                >
                  <Copy size={12} />
                  Copy key
                </button>
              </div>
            </GlassCard>
          )}

          <GlassCard variant="elevated" className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Existing keys</div>
                <div className="mt-1 text-sm font-bold text-text-primary">Rotate aggressively and keep scopes narrow.</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {isLoading && <TableSkeleton columns={4} rows={3} />}

              {!isLoading && apiKeys.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-bg-base px-5 py-10 text-center">
                  <KeyRound size={26} className="mx-auto text-text-muted" />
                  <p className="mt-3 text-sm font-semibold text-text-primary">No organization keys yet</p>
                  <p className="mt-1 text-[11px] leading-5 text-text-muted">
                    Create the first key for controller bootstrap or CI-driven discovery imports.
                  </p>
                </div>
              )}

              {apiKeys.map((key) => (
                <div key={key.id} className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-text-primary">{key.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${key.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-700'}`}>
                          {key.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-text-muted">Reference: {key.reference}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {key.scopes.map((scope) => (
                          <span key={scope} className="rounded-full border border-border-subtle px-2 py-1 text-[11px] text-text-secondary">
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-[11px] text-text-muted">
                        {key.expiresAt ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}` : 'No expiry'}
                      </div>
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                        Revoke
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default ApiKeysManagement;
