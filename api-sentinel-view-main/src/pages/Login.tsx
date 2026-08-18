import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  Loader2, Eye, EyeOff, Lock, Mail, ShieldCheck, Radar, FileSearch,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { get } from '@/lib/api-client';
import { validateEmail, validatePassword } from '@/lib/validations';

const FEATURES = [
  {
    icon: FileSearch,
    title: 'API Discovery',
    desc: 'Inventory every endpoint, parameter, and auth surface from live traffic.',
  },
  {
    icon: Radar,
    title: 'Active Testing',
    desc: 'OWASP-aligned templates, pentest runs, and evidence-backed findings.',
  },
  {
    icon: ShieldCheck,
    title: 'Runtime Protection',
    desc: 'Detect, correlate, and enforce — with human-gated remediation paths.',
  },
] as const;

function getPasswordValidationError(password: string, isSignup: boolean): string | null {
  if (!password) {
    return 'Please enter email and password';
  }
  if (!isSignup && password.length < 6) {
    return 'Password must be at least 6 characters';
  }
  if (isSignup) {
    if (password.length < 12) {
      return 'Password must be at least 12 characters';
    }
    if (!/[A-Za-z]/.test(password)) {
      return 'Password must include at least one letter';
    }
    if (!/\d/.test(password)) {
      return 'Password must include at least one number';
    }
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
      return 'Password must include at least one special character';
    }
  }
  return null;
}

const BrandMark: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <div className="flex items-center gap-3">
    <div
      className={`flex items-center justify-center rounded-md font-bold tracking-tight text-white ${
        size === 'md' ? 'h-10 w-10 text-[15px]' : 'h-9 w-9 text-[13px]'
      }`}
      style={{
        background: 'linear-gradient(135deg, #FF5B2E 0%, #D94418 55%, #2B4CFF 120%)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 20px rgba(255,91,46,0.25)',
      }}
    >
      S
    </div>
    <div>
      <div
        className="font-semibold tracking-tight"
        style={{
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          color: '#F4F1EA',
          fontSize: size === 'md' ? 16 : 14,
        }}
      >
        API Sentinel
      </div>
      <div
        className="mt-0.5 font-medium"
        style={{
          fontSize: 12,
          color: 'rgba(200,196,188,0.62)',
        }}
      >
        API security platform
      </div>
    </div>
  </div>
);

const Login: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [shakeError, setShakeError] = React.useState(false);
  const [isSignup, setIsSignup] = React.useState(false);
  const [signupEnabled, setSignupEnabled] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const { user, login, signup, error: authError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  React.useEffect(() => {
    let cancelled = false;
    get<{ signup_enabled?: boolean }>('/auth/public-config')
      .then((config) => {
        if (!cancelled) setSignupEnabled(Boolean(config.signup_enabled));
      })
      .catch(() => {
        if (!cancelled) setSignupEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!signupEnabled) setIsSignup(false);
  }, [signupEnabled]);

  if (user) return <Navigate to={from} replace />;

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);

    const emailResult = validateEmail(email);
    if (!emailResult.valid) {
      setEmailError(emailResult.error || 'Invalid email');
      setLocalError(emailResult.error || 'Invalid email');
      triggerShake();
      return;
    }

    const passwordPolicy = getPasswordValidationError(password, isSignup);
    if (passwordPolicy) {
      setPasswordError(passwordPolicy);
      setLocalError(passwordPolicy);
      triggerShake();
      return;
    }

    const passwordResult = validatePassword(password);
    if (!passwordResult.valid) {
      setPasswordError(passwordResult.error || 'Invalid password');
      setLocalError(passwordResult.error || 'Invalid password');
      triggerShake();
      return;
    }

    setLocalError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
        if (!signupEnabled) {
          setLocalError('Public signup is disabled. Ask an administrator to invite you.');
          triggerShake();
          setSubmitting(false);
          return;
        }
        await signup(email, password);
      } else {
        await login(email, password);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Something went wrong. Please try again.';
      setLocalError(msg);
      triggerShake();
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg-base text-text-primary">
      <div className="grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]">
        {/* Left — AgentOS-style dark brand panel */}
        <section
          className="relative hidden min-h-0 overflow-y-auto lg:flex lg:flex-col"
          style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', borderRight: '1px solid var(--sidebar-border)' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 22%, rgba(43,76,255,0.45), transparent 45%), radial-gradient(circle at 85% 8%, rgba(255,91,46,0.28), transparent 38%)',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(244,241,234,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(244,241,234,0.15) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent, transparent, rgba(14,17,22,0.8))' }}
          />

          <div className="relative flex min-h-full flex-1 flex-col justify-between p-8 xl:p-12">
            <BrandMark />

            <div className="my-8 max-w-lg space-y-8 xl:my-10">
              <div className="space-y-4">
                <h1
                  className="text-[2rem] font-semibold leading-[1.2] tracking-tight xl:text-[2.25rem]"
                  style={{ color: 'var(--sidebar-title)' }}
                >
                  See every API. Prove every finding.
                </h1>
                <p className="max-w-md text-[15px] leading-7" style={{ color: 'rgba(200,196,188,0.75)' }}>
                  Inventory, test, and protect APIs from live traffic — with evidence your security team can act on.
                </p>
              </div>

              <div className="space-y-5">
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex gap-3">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: 'rgba(255,91,46,0.12)', color: '#FF8A5B' }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#F4F1EA' }}>{title}</div>
                      <p className="mt-0.5 text-[13px] leading-5" style={{ color: 'rgba(200,196,188,0.65)' }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <footer
              className="flex items-start gap-2.5 pt-6 text-[11px] leading-relaxed"
              style={{ borderTop: '1px solid rgba(37,43,54,0.8)', color: 'rgba(200,196,188,0.5)' }}
            >
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'rgba(255,91,46,0.7)' }} />
              <span>
                Sessions use httpOnly cookies. Tenant data is scoped by account. Active scans require an
                allowlisted target and authenticated profile.
              </span>
            </footer>
          </div>
        </section>

        {/* Right — credential panel */}
        <section className="relative flex min-h-0 flex-col justify-center overflow-y-auto px-6 py-8 sm:px-10 lg:px-12">
          {/* Mobile brand strip */}
          <div
            className="mb-8 rounded-xl p-5 lg:hidden"
            style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-fg)', border: '1px solid var(--sidebar-border)' }}
          >
            <BrandMark size="sm" />
            <p className="mt-4 text-[15px] font-semibold leading-snug" style={{ color: '#F4F1EA' }}>
              See every API. Prove every finding.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgba(200,196,188,0.7)' }}>
              Live API discovery, testing, and runtime protection.
            </p>
          </div>

          <div className="mx-auto w-full max-w-[400px] space-y-7">
            <div className="space-y-1.5 lg:pt-2">
                <h2 className="text-[1.5rem] font-semibold tracking-tight text-text-primary">
                {isSignup ? 'Create account' : 'Sign in'}
              </h2>
              <p className="text-sm leading-6 text-text-secondary">
                {isSignup
                  ? 'Set up your admin account for a new tenant workspace.'
                  : 'Use your operator credentials to open the workspace.'}
              </p>
            </div>

            <div
              className={`overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-sm ${shakeError ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
            >
              <div className="border-b border-border-subtle bg-bg-elevated px-5 py-3">
                <p className="text-[11px] font-medium text-text-secondary">
                  {isSignup ? 'New admin credentials' : 'Operator credentials'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 p-5">
                {displayError && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="rounded-lg px-3.5 py-2.5 text-[13px] leading-snug"
                    style={{
                      background: 'rgba(220,38,38,0.08)',
                      border: '1px solid rgba(220,38,38,0.22)',
                      color: '#B42318',
                    }}
                  >
                    {displayError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="auth-email" className="text-xs font-medium text-text-primary">
                    Work email
                  </label>
                  <div className="relative">
                    <Mail
                      size={15}
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${emailError ? 'text-sev-critical' : 'text-text-muted'}`}
                    />
                    <input
                      id="auth-email"
                      data-testid="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`h-11 w-full rounded-md border bg-bg-elevated pl-10 pr-3 text-sm text-text-primary outline-none transition-shadow placeholder:text-text-muted focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--brand-glow)] ${emailError ? 'border-sev-critical' : 'border-border-default'}`}
                      onBlur={() => {
                        if (email.trim()) {
                          const result = validateEmail(email);
                          setEmailError(result.valid ? null : result.error || null);
                        }
                      }}
                      placeholder="you@company.com"
                      disabled={submitting}
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                  {emailError && <p className="text-[11px]" style={{ color: '#DC2626' }}>{emailError}</p>}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-password" className="text-xs font-medium text-text-primary">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${passwordError ? 'text-sev-critical' : 'text-text-muted'}`}
                    />
                    <input
                      id="auth-password"
                      data-testid="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`h-11 w-full rounded-md border bg-bg-elevated pl-10 pr-10 text-sm text-text-primary outline-none transition-shadow placeholder:text-text-muted focus:border-brand-blue focus:shadow-[0_0_0_3px_var(--brand-glow)] ${passwordError ? 'border-sev-critical' : 'border-border-default'}`}
                      onBlur={() => {
                        if (password) {
                          const result = validatePassword(password);
                          const policy = getPasswordValidationError(password, isSignup);
                          setPasswordError((!result.valid ? result.error : policy) || null);
                        }
                      }}
                      placeholder={isSignup ? 'Min 12 chars, letter, number, symbol' : 'Password'}
                      disabled={submitting}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordError && <p className="text-[11px]" style={{ color: '#DC2626' }}>{passwordError}</p>}
                </div>

                {!isSignup && (
                  <label className="flex min-h-[40px] items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: 'var(--brand)' }}
                    />
                    <span className="text-xs text-text-secondary">
                      Remember me
                    </span>
                  </label>
                )}

                {isSignup && !passwordError && (
                  <p className="text-[11px] text-text-secondary">
                    Use at least 12 characters and include a letter, number, and symbol.
                  </p>
                )}

                <button
                  data-testid="auth-submit"
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting
                    ? isSignup
                      ? 'Creating account…'
                      : 'Signing in…'
                    : isSignup
                      ? 'Create admin account'
                      : 'Sign in with credentials'}
                </button>
              </form>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-text-secondary">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <button
                    data-testid="auth-mode-toggle"
                    type="button"
                    onClick={() => {
                      setIsSignup(false);
                      setLocalError(null);
                    }}
                    className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: '#D94418' }}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Access is limited to provisioned operators.
                  {signupEnabled && (
                    <>
                      <br />
                      First time?{' '}
                      <button
                        data-testid="auth-mode-toggle"
                        type="button"
                        onClick={() => {
                          setIsSignup(true);
                          setLocalError(null);
                        }}
                        className="font-semibold underline-offset-2 hover:underline"
                        style={{ color: '#D94418' }}
                      >
                        Create admin account
                      </button>
                    </>
                  )}
                </>
              )}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border-subtle pt-5 text-[10.5px] text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <FileSearch className="h-3.5 w-3.5" style={{ color: 'rgba(43,76,255,0.7)' }} />
                Live inventory
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Radar className="h-3.5 w-3.5" style={{ color: 'rgba(43,76,255,0.7)' }} />
                Runtime detect
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'rgba(43,76,255,0.7)' }} />
                Audit evidence
              </span>
            </div>
          </div>
        </section>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 50%, 90% { transform: translateX(-4px); }
          30%, 70% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default Login;
