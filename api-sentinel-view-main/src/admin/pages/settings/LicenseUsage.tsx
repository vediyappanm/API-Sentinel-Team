import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, FileText, Layers3, Network, RadioTower } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import QueryError from '@/components/shared/QueryError';
import { useAccountSettings, useModuleInfo, useUpdateAccountSettings } from '@/hooks/use-admin';
import { useApiCollections, useEndpointsCount } from '@/hooks/use-discovery';
import { useOnboarding } from '@/lib/onboarding-context';
import { toast } from '@/hooks/use-toast';

const LicenseUsage: React.FC = () => {
  const navigate = useNavigate();
  const onboarding = useOnboarding();
  const { data, isLoading, isError, refetch } = useAccountSettings();
  const updateSettings = useUpdateAccountSettings();
  const collections = useApiCollections();
  const endpoints = useEndpointsCount();
  const modules = useModuleInfo();

  const license = data?.accountSettings.license;
  const [planTier, setPlanTier] = useState('FREE');
  const [applicationsPurchased, setApplicationsPurchased] = useState(2);
  const [endpointAllowance, setEndpointAllowance] = useState(500);
  const [sensorAllowance, setSensorAllowance] = useState(1);
  const [expiresOn, setExpiresOn] = useState('');

  useEffect(() => {
    if (!license) {
      return;
    }
    setPlanTier(license.planTier ?? 'FREE');
    setApplicationsPurchased(license.applicationsPurchased ?? 2);
    setEndpointAllowance(license.endpointAllowance ?? 500);
    setSensorAllowance(license.sensorAllowance ?? 1);
    setExpiresOn(license.expiresOn ? String(license.expiresOn).slice(0, 10) : '');
  }, [license]);

  const applicationUsage = license?.applicationsUsed ?? collections.data?.apiCollections?.length ?? 0;
  const endpointUsage = license?.endpointUsage ?? endpoints.data?.endpointsCount ?? 0;
  const sensorUsage = license?.sensorUsage ?? (modules.data?.moduleInfos ?? []).filter((module) => module.moduleName.includes('Sensor')).length;

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        license: {
          planTier,
          applicationsPurchased,
          endpointAllowance,
          sensorAllowance,
          expiresOn: expiresOn || null,
        },
      });
      toast({
        title: 'License envelope updated',
        description: 'The organization limits now match the current rollout plan.',
      });
    } catch {
      toast({
        title: 'Save failed',
        description: 'The backend did not persist the license settings.',
        variant: 'destructive',
      });
    }
  };

  const usageCards = [
    {
      label: 'Applications',
      value: applicationUsage,
      cap: applicationsPurchased,
      icon: Layers3,
      color: 'text-brand',
      bar: 'from-brand to-blue-500',
    },
    {
      label: 'Endpoints',
      value: endpointUsage,
      cap: endpointAllowance,
      icon: Network,
      color: 'text-blue-500',
      bar: 'from-blue-500 to-cyan-500',
    },
    {
      label: 'Sensors',
      value: sensorUsage,
      cap: sensorAllowance,
      icon: RadioTower,
      color: 'text-emerald-600',
      bar: 'from-emerald-500 to-lime-500',
    },
  ];

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
            <h2 className="text-sm font-bold text-text-primary">License Usage</h2>
            <p className="text-[11px] text-text-muted mt-0.5">
              Track license envelope, rollout scope, and go-live capacity before adding more production applications.
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/admin/onboarding')}
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
        >
          Continue onboarding
          <ChevronRight size={14} />
        </button>
      </div>

      {isError && <QueryError message="Failed to load license usage" onRetry={() => refetch()} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <GlassCard variant="elevated" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <FileText size={12} />
              Current envelope
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {usageCards.map((card) => {
                const percentage = card.cap > 0 ? Math.min(100, Math.round((card.value / card.cap) * 100)) : 0;
                return (
                  <div key={card.label} className="rounded-2xl border border-border-subtle bg-bg-base p-4">
                    <div className="flex items-center justify-between">
                      <card.icon size={18} className={card.color} />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{percentage}% used</span>
                    </div>
                    <div className="mt-3 text-sm font-bold text-text-primary">{card.label}</div>
                    <div className="mt-1 text-2xl font-extrabold text-text-primary">
                      {card.value}
                      <span className="ml-1 text-sm font-semibold text-text-muted">/ {card.cap}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[0.06]">
                      <div className={`h-full rounded-full bg-gradient-to-r ${card.bar}`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard variant="accent" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Rollout guidance</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
              <p>Public AppSentinels onboarding keeps deployment and licensing close together so teams do not overrun the initial rollout before the controller and sensors are validated.</p>
              <p>If you are near the application or sensor cap, finish inventory validation on the current estate before onboarding additional domains.</p>
            </div>
          </GlassCard>
        </div>

        <GlassCard variant="elevated" className="p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Manage envelope</div>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Plan tier</label>
              <select
                value={planTier}
                onChange={(event) => setPlanTier(event.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              >
                <option value="FREE">Free</option>
                <option value="GROWTH">Growth</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Application limit</label>
              <input
                type="number"
                min={1}
                value={applicationsPurchased}
                onChange={(event) => setApplicationsPurchased(Number(event.target.value))}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Endpoint allowance</label>
              <input
                type="number"
                min={1}
                value={endpointAllowance}
                onChange={(event) => setEndpointAllowance(Number(event.target.value))}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Sensor allowance</label>
              <input
                type="number"
                min={1}
                value={sensorAllowance}
                onChange={(event) => setSensorAllowance(Number(event.target.value))}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Renewal date</label>
              <input
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={updateSettings.isPending || isLoading}
              className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
            >
              {updateSettings.isPending ? 'Saving...' : 'Save license envelope'}
            </button>

            {!onboarding.data.completed && (
              <div className="rounded-2xl border border-brand/10 bg-brand/5 p-4">
                <div className="text-sm font-bold text-text-primary">Onboarding completion: {onboarding.progress}%</div>
                <p className="mt-1 text-[11px] leading-5 text-text-secondary">
                  Keep the license envelope aligned with the current rollout while you finish controller health, discovery visibility, and protection staging.
                </p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default LicenseUsage;
