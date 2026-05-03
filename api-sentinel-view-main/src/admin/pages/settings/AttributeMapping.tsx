import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Workflow } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import QueryError from '@/components/shared/QueryError';
import { useAccountSettings, useUpdateAccountSettings } from '@/hooks/use-admin';
import { useOnboarding } from '@/lib/onboarding-context';
import { toast } from '@/hooks/use-toast';

const AttributeMapping: React.FC = () => {
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const { data, isLoading, isError, refetch } = useAccountSettings();
  const updateSettings = useUpdateAccountSettings();

  const [authHeader, setAuthHeader] = useState('authorization');
  const [sessionKey, setSessionKey] = useState('x-session-id');
  const [userIdKey, setUserIdKey] = useState('x-user-id');
  const [userRoleKey, setUserRoleKey] = useState('x-user-role');
  const [tenantKey, setTenantKey] = useState('x-tenant-id');
  const [features, setFeatures] = useState({
    discovery: true,
    behavioralTesting: true,
    realtimeProtection: true,
    reporting: true,
  });

  useEffect(() => {
    const identity = data?.accountSettings.identity;
    const featureEnvelope = data?.accountSettings.featureEnvelope;
    if (!identity) {
      return;
    }
    setAuthHeader(identity.authHeader ?? 'authorization');
    setSessionKey(identity.sessionKey ?? 'x-session-id');
    setUserIdKey(identity.userIdKey ?? 'x-user-id');
    setUserRoleKey(identity.userRoleKey ?? 'x-user-role');
    setTenantKey(identity.tenantKey ?? 'x-tenant-id');
    setFeatures({
      discovery: featureEnvelope?.discovery ?? true,
      behavioralTesting: featureEnvelope?.behavioralTesting ?? true,
      realtimeProtection: featureEnvelope?.realtimeProtection ?? true,
      reporting: featureEnvelope?.reporting ?? true,
    });
  }, [data]);

  const toggleFeature = (key: keyof typeof features) => {
    setFeatures((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        identity: {
          authHeader,
          sessionKey,
          userIdKey,
          userRoleKey,
          tenantKey,
        },
        featureEnvelope: features,
      });

      onboarding.update({
        authHeader,
        sessionKey,
        userIdKey,
        userRoleKey,
        tenantKey,
        features,
      });

      toast({
        title: 'Identity mapping saved',
        description: 'Discovery, testing, and protection can now use the updated session and tenant attributes.',
      });
    } catch {
      toast({
        title: 'Save failed',
        description: 'The identity mapping could not be persisted.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/admin/settings')}
          className="w-9 h-9 rounded-xl border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary hover:border-brand/20 transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold text-text-primary">API Attribute Mapping</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Define the headers and attributes that identify sessions, users, roles, and tenants across your APIs.
          </p>
        </div>
      </div>

      {isError && <QueryError message="Failed to load identity mapping" onRetry={() => refetch()} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            <Workflow size={12} />
            Session and user attribution
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              ['Authorization header', authHeader, setAuthHeader, 'authorization'],
              ['Session key', sessionKey, setSessionKey, 'x-session-id'],
              ['User identifier', userIdKey, setUserIdKey, 'x-user-id'],
              ['User role attribute', userRoleKey, setUserRoleKey, 'x-user-role'],
              ['Tenant key', tenantKey, setTenantKey, 'x-tenant-id'],
            ].map(([label, value, setter, placeholder]) => (
              <div key={String(label)} className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</label>
                <input
                  value={String(value)}
                  onChange={(event) => (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value)}
                  placeholder={String(placeholder)}
                  className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                />
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Feature envelope</div>
            {[
              ['discovery', 'Passive discovery'],
              ['behavioralTesting', 'Behavioral testing'],
              ['realtimeProtection', 'Realtime protection'],
              ['reporting', 'Executive reporting'],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                <span className="text-sm font-medium text-text-primary">{label}</span>
                <input
                  type="checkbox"
                  checked={features[key as keyof typeof features]}
                  onChange={() => toggleFeature(key as keyof typeof features)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: 'var(--brand)' }}
                />
              </label>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={updateSettings.isPending || isLoading}
            className="mt-5 w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
          >
            {updateSettings.isPending ? 'Saving...' : 'Save attribute mapping'}
          </button>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard variant="accent" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
              <ShieldCheck size={12} />
              Why it matters
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
              <p>Public AppSentinels docs split session and user attribution into a distinct setup stage because protection quality improves dramatically once the platform understands who is doing what.</p>
              <p>These fields become especially important for tenant-aware traces, BOLA checks, role-based testing, and lower-noise anomaly detection.</p>
            </div>
          </GlassCard>

          {!onboarding.data.completed && (
            <GlassCard variant="default" className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Wizard status</div>
              <div className="mt-2 text-lg font-bold text-text-primary">{onboarding.progress}% complete</div>
              <p className="mt-2 text-[11px] leading-5 text-text-secondary">
                Saving attribute mapping here also updates the live onboarding wizard so the team can continue from a stronger baseline.
              </p>
              <button
                onClick={() => navigate('/admin/onboarding')}
                className="mt-4 rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
              >
                Return to onboarding
              </button>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttributeMapping;
