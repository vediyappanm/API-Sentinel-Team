import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const Login: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [isSignup, setIsSignup] = React.useState(false);
  const { user, login, signup, error: authError } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/organization';

  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLocalError('Please enter email and password');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      if (isSignup) {
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
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base text-text-primary font-sans">
      <form onSubmit={handleSubmit} className="w-full max-w-[400px] space-y-6 rounded-2xl border border-border-subtle bg-bg-surface p-10 shadow-xl">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10 border border-brand/20">
            <Shield className="text-brand h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold font-display text-text-primary tracking-wide">API Security Platform</h1>
          <p className="text-sm text-muted-foreground">
            {isSignup ? 'Create your admin account' : 'Full Life Cycle API Security'}
          </p>
        </div>

        {displayError && (
          <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-2.5 text-xs text-[#EF4444]">
            {displayError}
          </div>
        )}

        <div className="space-y-4 pt-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary placeholder-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all"
              placeholder="you@company.com"
              disabled={submitting}
              autoComplete="email"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
              {!isSignup && <a href="#" className="text-xs text-brand hover:underline">Forgot password?</a>}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-bg-base px-4 py-3 text-sm text-text-primary placeholder-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand transition-all"
              placeholder={isSignup ? 'Min 6 characters' : '••••••••'}
              disabled={submitting}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-bold text-white hover:bg-brand/90 transition-colors shadow-[0_0_15px_rgba(249,115,22,0.15)] flex justify-center items-center gap-2 mt-4 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? (isSignup ? 'Creating Account...' : 'Signing In...') : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </div>

        <div className="text-center pt-4 border-t border-border-subtle mt-6">
          <button
            type="button"
            onClick={() => { setIsSignup(v => !v); setLocalError(null); }}
            className="text-xs text-muted-foreground hover:text-brand transition-colors outline-none cursor-pointer"
          >
            {isSignup ? 'Already have an account? Sign In' : 'First time? Create Admin Account'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login;
