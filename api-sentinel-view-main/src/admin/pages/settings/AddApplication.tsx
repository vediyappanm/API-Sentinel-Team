import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  Globe,
  Layers3,
  Network,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import GlassCard from '@/components/ui/GlassCard';
import { post } from '@/lib/api-client';
import { useOnboarding } from '@/lib/onboarding-context';
import { useTeamData } from '@/hooks/use-admin';
import { toast } from '@/hooks/use-toast';

const TRAFFIC_OPTIONS = [
  { id: 'nginx', label: 'NGINX / Kong', description: 'Mirror ingress traffic or use a plugin at the edge.' },
  { id: 'envoy', label: 'Envoy / Istio', description: 'Capture API calls from sidecars or service-mesh telemetry.' },
  { id: 'aws', label: 'AWS Mirroring', description: 'Attach traffic mirroring to a controlled production path.' },
  { id: 'manual', label: 'HAR / Postman Import', description: 'Seed the catalogue while passive traffic is being wired.' },
] as const;

const AddApplication: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboarding = useOnboarding();
  const team = useTeamData();
  const [creating, setCreating] = useState(false);

  const owners = team.data?.users ?? [];
  const telemetrySnippet = [
    `export APPSENTINEL_CONTROLLER_URL=https://collector.company.internal`,
    `export APPSENTINEL_SENSOR_KEY=<sensor-key>`,
    `export APPSENTINEL_TRAFFIC_SOURCE=${onboarding.data.trafficSource}`,
  ].join('\n');

  const createApplication = async () => {
    if (!onboarding.data.applicationName.trim()) {
      toast({
        title: 'Application name required',
        description: 'Provide a production-facing application name before creating the collection.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const response = await post<{ id?: string }>('/collections/', {
        name: onboarding.data.applicationName.trim(),
        host: onboarding.data.applicationDomain.trim() || undefined,
        type: 'MIRRORING',
      });

      onboarding.registerApplication({
        name: onboarding.data.applicationName.trim(),
        domain: onboarding.data.applicationDomain.trim(),
        collectionId: response.id ? String(response.id) : null,
      });
      onboarding.markStepComplete('application');
      queryClient.invalidateQueries({ queryKey: ['discovery', 'collections'] });
      toast({
        title: 'Application created',
        description: 'The collection is ready for discovery, testing, and protection policies.',
      });
      navigate('/admin/onboarding');
    } catch {
      toast({
        title: 'Application creation failed',
        description: 'The backend rejected the collection request. Check auth and API availability.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(telemetrySnippet);
      toast({
        title: 'Bootstrap snippet copied',
        description: 'Use it in your sensor or gateway rollout documentation.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard access was denied by the browser.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl mx-auto pb-10">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/admin/settings')} className="w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-text-muted hover:text-text-primary hover:border-brand/20 transition-all">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Register Application</h2>
          <p className="text-[11px] text-text-muted">Map a production surface to domains, owners, and traffic sources.</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard variant="elevated" className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Application name</label>
              <input
                value={onboarding.data.applicationName}
                onChange={(event) => onboarding.update({ applicationName: event.target.value })}
                placeholder="customer-api-prod"
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Primary domain</label>
              <input
                value={onboarding.data.applicationDomain}
                onChange={(event) => onboarding.update({ applicationDomain: event.target.value })}
                placeholder="api.company.com"
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Environment</label>
              <select
                value={onboarding.data.environment}
                onChange={(event) => onboarding.update({ environment: event.target.value as typeof onboarding.data.environment })}
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Business unit</label>
              <input
                value={onboarding.data.businessUnit}
                onChange={(event) => onboarding.update({ businessUnit: event.target.value })}
                placeholder="Core Platform"
                className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <Users size={12} />
              Assigned owners
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(owners.length > 0 ? owners : [{ login: 'owner@company.com', role: 'ADMIN' }]).map((owner) => (
                <label key={owner.login} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={onboarding.data.assignedUsers.includes(owner.login)}
                    onChange={() => onboarding.toggleAssignedUser(owner.login)}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <div>
                    <div className="text-sm font-medium text-text-primary">{owner.login}</div>
                    <div className="text-[11px] text-text-muted">{owner.role}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              <Network size={12} />
              Traffic source
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {TRAFFIC_OPTIONS.map((option) => (
                <GlassCard
                  key={option.id}
                  variant={onboarding.data.trafficSource === option.id ? 'accent' : 'default'}
                  className="p-4"
                  hoverLift
                  onClick={() => onboarding.update({ trafficSource: option.id })}
                >
                  <div className="text-sm font-bold text-text-primary">{option.label}</div>
                  <p className="mt-1 text-[11px] leading-5 text-text-secondary">{option.description}</p>
                </GlassCard>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={createApplication}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create application'}
              <ArrowRight size={15} />
            </button>
            <button
              onClick={() => navigate('/admin/onboarding')}
              className="rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
            >
              Return to onboarding
            </button>
          </div>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard variant="accent" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
              <Layers3 size={12} />
              Mapping guidance
            </div>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-text-secondary">
              <li>Register production domains first to keep discovery clean and ownership explicit.</li>
              <li>Use assigned owners for escalation, audit context, and protection rollout reviews.</li>
              <li>Mirror the same application name in reports, discovery, and protection policies.</li>
            </ul>
          </GlassCard>

          <GlassCard variant="default" className="p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Bootstrap snippet</div>
              <button onClick={copy} className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary">
                <Copy size={12} />
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[#0f172a] p-4 text-[11px] leading-6 text-slate-200"><code>{telemetrySnippet}</code></pre>
          </GlassCard>

          <GlassCard variant="default" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              <Globe size={12} />
              Current registration
            </div>
            <div className="mt-3 text-sm font-semibold text-text-primary">
              {onboarding.data.collectionId ? `Collection ${onboarding.data.collectionId}` : 'Not yet created'}
            </div>
            <div className="mt-1 text-[11px] text-text-secondary">
              {onboarding.data.applicationName || 'No application name set'}
            </div>
            {onboarding.data.collectionId && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                <CheckCircle2 size={12} />
                Application mapped
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default AddApplication;
