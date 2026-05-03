import React, { createContext, useContext, useEffect, useState } from 'react';

export type OnboardingStepId =
  | 'deployment'
  | 'traffic'
  | 'application'
  | 'identity'
  | 'validation';

export const ONBOARDING_STEPS: Array<{ id: OnboardingStepId; label: string; kicker: string }> = [
  { id: 'deployment', label: 'Deployment', kicker: 'Control plane and runtime' },
  { id: 'traffic', label: 'Traffic Sources', kicker: 'Gateways, keys, and ingestion' },
  { id: 'application', label: 'Application Mapping', kicker: 'Domains, owners, and environments' },
  { id: 'identity', label: 'Identity Signals', kicker: 'Auth, session, and tenant keys' },
  { id: 'validation', label: 'Go Live', kicker: 'Verify telemetry and protection' },
];

type DeploymentModel = 'saas' | 'hybrid' | 'self-hosted';
type RuntimeProfile = 'kubernetes' | 'vm' | 'gateway';
type TrafficSource = 'nginx' | 'envoy' | 'aws' | 'manual';
type EnvironmentName = 'production' | 'staging' | 'development';

interface OnboardingData {
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  deploymentModel: DeploymentModel;
  runtimeProfile: RuntimeProfile;
  inlineProtection: boolean;
  trafficSource: TrafficSource;
  applicationName: string;
  applicationDomain: string;
  environment: EnvironmentName;
  businessUnit: string;
  assignedUsers: string[];
  collectionId: string | null;
  authHeader: string;
  sessionKey: string;
  userIdKey: string;
  userRoleKey: string;
  tenantKey: string;
  features: {
    discovery: boolean;
    behavioralTesting: boolean;
    realtimeProtection: boolean;
    reporting: boolean;
  };
  validation: {
    controllerHealthy: boolean;
    trafficSeen: boolean;
    inventoryVisible: boolean;
    policiesEnabled: boolean;
  };
  completed: boolean;
}

interface OnboardingContextValue {
  data: OnboardingData;
  isHydrated: boolean;
  progress: number;
  nextStep: OnboardingStepId | null;
  setCurrentStep: (step: OnboardingStepId) => void;
  update: (patch: Partial<OnboardingData>) => void;
  toggleAssignedUser: (user: string) => void;
  toggleFeature: (feature: keyof OnboardingData['features']) => void;
  toggleValidation: (key: keyof OnboardingData['validation']) => void;
  markStepComplete: (step: OnboardingStepId) => void;
  registerApplication: (payload: { name: string; domain: string; collectionId?: string | null }) => void;
  finish: () => void;
  reset: () => void;
}

const STORAGE_KEY = 'appsentinel-onboarding-v1';

const DEFAULT_STATE: OnboardingData = {
  currentStep: 'deployment',
  completedSteps: [],
  deploymentModel: 'saas',
  runtimeProfile: 'kubernetes',
  inlineProtection: false,
  trafficSource: 'nginx',
  applicationName: '',
  applicationDomain: '',
  environment: 'production',
  businessUnit: 'Core Platform',
  assignedUsers: [],
  collectionId: null,
  authHeader: 'authorization',
  sessionKey: 'x-session-id',
  userIdKey: 'x-user-id',
  userRoleKey: 'x-user-role',
  tenantKey: 'x-tenant-id',
  features: {
    discovery: true,
    behavioralTesting: true,
    realtimeProtection: true,
    reporting: true,
  },
  validation: {
    controllerHealthy: false,
    trafficSeen: false,
    inventoryVisible: false,
    policiesEnabled: false,
  },
  completed: false,
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function getStoredState(): OnboardingData {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<OnboardingData>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      features: { ...DEFAULT_STATE.features, ...(parsed.features ?? {}) },
      validation: { ...DEFAULT_STATE.validation, ...(parsed.validation ?? {}) },
      assignedUsers: parsed.assignedUsers ?? DEFAULT_STATE.assignedUsers,
      completedSteps: parsed.completedSteps ?? DEFAULT_STATE.completedSteps,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function uniqueSteps(steps: OnboardingStepId[]) {
  return ONBOARDING_STEPS.map((step) => step.id).filter((id) => steps.includes(id));
}

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<OnboardingData>(DEFAULT_STATE);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setData(getStoredState());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, isHydrated]);

  const progress = Math.round((data.completedSteps.length / ONBOARDING_STEPS.length) * 100);
  const nextStep = ONBOARDING_STEPS.find((step) => !data.completedSteps.includes(step.id))?.id ?? null;

  const setCurrentStep = (step: OnboardingStepId) => {
    setData((current) => ({ ...current, currentStep: step }));
  };

  const update = (patch: Partial<OnboardingData>) => {
    setData((current) => ({ ...current, ...patch }));
  };

  const toggleAssignedUser = (user: string) => {
    setData((current) => ({
      ...current,
      assignedUsers: current.assignedUsers.includes(user)
        ? current.assignedUsers.filter((entry) => entry !== user)
        : [...current.assignedUsers, user],
    }));
  };

  const toggleFeature = (feature: keyof OnboardingData['features']) => {
    setData((current) => ({
      ...current,
      features: {
        ...current.features,
        [feature]: !current.features[feature],
      },
    }));
  };

  const toggleValidation = (key: keyof OnboardingData['validation']) => {
    setData((current) => ({
      ...current,
      validation: {
        ...current.validation,
        [key]: !current.validation[key],
      },
    }));
  };

  const markStepComplete = (step: OnboardingStepId) => {
    setData((current) => ({
      ...current,
      completedSteps: uniqueSteps([...current.completedSteps, step]),
    }));
  };

  const registerApplication = (payload: { name: string; domain: string; collectionId?: string | null }) => {
    setData((current) => ({
      ...current,
      applicationName: payload.name,
      applicationDomain: payload.domain,
      collectionId: payload.collectionId ?? current.collectionId,
      completedSteps: uniqueSteps([...current.completedSteps, 'application']),
    }));
  };

  const finish = () => {
    setData((current) => ({
      ...current,
      completedSteps: ONBOARDING_STEPS.map((step) => step.id),
      completed: true,
      currentStep: 'validation',
    }));
  };

  const reset = () => {
    setData(DEFAULT_STATE);
  };

  return (
    <OnboardingContext.Provider
      value={{
        data,
        isHydrated,
        progress,
        nextStep,
        setCurrentStep,
        update,
        toggleAssignedUser,
        toggleFeature,
        toggleValidation,
        markStepComplete,
        registerApplication,
        finish,
        reset,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}
