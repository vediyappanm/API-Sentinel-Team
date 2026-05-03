import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '@/lib/auth-context';
import StatusPulse from '@/components/ui/StatusPulse';
import { useLayout } from '@/components/layout/layout-context';
import { useMediaQuery } from '@/hooks/use-media-query';
import type { WorkspaceConfig } from '@/components/layout/workspaces';

function getInitials(user: { login: string; name?: string } | null): string {
  if (!user) return '??';
  const name = user.name || user.login;
  const parts = name.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const Sidebar: React.FC<{ workspace: WorkspaceConfig }> = ({ workspace }) => {
  const { user } = useAuth();
  const { isSidebarCollapsed, isMobileSidebarOpen, toggleSidebar, closeMobileSidebar } = useLayout();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const initials = getInitials(user);
  const collapsed = isDesktop ? isSidebarCollapsed : false;
  const location = useLocation();

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    if (!isDesktop && isMobileSidebarOpen) {
      closeMobileSidebar();
    }
  }, [location.pathname]);

  const visibleNav = workspace.navItems;
  const visibleBottom = workspace.bottomItems;

  const desktopWidth = collapsed ? 'lg:w-[84px]' : 'lg:w-[228px]';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    twMerge(clsx(
      'relative flex items-center gap-3 w-full cursor-pointer transition-all duration-200 outline-none group rounded-lg mx-1',
      collapsed ? 'flex-col justify-center py-2.5 px-0' : 'py-2 px-3',
      isActive
        ? 'text-brand nav-active-bar'
        : 'text-text-muted hover:text-text-secondary hover:bg-black/[0.03]'
    ));

  // Group items by section for expanded mode
  let lastSection = '';

  const handleItemClick = () => {
    if (!isDesktop) {
      closeMobileSidebar();
    }
  };

  return (
    <>
      {isMobileSidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      <nav
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex min-h-screen w-[85vw] max-w-[280px] shrink-0 -translate-x-full flex-col border-r border-border-subtle transition-all duration-300 ease-in-out lg:static lg:z-10 lg:translate-x-0',
          desktopWidth,
          isMobileSidebarOpen && 'translate-x-0'
        )}
        style={{
          background: 'linear-gradient(180deg, #F4F4F8 0%, #F0F0F5 50%, #F4F4F8 100%)',
        }}
      >
      {/* Logo */}
      <div className="w-full border-b border-border-subtle px-3 py-4">
        <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'justify-between gap-3')}>
          <div className={clsx('flex items-center gap-3', collapsed && 'justify-center')}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-bg-elevated border border-brand/20 relative shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L21 6.5V13C21 17.4 17 21.2 12 22C7 21.2 3 17.4 3 13V6.5L12 2Z" fill="#632CA6" />
                <path d="M12 6L17 8.5V13C17 15.5 14.8 17.7 12 18.5C9.2 17.7 7 15.5 7 13V8.5L12 6Z" fill="#FFFFFF" />
              </svg>
              <div className="absolute -inset-1 rounded-xl border border-brand/10 animate-pulse pointer-events-none" style={{ animationDuration: '3s' }} />
            </div>
            {!collapsed && (
              <div className="animate-fade-in min-w-0">
                <div className="text-sm font-bold text-text-primary leading-none">API Sentinel</div>
                <div className="text-[11px] text-text-muted mt-0.5">{workspace.label}</div>
              </div>
            )}
          </div>

          {!isDesktop && (
            <button
              onClick={closeMobileSidebar}
              className="w-9 h-9 rounded-xl border border-border-subtle bg-bg-elevated flex items-center justify-center text-text-muted hover:text-brand hover:border-brand/30 transition-all"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-[68px] hidden h-6 w-6 rounded-full bg-bg-elevated border border-border-subtle items-center justify-center text-text-muted hover:text-brand hover:border-brand/30 transition-all z-20 shadow-md lg:flex"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* Main Nav */}
      <div className="flex flex-col w-full flex-1 pt-2 overflow-y-auto no-scrollbar">
        {visibleNav.map((item) => {
          const showSection = !collapsed && item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;

          return (
            <React.Fragment key={item.path}>
              {showSection && (
                <div className="px-4 pt-4 pb-1.5">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.12em]">
                    {item.section}
                  </span>
                </div>
              )}
              <NavLink
                to={item.path}
                className={navClass}
                title={collapsed ? item.label : undefined}
                onClick={handleItemClick}
              >
                {({ isActive }) => (
                  <>
                    <div className={clsx(
                      'rounded-lg flex items-center justify-center transition-all duration-200 relative shrink-0',
                      collapsed ? 'w-10 h-10' : 'w-8 h-8',
                      isActive
                        ? 'bg-brand/10 text-brand shadow-[0_0_12px_rgba(99,44,175,0.1)]'
                        : 'group-hover:bg-black/[0.04] text-text-muted'
                    )}>
                      <item.icon size={collapsed ? 19 : 17} strokeWidth={isActive ? 2.2 : 1.8} />
                      {item.live && (
                        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-green-400">
                          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
                        </span>
                      )}
                    </div>
                    {collapsed ? (
                      <span className={clsx(
                        'text-[10px] font-semibold tracking-tight leading-none',
                        isActive ? 'text-brand' : 'text-text-muted'
                      )}>{item.label.length > 8 ? item.label.slice(0, 7) + '...' : item.label}</span>
                    ) : (
                      <span className={clsx(
                        'text-[13px] font-medium truncate animate-fade-in',
                        isActive ? 'text-brand' : 'text-text-secondary'
                      )}>{item.label}</span>
                    )}
                  </>
                )}
              </NavLink>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom Nav */}
      <div className="flex flex-col w-full pb-4 border-t border-border-subtle pt-3">
        {/* System status */}
        <div className={clsx('flex items-center px-3 mb-2', collapsed ? 'justify-center' : 'gap-2')}>
          <StatusPulse variant="online" size="sm" />
          {!collapsed && (
            <span className="text-[11px] text-green-600 animate-fade-in">{workspace.badge} Workspace</span>
          )}
        </div>

        {visibleBottom.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={navClass}
            title={collapsed ? item.label : undefined}
            onClick={handleItemClick}
          >
            {({ isActive }) => (
              <>
                <div className={clsx(
                  'rounded-lg flex items-center justify-center transition-all duration-200 shrink-0',
                  collapsed ? 'w-10 h-10' : 'w-8 h-8',
                  isActive ? 'bg-brand/10 text-brand' : 'group-hover:bg-black/[0.04] text-text-muted'
                )}>
                  <item.icon size={collapsed ? 19 : 17} strokeWidth={isActive ? 2.2 : 1.8} />
                </div>
                {collapsed ? (
                  <span className={clsx(
                    'text-[10px] font-semibold tracking-tight',
                    isActive ? 'text-brand' : 'text-text-muted'
                  )}>{item.label}</span>
                ) : (
                  <span className={clsx(
                    'text-[13px] font-medium animate-fade-in',
                    isActive ? 'text-brand' : 'text-text-secondary'
                  )}>{item.label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Avatar */}
        <div className={clsx('mt-3 flex px-3', collapsed ? 'justify-center' : 'items-center gap-2.5')}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-md bg-gradient-to-br from-brand to-brand-dark shrink-0 ring-2 ring-brand/20">
            {initials}
          </div>
          {!collapsed && user && (
            <div className="animate-fade-in min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">
                {user.name || user.login?.split('@')[0]}
              </div>
              <div className="text-[11px] text-text-muted truncate">{user.login}</div>
            </div>
          )}
        </div>
      </div>
      </nav>
    </>
  );
};
