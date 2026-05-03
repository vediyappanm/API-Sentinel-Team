import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  Globe,
  KeyRound,
  Layers3,
  Network,
  Rocket,
  ServerCog,
  ShieldCheck,
  Sparkles,
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

function generatedCommands(state: ReturnType<typeof useOnboarding>['data']) {
  const controllerHost = state.deploymentModel === 'self-hosted'
    ? 'https://controller.internal'
    : 'https://control.appsentinel.local';
  const installPrefix = state.runtimeProfile === 'kubernetes'
    ? 'helm upgrade --install api-sentinel-controller appsentinel/controller'
    : 'docker compose up -d controller collector';
  const trafficTarget = state.trafficSource === 'manual'
    ? 'Upload a Postman collection or HAR file to bootstrap discovery.'
    : `export APPSENTINEL_TRAFFIC_SOURCE=${state.trafficSource}`;
  const protectionMode = state.inlineProtection ? 'inline' : 'out_of_band';

  return {
    install: `${installPrefix} \\\n  --set deployment.mode=${state.deploymentModel} \\\n  --set runtime.profile=${state.runtimeProfile} \\\n  --set controller.url=${controllerHost}`,
    telemetry: `export APPSENTINEL_CONTROLLER_URL=${controllerHost}\nexport APPSENTINEL_SENSOR_KEY=<sensor-key>\nexport APPSENTINEL_PROTECTION_MODE=${protectionMode}\n${trafficTarget}`,
  };
}

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

  const commands = generatedCommands(data);
  const applicationCount = collections.data?.apiCollections?.length ?? 0;
  const endpointsSeen = endpointCount.data?.endpointsCount ?? 0;
  const connectedModules = (modules.data?.moduleInfos ?? []).filter((module) => module.isConnected).length;
  const owners = team.data?.users ?? [];
  const planTier = accountSettings.data?.accountSettings.license?.planTier ?? 'FREE';

  const persistSettings = async (override: Partial<OnboardingSnapshot> = {}) => {
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
  };

  const persistValidationState = (nextValidation: typeof data.validation) => {
    void persistSettings({ validation: nextValidation }).catch(() => {
      console.warn('Failed to persist validation state');
    });
  };

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
  }, [accountSettings.data, data.applicationName, data.collectionId, data.completed, data.completedSteps, data.deploymentModel, data.features, data.inlineProtection, data.runtimeProfile, data.trafficSource, onboarding, hasPrefilledFromSettings]);

  const activeStep = data.currentStep;
  const currentStepIcon = STEP_ICONS[activeStep];

    const copy = async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: `${label} copied`,
          description: 'Paste it into your deployment runbook or CI secrets manager.',
        });
      } catch {
        toast({
          title: 'Copy failed',
          description: 'Clipboard access was denied by the browser.',
          variant: 'destructive',
        });
      }
    };

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
    <div className="space-y-5 pb-10 animate-fade-in">
      <div
        className="rounded-2xl border border-border-default p-6 md:p-8 overflow-hidden relative"
        style={{
          background:
            'radial-gradient(circle at top left, rgba(99,44,175,0.16), transparent 32%), radial-gradient(circle at bottom right, rgba(59,130,246,0.14), transparent 34%), linear-gradient(135deg, #ffffff, #f6f4fb)',
        }}
      >
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
              <Rocket size={12} />
              AppSentinels-inspired onboarding
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-text-primary md:text-4xl">
              Stand up the organization like a production API security program.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              This flow is modeled on the public AppSentinels setup pattern: deploy the control plane, connect traffic,
              map applications to domains and owners, enrich identity signals, then verify discovery and protection before go-live.
            </p>
          </div>

          <GlassCard variant="elevated" className="min-w-[280px] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Setup Progress</div>
                <div className="mt-1 text-2xl font-extrabold text-text-primary">{progress}%</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold text-text-primary">{nextStep ? `Next: ${ONBOARDING_STEPS.find((step) => step.id === nextStep)?.label}` : 'Ready to operate'}</div>
                <div className="text-[11px] text-text-muted">{data.completed ? 'All onboarding stages are complete.' : 'Persisted locally so the team can resume.'}</div>
              </div>
            </div>
            <div className="mt-4 h-2 rounded-full bg-black/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-brand to-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-4">
          <GlassCard variant="elevated" className="p-3">
            {ONBOARDING_STEPS.map((step) => {
              const Icon = STEP_ICONS[step.id];
              const isActive = step.id === activeStep;
              const isComplete = data.completedSteps.includes(step.id) || data.completed;

              return (
                <button
                  key={step.id}
                  onClick={() => onboarding.setCurrentStep(step.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all ${isActive ? 'bg-brand/10 ring-1 ring-brand/20' : 'hover:bg-black/[0.03]'}`}
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isComplete ? 'bg-emerald-500/10 text-emerald-600' : isActive ? 'bg-brand/15 text-brand' : 'bg-bg-base text-text-muted'}`}>
                    {isComplete ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary">{step.label}</span>
                      <span className="rounded-full border border-border-subtle px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                        0{stepNumber(step.id)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-text-secondary">{step.kicker}</p>
                  </div>
                </button>
              );
            })}
          </GlassCard>

          <GlassCard variant="default" className="p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">License envelope</div>
            <div className="mt-2 inline-flex rounded-full border border-border-subtle px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              {planTier} plan
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] text-text-muted">Applications</div>
                <div className="text-lg font-bold text-text-primary">{Math.max(applicationCount, data.applicationName ? 1 : 0)}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted">Endpoints</div>
                <div className="text-lg font-bold text-text-primary">{endpointsSeen}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted">Owners</div>
                <div className="text-lg font-bold text-text-primary">{Math.max(data.assignedUsers.length, owners.length ? 1 : 0)}</div>
              </div>
              <div>
                <div className="text-[11px] text-text-muted">Modules</div>
                <div className="text-lg font-bold text-text-primary">{connectedModules}</div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-text-muted">
              AppSentinels emphasizes license and deployment planning during onboarding, so this panel keeps the initial rollout bounded.
            </p>
            <button
              onClick={() => navigate('/admin/settings/license')}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
            >
              Open license usage
              <ChevronRight size={12} />
            </button>
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard variant="elevated" className="p-6 md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  {React.createElement(currentStepIcon, { size: 13 })}
                  Step {stepNumber(activeStep)}
                </div>
                <h2 className="mt-2 text-2xl font-bold text-text-primary">
                  {ONBOARDING_STEPS.find((step) => step.id === activeStep)?.label}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                  {activeStep === 'deployment' && 'Choose how the organization will operate the controller, sensors, and enforcement path. This mirrors the control-plane-first onboarding pattern used by AppSentinels.'}
                  {activeStep === 'traffic' && 'Decide where traffic will be captured, how the organization will authenticate sensors, and which bootstrap path gets discovery started fastest.'}
                  {activeStep === 'application' && 'Map each production surface to an application, domain, environment, and owner list so inventory, policies, and reports all resolve to the right team.'}
                  {activeStep === 'identity' && 'Teach the platform how your APIs express identity and tenancy. This is where behavioral testing and business-logic analysis become much more useful.'}
                  {activeStep === 'validation' && 'Confirm that the control plane is healthy, traffic is visible, discovery is populated, and protection is staged safely before broader rollout.'}
                </p>
              </div>
              <div className="hidden rounded-2xl border border-border-subtle bg-bg-base px-4 py-3 lg:block">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Inspired by</div>
                <div className="mt-1 text-sm font-semibold text-text-primary">AppSentinels docs</div>
                <div className="text-[11px] text-text-muted">Deployment, Applications, API Keys, Discovery</div>
              </div>
            </div>

            {activeStep === 'deployment' && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-3 lg:grid-cols-3">
                  {DEPLOYMENT_OPTIONS.map((option) => (
                    <GlassCard
                      key={option.id}
                      variant={data.deploymentModel === option.id ? 'accent' : 'default'}
                      className="p-4"
                      hoverLift
                      onClick={() => onboarding.update({ deploymentModel: option.id })}
                    >
                      <div className="text-sm font-bold text-text-primary">{option.label}</div>
                      <p className="mt-1 text-[11px] leading-5 text-text-secondary">{option.description}</p>
                    </GlassCard>
                  ))}
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {RUNTIME_OPTIONS.map((option) => (
                    <GlassCard
                      key={option.id}
                      variant={data.runtimeProfile === option.id ? 'accent' : 'default'}
                      className="p-4"
                      hoverLift
                      onClick={() => onboarding.update({ runtimeProfile: option.id })}
                    >
                      <div className="text-sm font-bold text-text-primary">{option.label}</div>
                      <p className="mt-1 text-[11px] leading-5 text-text-secondary">{option.description}</p>
                    </GlassCard>
                  ))}
                </div>

                <label className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data.inlineProtection}
                    onChange={(event) => onboarding.update({ inlineProtection: event.target.checked })}
                    className="h-4 w-4 rounded"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Prepare inline protection path</div>
                    <div className="text-[11px] text-text-muted">Leave this off if you want discovery and alerting first, then move to blocking later.</div>
                  </div>
                </label>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-2xl border border-border-subtle bg-[#111827] p-4 text-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold">Controller rollout command</div>
                      <button onClick={() => copy(commands.install, 'Install command')} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-200 transition-colors hover:bg-white/10">
                        <Copy size={12} />
                      </button>
                    </div>
                    <pre className="mt-3 overflow-x-auto text-[11px] leading-6 text-slate-200"><code>{commands.install}</code></pre>
                  </div>

                  <GlassCard variant="default" className="p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Recommended next move</div>
                    <div className="mt-2 text-sm font-bold text-text-primary">Stand up the control plane before importing APIs.</div>
                    <p className="mt-2 text-[11px] leading-5 text-text-secondary">
                      AppSentinels positions deployment before application onboarding so health, keys, and telemetry are already available when teams register their domains.
                    </p>
                    <button
                      onClick={() => navigate('/admin/settings/license')}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                    >
                      Review license envelope
                      <ChevronRight size={12} />
                    </button>
                  </GlassCard>
                </div>
              </div>
            )}

            {activeStep === 'traffic' && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-3 lg:grid-cols-2">
                  {TRAFFIC_OPTIONS.map((option) => (
                    <GlassCard
                      key={option.id}
                      variant={data.trafficSource === option.id ? 'accent' : 'default'}
                      className="p-4"
                      hoverLift
                      onClick={() => onboarding.update({ trafficSource: option.id })}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                          <Network size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-text-primary">{option.label}</div>
                          <p className="mt-1 text-[11px] leading-5 text-text-secondary">{option.description}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl border border-border-subtle bg-[#0f172a] p-4 text-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <KeyRound size={13} />
                        Sensor and traffic bootstrap
                      </div>
                      <button onClick={() => copy(commands.telemetry, 'Telemetry variables')} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-200 transition-colors hover:bg-white/10">
                        <Copy size={12} />
                      </button>
                    </div>
                    <pre className="mt-3 overflow-x-auto text-[11px] leading-6 text-slate-200"><code>{commands.telemetry}</code></pre>
                  </div>

                  <GlassCard variant="default" className="p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Bootstrap pattern</div>
                    <div className="mt-3 space-y-2 text-[11px] text-text-secondary">
                      <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-2">
                        <div className="font-semibold text-text-primary">Controller key</div>
                        <div className="mt-1 font-mono text-text-muted">APPSENTINEL_CONTROLLER_KEY=&lt;secure-key&gt;</div>
                      </div>
                      <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-2">
                        <div className="font-semibold text-text-primary">Sensor key</div>
                        <div className="mt-1 font-mono text-text-muted">APPSENTINEL_SENSOR_KEY=&lt;secure-key&gt;</div>
                      </div>
                      <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-2">
                        <div className="font-semibold text-text-primary">Collector URL</div>
                        <div className="mt-1 font-mono text-text-muted">https://collector.company.internal</div>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/admin/settings/api-keys')}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                    >
                      Manage org API keys
                      <ChevronRight size={12} />
                    </button>
                  </GlassCard>
                </div>
              </div>
            )}

            {activeStep === 'application' && (
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Application name</label>
                      <input
                        value={data.applicationName}
                        onChange={(event) => onboarding.update({ applicationName: event.target.value })}
                        placeholder="customer-api-prod"
                        className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Application domain</label>
                      <input
                        value={data.applicationDomain}
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
                        value={data.environment}
                        onChange={(event) => onboarding.update({ environment: event.target.value as typeof data.environment })}
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
                        value={data.businessUnit}
                        onChange={(event) => onboarding.update({ businessUnit: event.target.value })}
                        placeholder="Core Platform"
                        className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Assigned users</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {(owners.length > 0 ? owners : [{ login: 'owner@company.com', role: 'ADMIN' }]).map((owner) => (
                        <label key={owner.login} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={data.assignedUsers.includes(owner.login)}
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

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleApplicationCreate}
                      disabled={creatingApp}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
                    >
                      {creatingApp ? 'Registering...' : 'Register application'}
                      <ArrowRight size={15} />
                    </button>
                    <button
                      onClick={() => navigate('/admin/applications/add')}
                      className="rounded-xl border border-border-subtle px-4 py-3 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                    >
                      Open dedicated Add Application page
                    </button>
                  </div>
                </div>

                <GlassCard variant="default" className="p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                    <Globe size={12} />
                    Why this matters
                  </div>
                  <div className="mt-3 space-y-3 text-[11px] leading-5 text-text-secondary">
                    <p>AppSentinels separates application onboarding from raw traffic capture so ownership, reporting, and policy scopes stay clear.</p>
                    <p>Use production domains for high-fidelity discovery and add staging domains later as separate collections if teams need cleaner blast-radius control.</p>
                    <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                      <div className="font-semibold text-text-primary">Current state</div>
                      <div className="mt-1 text-text-muted">
                        {data.collectionId ? `Collection ${data.collectionId} mapped` : 'No collection registered yet'}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}

            {activeStep === 'identity' && (
              <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ['Authorization header', 'authHeader', 'authorization'],
                    ['Session key', 'sessionKey', 'x-session-id'],
                    ['User identifier', 'userIdKey', 'x-user-id'],
                    ['Role attribute', 'userRoleKey', 'x-user-role'],
                    ['Tenant key', 'tenantKey', 'x-tenant-id'],
                  ].map(([label, key, placeholder]) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</label>
                      <input
                        value={data[key as keyof typeof data] as string}
                        onChange={(event) => onboarding.update({ [key]: event.target.value } as Partial<typeof data>)}
                        placeholder={placeholder}
                        className="w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20"
                      />
                    </div>
                  ))}
                </div>

                <GlassCard variant="default" className="p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Feature envelope</div>
                  <div className="mt-3 space-y-2">
                    {[
                      ['discovery', 'Passive discovery'],
                      ['behavioralTesting', 'Behavioral testing'],
                      ['realtimeProtection', 'Realtime protection'],
                      ['reporting', 'Executive reporting'],
                    ].map(([feature, label]) => (
                      <label key={feature} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
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
                  <p className="mt-3 text-[11px] leading-5 text-text-secondary">
                    Identity-aware attributes are what make business-logic analysis, user-centric traces, and tenant-level policy decisions feel trustworthy.
                  </p>
                  <button
                    onClick={() => navigate('/admin/settings/attribute-mapping')}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                  >
                    Open attribute mapping
                    <ChevronRight size={12} />
                  </button>
                </GlassCard>
              </div>
            )}

            {activeStep === 'validation' && (
              <div className="mt-6 space-y-6">
                <div className="grid gap-3 md:grid-cols-2">
                  {validationCards.map((card) => (
                    <label key={card.key} className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-bg-base px-4 py-4">
                        <input
                          type="checkbox"
                          checked={data.validation[card.key]}
                          onChange={() => handleValidationToggle(card.key)}
                          className="mt-1 h-4 w-4 rounded"
                          style={{ accentColor: 'var(--brand)' }}
                        />
                      <div>
                        <div className="text-sm font-semibold text-text-primary">{card.label}</div>
                        <p className="mt-1 text-[11px] leading-5 text-text-secondary">{card.description}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <GlassCard variant="accent" className="p-5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
                      <Sparkles size={12} />
                      Live rollout summary
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-brand/10 bg-brand/5 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Collections</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">{applicationCount}</div>
                      </div>
                      <div className="rounded-xl border border-brand/10 bg-brand/5 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Endpoints</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">{endpointsSeen}</div>
                      </div>
                      <div className="rounded-xl border border-brand/10 bg-brand/5 px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">Connected modules</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">{connectedModules}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button onClick={() => navigate('/admin/system-health')} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary">
                        Review health
                      </button>
                      <button onClick={() => navigate('/app/discovery')} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary">
                        Open discovery
                      </button>
                      <button onClick={() => navigate('/app/protection')} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary">
                        Stage protection
                      </button>
                    </div>
                  </GlassCard>

                  <GlassCard variant="default" className="p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Go-live guidance</div>
                    <ul className="mt-3 space-y-2 text-[11px] leading-5 text-text-secondary">
                      <li>Start with passive discovery and alerting before enforcing blocking.</li>
                      <li>Validate one production application thoroughly, then templatize the rollout.</li>
                      <li>Move teams from collection-level ownership to policy-level accountability as inventory stabilizes.</li>
                    </ul>
                  </GlassCard>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
              <button
                onClick={() => onboarding.reset()}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
              >
                Reset flow
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => navigate('/app/organization')}
                  className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/20 hover:text-text-primary"
                >
                  Exit to organization
                </button>
                <button
                  onClick={completeAndAdvance}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  {activeStep === 'validation' ? 'Finish onboarding' : 'Save and continue'}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
