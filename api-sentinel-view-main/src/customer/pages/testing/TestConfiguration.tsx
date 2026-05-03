import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Play, Radar, Workflow, Zap } from 'lucide-react';

import EmptyState from '@/components/shared/EmptyState';
import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import {
  useAuthProfiles,
  useCreateAuthProfile,
  useCreatePentestProfile,
  useDetectionMeta,
  useOpenApiHistory,
  usePentestArtifacts,
  usePentestProfiles,
  usePreparePentestProfile,
  useStartTestRun,
  useTestingEndpoints,
  useTestingTemplates,
} from '@/hooks/use-security-ops';
import { toast } from '@/hooks/use-toast';

type AuthMode = 'header' | 'bearer' | 'basic' | 'cookie' | 'dynamic_bearer';
type PentestMode = 'SAFE' | 'BALANCED' | 'AGGRESSIVE';

const inputClass =
  'w-full rounded-xl border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary outline-none transition-all focus:border-brand/30 focus:ring-1 focus:ring-brand/20';

const TestConfiguration: React.FC = () => {
  const detectionMeta = useDetectionMeta();
  const authProfiles = useAuthProfiles();
  const pentestProfiles = usePentestProfiles();
  const artifacts = usePentestArtifacts(undefined, 8);
  const templates = useTestingTemplates();
  const endpoints = useTestingEndpoints(10);
  const specs = useOpenApiHistory(8);

  const createAuth = useCreateAuthProfile();
  const createProfile = useCreatePentestProfile();
  const prepareMaterials = usePreparePentestProfile();
  const startRun = useStartTestRun();

  const [authMode, setAuthMode] = useState<AuthMode>('header');
  const [authName, setAuthName] = useState('Primary application auth');
  const [authDescription, setAuthDescription] = useState('Reusable auth context for authenticated API validation.');
  const [headerName, setHeaderName] = useState('Authorization');
  const [secretValue, setSecretValue] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [tokenPath, setTokenPath] = useState('/access_token');
  const [domains, setDomains] = useState('');

  const [profileName, setProfileName] = useState('Production Safe');
  const [profileMode, setProfileMode] = useState<PentestMode>('SAFE');
  const [profileAuthId, setProfileAuthId] = useState('');
  const [profileRole, setProfileRole] = useState('ATTACKER');
  const [profileStateful, setProfileStateful] = useState(true);
  const [profileDast, setProfileDast] = useState(false);

  const [targetUrl, setTargetUrl] = useState('https://api.example.com');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [persistArtifacts, setPersistArtifacts] = useState(true);

  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState<string[]>([]);
  const [runProfileId, setRunProfileId] = useState('');
  const [latestRunId, setLatestRunId] = useState<string | null>(null);

  useEffect(() => {
    const authId = authProfiles.data?.profiles?.[0]?.id;
    if (authId && !profileAuthId) setProfileAuthId(authId);
  }, [authProfiles.data, profileAuthId]);

  useEffect(() => {
    const profileId = pentestProfiles.data?.profiles?.[0]?.id;
    if (profileId && !selectedProfileId) setSelectedProfileId(profileId);
    if (profileId && !runProfileId) setRunProfileId(profileId);
  }, [pentestProfiles.data, runProfileId, selectedProfileId]);

  useEffect(() => {
    const specId = specs.data?.specs?.[0]?.id;
    if (specId && !selectedSpecId) setSelectedSpecId(specId);
  }, [selectedSpecId, specs.data]);

  useEffect(() => {
    if (!selectedTemplateIds.length && templates.data?.templates?.length) {
      setSelectedTemplateIds(templates.data.templates.slice(0, 3).map((template) => template.id));
    }
  }, [selectedTemplateIds.length, templates.data]);

  useEffect(() => {
    if (!selectedEndpointIds.length && endpoints.data?.endpoints?.length) {
      setSelectedEndpointIds(endpoints.data.endpoints.slice(0, 2).map((endpoint) => endpoint.id));
    }
  }, [endpoints.data, selectedEndpointIds.length]);

  const preparedArtifacts = prepareMaterials.data?.artifacts ?? {};
  const infoError =
    detectionMeta.isError ||
    authProfiles.isError ||
    pentestProfiles.isError ||
    artifacts.isError ||
    templates.isError ||
    endpoints.isError;

  const selectedProfile = useMemo(
    () => pentestProfiles.data?.profiles?.find((profile) => profile.id === selectedProfileId) ?? null,
    [pentestProfiles.data, selectedProfileId],
  );

  const toggleValue = (values: string[], value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, description: 'Paste it into your tooling or CI runner.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Clipboard access was denied by the browser.', variant: 'destructive' });
    }
  };

  const handleCreateAuth = async () => {
    try {
      await createAuth.mutateAsync({
        name: authName.trim(),
        description: authDescription.trim(),
        auth_mode: authMode,
        header_name: authMode === 'header' ? headerName.trim() : undefined,
        header_value: authMode === 'header' ? secretValue.trim() : undefined,
        token: authMode === 'bearer' ? secretValue.trim() : undefined,
        username: authMode === 'basic' || authMode === 'dynamic_bearer' ? username.trim() : undefined,
        password: authMode === 'basic' || authMode === 'dynamic_bearer' ? password : undefined,
        cookie_name: authMode === 'cookie' ? headerName.trim() : undefined,
        cookie_value: authMode === 'cookie' ? secretValue.trim() : undefined,
        login_url: authMode === 'dynamic_bearer' ? loginUrl.trim() : undefined,
        token_json_path: authMode === 'dynamic_bearer' ? tokenPath.trim() : undefined,
        openapi_security_scheme: 'BearerAuth',
        scope_domains: domains.split(',').map((item) => item.trim()).filter(Boolean),
      });
      setSecretValue('');
      setPassword('');
      toast({ title: 'Auth profile created', description: 'It can now be bound to pentest profiles.' });
    } catch {
      toast({ title: 'Auth profile creation failed', description: 'The backend rejected the auth payload.', variant: 'destructive' });
    }
  };

  const handleCreateProfile = async () => {
    try {
      const response = await createProfile.mutateAsync({
        name: profileName.trim(),
        description: `Frontend-created ${profileMode.toLowerCase()} profile`,
        mode: profileMode,
        auth_profile_id: profileAuthId || undefined,
        attacker_role: profileRole,
        schemathesis_stateful: profileStateful,
        nuclei_include_dast: profileDast,
      });
      setSelectedProfileId(response.profile.id);
      setRunProfileId(response.profile.id);
      toast({ title: 'Pentest profile created', description: 'Use it below for preparation and run launch.' });
    } catch {
      toast({ title: 'Pentest profile creation failed', description: 'The backend did not accept the run profile.', variant: 'destructive' });
    }
  };

  const handlePrepare = async () => {
    if (!selectedProfileId) {
      toast({ title: 'Select a pentest profile', description: 'Choose a profile before preparing materials.', variant: 'destructive' });
      return;
    }
    try {
      await prepareMaterials.mutateAsync({
        profileId: selectedProfileId,
        payload: { target_url: targetUrl.trim(), spec_id: selectedSpecId || undefined, persist: persistArtifacts },
      });
      toast({ title: 'Materials prepared', description: 'The scan pack is ready for local or CI execution.' });
    } catch {
      toast({ title: 'Preparation failed', description: 'The backend could not prepare the requested materials.', variant: 'destructive' });
    }
  };

  const handleRun = async () => {
    try {
      const response = await startRun.mutateAsync({
        templateIds: selectedTemplateIds,
        endpointIds: selectedEndpointIds,
        pentestProfileId: runProfileId || undefined,
      });
      setLatestRunId(response.run_id);
      toast({ title: 'Verification run started', description: `Run ${response.run_id.slice(0, 8)} is now executing.` });
    } catch {
      toast({ title: 'Run launch failed', description: 'Check the selected scope and try again.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {infoError && (
        <QueryError
          message="Failed to load pentest or detection configuration data"
          onRetry={() => {
            void detectionMeta.refetch();
            void authProfiles.refetch();
            void pentestProfiles.refetch();
            void artifacts.refetch();
            void templates.refetch();
            void endpoints.refetch();
          }}
        />
      )}

      <GlassCard variant="elevated" className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Pentest Workbench</div>
            <h2 className="mt-1 text-sm font-bold text-text-primary">Profiles, prep materials, and scoped run launch</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3"><div className="text-[11px] text-text-muted">Detection</div><div className="mt-1 text-sm font-bold text-text-primary">{detectionMeta.data?.mode ?? 'off'}</div></div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3"><div className="text-[11px] text-text-muted">Detectors</div><div className="mt-1 text-sm font-bold text-text-primary">{detectionMeta.data?.detectors.length ?? 0}</div></div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3"><div className="text-[11px] text-text-muted">Auth profiles</div><div className="mt-1 text-sm font-bold text-text-primary">{authProfiles.data?.total ?? 0}</div></div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3"><div className="text-[11px] text-text-muted">Run profiles</div><div className="mt-1 text-sm font-bold text-text-primary">{pentestProfiles.data?.total ?? 0}</div></div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted"><KeyRound size={12} />Auth profile</div>
          <div className="mt-4 space-y-3">
            <input data-testid="auth-profile-name" value={authName} onChange={(event) => setAuthName(event.target.value)} className={inputClass} placeholder="Profile name" />
            <textarea value={authDescription} onChange={(event) => setAuthDescription(event.target.value)} rows={3} className={inputClass} />
            <select data-testid="auth-profile-mode" value={authMode} onChange={(event) => setAuthMode(event.target.value as AuthMode)} className={inputClass}>
              <option value="header">Header</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
              <option value="cookie">Cookie</option>
              <option value="dynamic_bearer">Dynamic bearer</option>
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <input data-testid="auth-profile-header-name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} className={inputClass} placeholder={authMode === 'cookie' ? 'Cookie name' : 'Header name'} />
              <input data-testid="auth-profile-secret" value={secretValue} onChange={(event) => setSecretValue(event.target.value)} className={inputClass} placeholder="Secret value / token / cookie value" />
            </div>
            {(authMode === 'basic' || authMode === 'dynamic_bearer') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input data-testid="auth-profile-username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} placeholder="Username" />
                <input data-testid="auth-profile-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} placeholder="Password" />
              </div>
            )}
            {authMode === 'dynamic_bearer' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input data-testid="auth-profile-login-url" value={loginUrl} onChange={(event) => setLoginUrl(event.target.value)} className={inputClass} placeholder="Login URL" />
                <input data-testid="auth-profile-token-path" value={tokenPath} onChange={(event) => setTokenPath(event.target.value)} className={inputClass} placeholder="Token selector" />
              </div>
            )}
            <input data-testid="auth-profile-domains" value={domains} onChange={(event) => setDomains(event.target.value)} className={inputClass} placeholder="Scoped domains, comma-separated" />
            <button data-testid="create-auth-profile" onClick={handleCreateAuth} disabled={createAuth.isPending} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
              {createAuth.isPending ? 'Creating auth profile...' : 'Create auth profile'}
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {(authProfiles.data?.profiles ?? []).slice(0, 3).map((profile) => (
              <div key={profile.id} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                <div className="text-sm font-semibold text-text-primary">{profile.name}</div>
                <div className="mt-1 text-[11px] text-text-muted">{profile.auth_mode} · {profile.scope_domains.length ? profile.scope_domains.join(', ') : 'all domains'}</div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted"><Workflow size={12} />Pentest profile</div>
          <div className="mt-4 space-y-3">
            <input data-testid="pentest-profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} className={inputClass} placeholder="Profile name" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select data-testid="pentest-profile-mode" value={profileMode} onChange={(event) => setProfileMode(event.target.value as PentestMode)} className={inputClass}>
                <option value="SAFE">Safe</option>
                <option value="BALANCED">Balanced</option>
                <option value="AGGRESSIVE">Aggressive</option>
              </select>
              <select data-testid="pentest-profile-auth" value={profileAuthId} onChange={(event) => setProfileAuthId(event.target.value)} className={inputClass}>
                <option value="">No auth profile</option>
                {(authProfiles.data?.profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select data-testid="pentest-profile-role" value={profileRole} onChange={(event) => setProfileRole(event.target.value)} className={inputClass}>
                <option value="ATTACKER">Attacker</option>
                <option value="MEMBER">Member</option>
                <option value="DEVELOPER">Developer</option>
                <option value="SECURITY_ENGINEER">Security Engineer</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5 text-sm text-text-primary">
                  Stateful
                  <input type="checkbox" checked={profileStateful} onChange={(event) => setProfileStateful(event.target.checked)} style={{ accentColor: 'var(--brand)' }} />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5 text-sm text-text-primary">
                  DAST
                  <input type="checkbox" checked={profileDast} onChange={(event) => setProfileDast(event.target.checked)} style={{ accentColor: 'var(--brand)' }} />
                </label>
              </div>
            </div>
            <button data-testid="create-pentest-profile" onClick={handleCreateProfile} disabled={createProfile.isPending} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
              {createProfile.isPending ? 'Creating pentest profile...' : 'Create pentest profile'}
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {(pentestProfiles.data?.profiles ?? []).slice(0, 3).map((profile) => (
              <div key={profile.id} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{profile.name}</div>
                    <div className="mt-1 text-[11px] text-text-muted">{profile.mode} · {profile.attacker_role}</div>
                  </div>
                  <span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">{profile.nuclei_enabled ? 'nuclei' : 'config'}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted"><Radar size={12} />Prepare materials</div>
          <div className="mt-4 space-y-3">
            <input data-testid="prepare-target-url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} className={inputClass} placeholder="Target URL" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select data-testid="prepare-profile-select" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} className={inputClass}>
                <option value="">Select pentest profile</option>
                {(pentestProfiles.data?.profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <select data-testid="prepare-spec-select" value={selectedSpecId} onChange={(event) => setSelectedSpecId(event.target.value)} className={inputClass}>
                <option value="">Latest stored OpenAPI spec</option>
                {(specs.data?.specs ?? []).map((spec) => (
                  <option key={spec.id} value={spec.id}>{(spec.version || 'unversioned').toUpperCase()} · {spec.path_count} paths</option>
                ))}
              </select>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5 text-sm text-text-primary">
              Persist artifacts
              <input type="checkbox" checked={persistArtifacts} onChange={(event) => setPersistArtifacts(event.target.checked)} style={{ accentColor: 'var(--brand)' }} />
            </label>
            <button data-testid="prepare-materials" onClick={handlePrepare} disabled={prepareMaterials.isPending} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
              {prepareMaterials.isPending ? 'Preparing...' : 'Prepare Schemathesis / Nuclei materials'}
            </button>
          </div>

          {prepareMaterials.data && (
            <div className="mt-5 space-y-3">
              {Object.entries(preparedArtifacts).map(([artifactType, artifact]) => (
                <div key={artifactType} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div
                        data-testid={`prepared-artifact-title-${artifactType}`}
                        className="text-sm font-semibold text-text-primary"
                      >
                        {artifactType.replaceAll('_', ' ')}
                      </div>
                      <div className="mt-1 text-[11px] text-text-muted">{artifact.filename || 'Generated artifact'}</div>
                    </div>
                    {artifact.command && (
                      <button onClick={() => void copyText(artifact.command!, 'Command')} className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline">
                        <Copy size={11} /> Copy
                      </button>
                    )}
                  </div>
                  {artifact.command && <pre className="mt-3 overflow-x-auto rounded-xl border border-border-subtle bg-black/[0.03] px-3 py-3 text-[11px] text-text-primary font-mono whitespace-pre-wrap">{artifact.command}</pre>}
                  {artifact.recommendations?.slice(0, 2).map((recommendation) => (
                    <div key={recommendation} className="mt-2 rounded-xl border border-brand/10 bg-brand/5 px-3 py-2 text-[11px] text-text-secondary">{recommendation}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <div className="space-y-5">
          <GlassCard variant="elevated" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted"><Play size={12} />Launch run</div>
            <div className="mt-4 space-y-3">
              <select data-testid="run-profile-select" value={runProfileId} onChange={(event) => setRunProfileId(event.target.value)} className={inputClass}>
                <option value="">Use backend default profile</option>
                {(pentestProfiles.data?.profiles ?? []).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Templates</div>
                {(templates.data?.templates ?? []).slice(0, 6).map((template) => (
                  <label key={template.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                    <span className="text-sm text-text-primary">{template.name}</span>
                    <input type="checkbox" checked={selectedTemplateIds.includes(template.id)} onChange={() => toggleValue(selectedTemplateIds, template.id, setSelectedTemplateIds)} style={{ accentColor: 'var(--brand)' }} />
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Endpoints</div>
                {(endpoints.data?.endpoints ?? []).map((endpoint) => (
                  <label key={endpoint.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-base px-3 py-2.5">
                    <span className="text-sm text-text-primary"><span className="font-mono text-brand">{endpoint.method}</span> {endpoint.path}</span>
                    <input type="checkbox" checked={selectedEndpointIds.includes(endpoint.id)} onChange={() => toggleValue(selectedEndpointIds, endpoint.id, setSelectedEndpointIds)} style={{ accentColor: 'var(--brand)' }} />
                  </label>
                ))}
              </div>

              <button data-testid="start-verification-run" onClick={handleRun} disabled={startRun.isPending} className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
                {startRun.isPending ? 'Starting run...' : 'Start verification run'}
              </button>

              {latestRunId && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={14} />Run queued</div>
                  <div className="mt-1 text-[11px] text-emerald-800/80">{latestRunId}</div>
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard variant="elevated" className="p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted"><Zap size={12} />Persisted artifacts</div>
            <div className="mt-4 space-y-2">
              {artifacts.isLoading ? (
                <SkeletonLoader variant="list" count={2} />
              ) : artifacts.data?.artifacts?.length ? (
                artifacts.data.artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                    <div
                      data-testid={`persisted-artifact-title-${artifact.artifact_type}`}
                      className="text-sm font-semibold text-text-primary"
                    >
                      {artifact.artifact_type.replaceAll('_', ' ')}
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted">{artifact.filename || 'Stored artifact'}</div>
                  </div>
                ))
              ) : (
                <EmptyState title="No persisted artifacts yet" description="Prepare a profile with persistence enabled to retain generated materials." />
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {selectedProfile && (
        <GlassCard variant="default" className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Selected run posture</div>
              <h3 className="mt-1 text-sm font-bold text-text-primary">{selectedProfile.name}</h3>
            </div>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand">{selectedProfile.mode}</span>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3"><div className="text-[11px] text-text-muted">Attacker role</div><div className="mt-1 text-sm font-bold text-text-primary">{selectedProfile.attacker_role}</div></div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3"><div className="text-[11px] text-text-muted">Schemathesis</div><div className="mt-1 text-sm font-bold text-text-primary">{selectedProfile.schemathesis_enabled ? 'Enabled' : 'Disabled'}</div></div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3"><div className="text-[11px] text-text-muted">Nuclei</div><div className="mt-1 text-sm font-bold text-text-primary">{selectedProfile.nuclei_enabled ? 'Enabled' : 'Disabled'}</div></div>
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default TestConfiguration;
