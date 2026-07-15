import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Layers3,
  Network,
  ServerCog,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import GlassCard from '@/components/ui/GlassCard';
import { post } from '@/lib/api-client';
import { ONBOARDING_STEPS, useOnboarding, type OnboardingStepId } from '@/lib/onboarding-context';
import { useApiCollections, useEndpointsCount } from '@/hooks/use-discovery';
import { useAccountSettings, useModuleInfo, useTeamData, useUpdateAccountSettings } from '@/hooks/use-admin';
import { toast } from '@/hooks/use-toast';

const DEPLOYMENT_OPTIONS = [
  {
    id: 'saas',
    label: 'SaaS Control Plane',
    description: 'Fastest path for a hosted command center with lightweight traffic collectors.',
  },
  {
    id: 'hybrid',
    label: 'Hybrid Deployment',
    description: 'Keep telemetry collection in your network while operating from a shared control plane.',
  },
  {
    id: 'self-hosted',
    label: 'Self-Hosted Stack',
    description: 'Run controller, sensors, and protection policies entirely inside your environment.',
  },
] as const;

const RUNTIME_OPTIONS = [
  { id: 'kubernetes', label: 'Kubernetes', description: 'Helm-based controller and sidecar sensor rollout.' },
  { id: 'vm', label: 'VM / Bare Metal', description: 'Systemd or Docker Compose rollout for collector services.' },
  { id: 'gateway', label: 'Gateway Plugin', description: 'Use ingress or gateway integrations for traffic capture.' },
] as const;

const TRAFFIC_OPTIONS = [
  { id: 'nginx', label: 'NGINX or Kong', description: 'Mirror ingress traffic or attach a gateway plugin.' },
  { id: 'envoy', label: 'Envoy or Istio', description: 'Use sidecars or access logs for service-mesh capture.' },
  { id: 'aws', label: 'AWS Mirroring', description: 'Attach VPC traffic mirroring to production workloads.' },
  { id: 'manual', label: 'HAR / Postman Import', description: 'Seed discovery immediately while passive traffic is being wired.' },
] as const;

const STEP_ICONS: Record<OnboardingStepId, React.FC<{ size?: number }>> = {
  deployment: ServerCog,
  traffic: Network,
  application: Layers3,
  identity: Workflow,
  validation: ShieldCheck,
};

function stepNumber(stepId: OnboardingStepId) {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId) + 1;
}

const STEP_DESCRIPTIONS: Record<OnboardingStepId, string> = {
  deployment: 'Choose the deployment model and runtime target for this organization.',
  traffic: 'Select the primary source for API traffic and discovery data.',
  application: 'Register the application surface that should be monitored.',
  identity: 'Map the identity and tenant attributes used by your APIs.',
  validation: 'Confirm the required checks before finishing setup.',
};

type OnboardingSnapshot = ReturnType<typeof useOnboarding>['data'];

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboarding = useOnboarding();
  const { data, progress, nextStep } = onboarding;
  const collections = useApiCollections();
  const endpointCount = useEndpointsCount();
  const modules = useModuleInfo();
  const team = useTeamData();
  const accountSettings = useAccountSettings();
  const updateAccountSettings = useUpdateAccountSettings();
  const [creatingApp, setCreatingApp] = useState(false);
  const [hasPrefilledFromSettings, setHasPrefilledFromSettings] = useState(false);

  const applicationCount = collections.data?.apiCollections?.length ?? 0;
  const endpointsSeen = endpointCount.data?.endpointsCount ?? 0;
  const connectedModules = (modules.data?.moduleInfos ?? []).filter((module) => module.isConnected).length;
  const owners = team.data?.users ?? [];

  const persistSettings = useCallback(async (override: Partial<OnboardingSnapshot> = {}) => {
    const snapshot: OnboardingSnapshot = {
      ...data,
      ...override,
      features: override.features ?? data.features,
      validation: override.validation ?? data.validation,
      assignedUsers: override.assignedUsers ?? data.assignedUsers,
      completedSteps: override.completedSteps ?? data.completedSteps,
    };

    await updateAccountSettings.mutateAsync({
      deployment: {
        mode: snapshot.deploymentModel,
        runtimeProfile: snapshot.runtimeProfile,
        inlineProtection: snapshot.inlineProtection,
      },
      traffic: {
        source: snapshot.trafficSource,
      },
      applicationDefaults: {
        environment: snapshot.environment,
        businessUnit: snapshot.businessUnit,
        assignedUsers: snapshot.assignedUsers,
      },
      application: {
        name: snapshot.applicationName,
        domain: snapshot.applicationDomain,
        collectionId: snapshot.collectionId,
      },
      identity: {
        authHeader: snapshot.authHeader,
        sessionKey: snapshot.sessionKey,
        userIdKey: snapshot.userIdKey,
        userRoleKey: snapshot.userRoleKey,
        tenantKey: snapshot.tenantKey,
      },
      featureEnvelope: snapshot.features,
      onboarding: {
        completed: snapshot.completed,
        currentStep: snapshot.currentStep,
        completedSteps: snapshot.completedSteps,
        validation: snapshot.validation,
      },
    });
  }, [data, updateAccountSettings]);

  const persistValidationState = useCallback((nextValidation: OnboardingSnapshot['validation']) => {
    void persistSettings({ validation: nextValidation }).catch(() => {
      console.warn('Failed to persist validation state');
    });
  }, [persistSettings]);

  const handleValidationToggle = (key: keyof typeof data.validation) => {
    const nextValidation = { ...data.validation, [key]: !data.validation[key] };
    onboarding.toggleValidation(key);
    persistValidationState(nextValidation);
  };

  useEffect(() => {
    if (connectedModules > 0 && !data.validation.controllerHealthy) {
      const nextValidation = { ...data.validation, controllerHealthy: true };
      onboarding.update({ validation: nextValidation });
      persistValidationState(nextValidation);
    }
  }, [connectedModules, data.validation, onboarding, persistValidationState]);

  useEffect(() => {
    if (applicationCount > 0 && !data.collectionId) {
      const firstCollection = collections.data?.apiCollections?.[0];
      onboarding.registerApplication({
        name: data.applicationName || firstCollection?.displayName || 'Primary API',
        domain: data.applicationDomain || firstCollection?.hostName || '',
        collectionId: firstCollection?.id ? String(firstCollection.id) : null,
      });
    }
  }, [applicationCount, collections.data, data.applicationDomain, data.applicationName, data.collectionId, onboarding]);

  useEffect(() => {
    if (endpointsSeen > 0 && !data.validation.inventoryVisible) {
      const nextValidation = { ...data.validation, inventoryVisible: true };
      onboarding.update({ validation: nextValidation });
      persistValidationState(nextValidation);
    }
  }, [data.validation, endpointsSeen, onboarding, persistValidationState]);

  useEffect(() => {
    if (!onboarding.isHydrated || hasPrefilledFromSettings) {
      return;
    }

    const settings = accountSettings.data?.accountSettings;
    if (!settings) {
      return;
    }

    const alreadyCustomized = data.completed || data.completedSteps.length > 0 || !!data.applicationName || !!data.collectionId;
    if (alreadyCustomized) {
      setHasPrefilledFromSettings(true);
      return;
    }

    onboarding.update({
      deploymentModel: (settings.deployment?.mode as OnboardingSnapshot['deploymentModel']) ?? data.deploymentModel,
      runtimeProfile: (settings.deployment?.runtimeProfile as OnboardingSnapshot['runtimeProfile']) ?? data.runtimeProfile,
      inlineProtection: settings.deployment?.inlineProtection ?? data.inlineProtection,
      trafficSource: (settings.traffic?.source as OnboardingSnapshot['trafficSource']) ?? data.trafficSource,
      environment: (settings.applicationDefaults?.environment as OnboardingSnapshot['environment']) ?? data.environment,
      businessUnit: settings.applicationDefaults?.businessUnit ?? data.businessUnit,
      assignedUsers: settings.applicationDefaults?.assignedUsers ?? data.assignedUsers,
      authHeader: settings.identity?.authHeader ?? data.authHeader,
      sessionKey: settings.identity?.sessionKey ?? data.sessionKey,
      userIdKey: settings.identity?.userIdKey ?? data.userIdKey,
      userRoleKey: settings.identity?.userRoleKey ?? data.userRoleKey,
      tenantKey: settings.identity?.tenantKey ?? data.tenantKey,
      features: {
        discovery: settings.featureEnvelope?.discovery ?? data.features.discovery,
        behavioralTesting: settings.featureEnvelope?.behavioralTesting ?? data.features.behavioralTesting,
        realtimeProtection: settings.featureEnvelope?.realtimeProtection ?? data.features.realtimeProtection,
        reporting: settings.featureEnvelope?.reporting ?? data.features.reporting,
      },
      completed: settings.onboarding?.completed ?? data.completed,
      currentStep: (settings.onboarding?.currentStep as OnboardingStepId) ?? data.currentStep,
      completedSteps: (settings.onboarding?.completedSteps as OnboardingStepId[]) ?? data.completedSteps,
    });
    setHasPrefilledFromSettings(true);
  }, [
    accountSettings.data,
    data.applicationName,
    data.assignedUsers,
    data.authHeader,
    data.businessUnit,
    data.collectionId,
    data.completed,
    data.completedSteps,
    data.currentStep,
    data.deploymentModel,
    data.environment,
    data.features,
    data.inlineProtection,
    data.runtimeProfile,
    data.sessionKey,
    data.tenantKey,
    data.trafficSource,
    data.userIdKey,
    data.userRoleKey,
    onboarding,
    hasPrefilledFromSettings,
  ]);

  const activeStep = data.currentStep;
  const currentStepIcon = STEP_ICONS[activeStep];

  const completeAndAdvance = () => {
    const completedSteps = Array.from(new Set([...data.completedSteps, activeStep])) as OnboardingStepId[];
    onboarding.markStepComplete(activeStep);
    const currentIndex = stepNumber(activeStep) - 1;
    const upcoming = ONBOARDING_STEPS[currentIndex + 1];
    if (upcoming) {
      onboarding.setCurrentStep(upcoming.id);
      void persistSettings({
        currentStep: upcoming.id,
        completedSteps,
      }).catch(() => {
        toast({
          title: 'Settings sync failed',
          description: 'The step progress was saved locally but not persisted to the backend.',
          variant: 'destructive',
        });
      });
      return;
    }
    onboarding.finish();
    void persistSettings({
      currentStep: 'validation',
      completed: true,
      completedSteps: ONBOARDING_STEPS.map((step) => step.id),
    }).catch(() => {
      toast({
        title: 'Settings sync failed',
        description: 'Onboarding finished locally, but the backend settings were not updated.',
        variant: 'destructive',
      });
    });
    navigate('/app/organization');
  };

  const handleApplicationCreate = async () => {
    if (!data.applicationName.trim()) {
      toast({
        title: 'Application name required',
        description: 'Give the application a name before registering it.',
        variant: 'destructive',
      });
      return;
    }

    setCreatingApp(true);
    try {
      const response = await post<{ id?: string; name?: string }>('/collections/', {
        name: data.applicationName.trim(),
        host: data.applicationDomain.trim() || undefined,
        type: 'MIRRORING',
      });

      onboarding.registerApplication({
        name: data.applicationName.trim(),
        domain: data.applicationDomain.trim(),
        collectionId: response.id ? String(response.id) : null,
      });
      void persistSettings({
        applicationName: data.applicationName.trim(),
        applicationDomain: data.applicationDomain.trim(),
        collectionId: response.id ? String(response.id) : null,
        currentStep: 'identity',
        completedSteps: Array.from(new Set([...data.completedSteps, 'application'])) as OnboardingStepId[],
      }).catch(() => {
        toast({
          title: 'Settings sync failed',
          description: 'The application was created, but backend onboarding settings were not updated.',
          variant: 'destructive',
        });
      });
      queryClient.invalidateQueries({ queryKey: ['discovery', 'collections'] });
      toast({
        title: 'Application registered',
        description: 'The organization can now be mapped to passive discovery and protection policies.',
      });
      onboarding.setCurrentStep('identity');
    } catch {
      toast({
        title: 'Application registration failed',
        description: 'The backend did not accept the collection request. Check auth and API availability.',
        variant: 'destructive',
      });
    } finally {
      setCreatingApp(false);
    }
  };

  const validationCards = [
    {
      key: 'controllerHealthy',
      label: 'Controller and sensors connected',
      description: `${connectedModules} connected modules are reporting live health.`,
    },
    {
      key: 'trafficSeen',
      label: 'Passive traffic observed',
      description: data.trafficSource === 'manual'
        ? 'Seed discovery with imports while passive traffic is still being wired.'
        : 'Traffic source configuration is captured and ready for rollout.',
    },
    {
      key: 'inventoryVisible',
      label: 'API inventory visible',
      description: `${endpointsSeen} endpoints are currently visible in discovery.`,
    },
    {
      key: 'policiesEnabled',
      label: 'Protection baseline enabled',
      description: 'Recommended starter mode: discovery + alerting before inline blocking.',
    },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8 animate-fade-in">
      <GlassCard variant="elevated" className="p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Setup</div>
            <h1 className="mt-1 text-2xl font-bold text-text-primary md:text-3xl">Organization onboarding</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Configure the minimum required settings to start monitoring APIs.
            </p>
          </div>

          <div className="w-full md:w-72">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary">{progress}% complete</span>
              <span className="text-text-muted">
                {nextStep ? `Next: ${ONBOARDING_STEPS.find((step) => step.id === nextStep)?.label}` : 'Complete'}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-base">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <GlassCard variant="elevated" className="p-2 lg:sticky lg:top-4 lg:self-start">
          {ONBOARDING_STEPS.map((step) => {
            const Icon = STEP_ICONS[step.id];
            const isActive = step.id === activeStep;
            const isComplete = data.completedSteps.includes(step.id) || data.completed;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onboarding.setCurrentStep(step.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'border-brand/25 bg-brand/10'
                    : 'border-transparent hover:bg-bg-base'
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isComplete
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : isActive
                        ? 'bg-brand/15 text-brand'
                        : 'bg-bg-base text-text-muted'
                  }`}
                >
                  {isComplete ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary">{step.label}</div>
                  <div className="mt-0.5 text-xs text-text-muted">Step {stepNumber(step.id)} of {ONBOARDING_STEPS.length}</div>
                </div>
              </button>
            );
          })}
        </GlassCard>

        <GlassCard variant="elevated" className="p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
              {React.createElement(currentStepIcon, { size: 20 })}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                Step {stepNumber(activeStep)}
              </div>
              <h2 className="mt-1 text-xl font-bold text-text-primary">
                {ONBOARDING_STEPS.find((step) => step.id === activeStep)?.label}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{STEP_DESCRIPTIONS[activeStep]}</p>
            </div>
          </div>

            {activeStep === 'deployment' && (
              <div className="mt-6 space-y-5">
                <section>
                  <h3 className="text-sm font-semibold text-text-primary">Deployment model</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {DEPLOYMENT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onboarding.update({ deploymentModel: option.id })}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        data.deploymentModel === option.id
                          ? 'border-brand/30 bg-brand/10'
                          : 'border-border-subtle bg-bg-surface hover:border-brand/20'
                      }`}
                    >
                      <div className="text-sm font-bold text-text-primary">{option.label}</div>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">{option.description}</p>
                    </button>
                  ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-text-primary">Runtime target</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {RUNTIME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onboarding.update({ runtimeProfile: option.id })}
                        className={`rounded-lg border p-4 text-left transition-colors ${
                          data.runtimeProfile === option.id
                            ? 'border-brand/30 bg-brand/10'
                            : 'border-border-subtle bg-bg-surface hover:border-brand/20'
                        }`}
                      >
                        <div className="text-sm font-bold text-text-primary">{option.label}</div>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </section>

                <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data.inlineProtection}
                    onChange={(event) => onboarding.update({ inlineProtection: event.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Prepare inline protection</div>
                    <div className="mt-0.5 text-xs text-text-muted">Enable this when blocking will be part of the first rollout.</div>
                  </div>
                </label>
              </div>
            )}

            {activeStep === 'traffic' && (
              <div className="mt-6">
                <div className="grid gap-3 md:grid-cols-2">
                  {TRAFFIC_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onboarding.update({ trafficSource: option.id })}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        data.trafficSource === option.id
                          ? 'border-brand/30 bg-brand/10'
                          : 'border-border-subtle bg-bg-surface hover:border-brand/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                          <Network size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text-primary">{option.label}</div>
                          <p className="mt-1 text-xs leading-5 text-text-secondary">{option.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeStep === 'application' && (
              <div className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Application name</label>
                    <input
                      value={data.applicationName}
                      onChange={(event) => onboarding.update({ applicationName: event.target.value })}
                      placeholder="customer-api-prod"
                      className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Application domain</label>
                    <input
                      value={data.applicationDomain}
                      onChange={(event) => onboarding.update({ applicationDomain: event.target.value })}
                      placeholder="api.company.com"
                      className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Environment</label>
                    <select
                      value={data.environment}
                      onChange={(event) => onboarding.update({ environment: event.target.value as typeof data.environment })}
                      className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                    >
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Business unit</label>
                    <input
                      value={data.businessUnit}
                      onChange={(event) => onboarding.update({ businessUnit: event.target.value })}
                      placeholder="Core Platform"
                      className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Owners</div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(owners.length > 0 ? owners : [{ login: 'owner@company.com', role: 'ADMIN' }]).map((owner) => (
                      <label key={owner.login} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={data.assignedUsers.includes(owner.login)}
                          onChange={() => onboarding.toggleAssignedUser(owner.login)}
                          className="h-4 w-4 rounded"
                          style={{ accentColor: 'var(--brand)' }}
                        />
                        <div>
                          <div className="text-sm font-medium text-text-primary">{owner.login}</div>
                          <div className="text-xs text-text-muted">{owner.role}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplicationCreate}
                  disabled={creatingApp}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
                >
                  {creatingApp ? 'Registering...' : 'Register application'}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}

            {activeStep === 'identity' && (
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ['Authorization header', 'authHeader', 'authorization'],
                    ['Session key', 'sessionKey', 'x-session-id'],
                    ['User identifier', 'userIdKey', 'x-user-id'],
                    ['Role attribute', 'userRoleKey', 'x-user-role'],
                    ['Tenant key', 'tenantKey', 'x-tenant-id'],
                  ].map(([label, key, placeholder]) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</label>
                      <input
                        value={data[key as keyof typeof data] as string}
                        onChange={(event) => onboarding.update({ [key]: event.target.value } as Partial<typeof data>)}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                      />
                    </div>
                  ))}
                </div>

                <GlassCard variant="default" className="p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Enabled modules</div>
                  <div className="mt-3 space-y-2">
                    {[
                      ['discovery', 'Passive discovery'],
                      ['behavioralTesting', 'Behavioral testing'],
                      ['realtimeProtection', 'Realtime protection'],
                      ['reporting', 'Executive reporting'],
                    ].map(([feature, label]) => (
                      <label key={feature} className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-base px-3 py-2.5">
                        <span className="text-sm font-medium text-text-primary">{label}</span>
                        <input
                          type="checkbox"
                          checked={data.features[feature as keyof typeof data.features]}
                          onChange={() => onboarding.toggleFeature(feature as keyof typeof data.features)}
                          className="h-4 w-4 rounded"
                          style={{ accentColor: 'var(--brand)' }}
                        />
                      </label>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}

            {activeStep === 'validation' && (
              <div className="mt-6 space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-text-muted">Applications</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">{applicationCount}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-text-muted">Endpoints</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">{endpointsSeen}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-base px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-text-muted">Modules</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">{connectedModules}</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {validationCards.map((card) => (
                    <label key={card.key} className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-base px-4 py-4">
                      <input
                        type="checkbox"
                        checked={data.validation[card.key]}
                        onChange={() => handleValidationToggle(card.key)}
                        className="mt-1 h-4 w-4 rounded"
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{card.label}</div>
                        <p className="mt-1 text-xs leading-5 text-text-secondary">{card.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={() => onboarding.reset()}
                className="rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
              >
                Reset
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/app/organization')}
                  className="rounded-lg border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                >
                  Exit
                </button>
                <button
                  type="button"
                  onClick={completeAndAdvance}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  {activeStep === 'validation' ? 'Finish onboarding' : 'Save and continue'}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Onboarding;
