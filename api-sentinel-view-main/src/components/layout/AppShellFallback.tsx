import React from 'react';

type AppShellFallbackProps = {
  variant?: 'app' | 'auth';
  message?: string;
};

const shimmerClass =
  'animate-pulse rounded-xl bg-[linear-gradient(90deg,rgba(255,255,255,0.65),rgba(244,241,251,0.92),rgba(255,255,255,0.65))]';

const AppShellFallback: React.FC<AppShellFallbackProps> = ({
  variant = 'app',
  message = 'Preparing your workspace...',
}) => {
  if (variant === 'auth') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(99,44,175,0.10),transparent_28%),linear-gradient(180deg,#fbfaff,#f3f1f8)] px-6">
        <div className="w-full max-w-md rounded-3xl border border-border-subtle bg-white/90 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-brand/10" />
            <div className="space-y-2">
              <div className={`h-3 w-32 ${shimmerClass}`} />
              <div className={`h-2.5 w-44 ${shimmerClass}`} />
            </div>
          </div>
          <div className="mt-8 space-y-3">
            <div className={`h-12 w-full ${shimmerClass}`} />
            <div className={`h-12 w-full ${shimmerClass}`} />
            <div className={`h-11 w-full ${shimmerClass}`} />
          </div>
          <p className="mt-6 text-center text-xs text-text-muted">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(99,44,175,0.08),transparent_24%),linear-gradient(180deg,#faf9fd,#f2f2f7)] text-text-primary">
      <aside className="hidden min-h-screen w-[88px] shrink-0 border-r border-border-subtle bg-[#f4f4f8] px-3 py-5 lg:flex lg:flex-col">
        <div className="flex items-center justify-center pb-5">
          <div className={`h-11 w-11 rounded-2xl ${shimmerClass}`} />
        </div>
        <div className="space-y-3 pt-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              <div className={`h-10 w-10 rounded-xl ${shimmerClass}`} />
              <div className={`h-2 w-10 rounded-full ${shimmerClass}`} />
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <div className="border-b border-border-subtle bg-white/65 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <div className={`h-3 w-32 rounded-full ${shimmerClass}`} />
              <div className={`h-2.5 w-44 rounded-full ${shimmerClass}`} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-9 w-28 rounded-xl ${shimmerClass}`} />
              <div className={`h-9 w-9 rounded-xl ${shimmerClass}`} />
              <div className={`h-9 w-9 rounded-full ${shimmerClass}`} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden px-4 py-5 md:px-6">
          <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col gap-5">
            <div className={`h-36 w-full rounded-[28px] ${shimmerClass}`} />
            <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-4">
                <div className={`h-64 w-full rounded-[24px] ${shimmerClass}`} />
                <div className={`h-48 w-full rounded-[24px] ${shimmerClass}`} />
              </div>
              <div className="space-y-4">
                <div className={`h-56 w-full rounded-[24px] ${shimmerClass}`} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className={`h-48 w-full rounded-[24px] ${shimmerClass}`} />
                  <div className={`h-48 w-full rounded-[24px] ${shimmerClass}`} />
                </div>
                <div className={`h-64 w-full rounded-[24px] ${shimmerClass}`} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border-subtle bg-white/55 px-6 py-3 text-center text-xs text-text-muted backdrop-blur">
          {message}
        </div>
      </main>
    </div>
  );
};

export default AppShellFallback;
