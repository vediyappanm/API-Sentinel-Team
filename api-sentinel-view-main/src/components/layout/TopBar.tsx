import React, { useState } from 'react';
import { ChevronRight, Bell, Search, ChevronDown, RefreshCw, Wifi, LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useApiCollections } from '@/hooks/use-discovery';

const PAGE_LABELS: Record<string, string> = {
  organization: 'Organization',
  dashboard: 'Dashboard',
  discovery: 'Discovery',
  testing: 'Testing',
  protection: 'Protection',
  reports: 'Reports',
  intelligence: 'Intel',
  settings: 'Settings',
  'system-health': 'System Health',
  operations: 'Operations',
  'add-application': 'Add Application',
};

function getInitials(user: { login: string; name?: string } | null): string {
  if (!user) return '??';
  const name = user.name || user.login;
  const parts = name.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const TopBar: React.FC = () => {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { data: collectionsData } = useApiCollections();
  const collections = collectionsData?.apiCollections ?? [];

  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentPage = PAGE_LABELS[pathParts[0]] || 'Dashboard';
  const subPage = pathParts[1]
    ? pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1).replace(/-/g, ' ')
    : null;

  const appNames = collections.map(c => c.displayName || c.hostName).filter(Boolean);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const activeApp = selectedApp || appNames[0] || 'Default Inventory';
  const [appOpen, setAppOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hasNotif] = useState(true);

  const initials = getInitials(user);
  const displayName = user?.name || user?.login?.split('@')[0] || 'User';
  const roleLabel = isAdmin ? 'Admin' : 'Member';

  return (
    <div className="flex items-center justify-between px-5 py-2 border-b shrink-0 bg-bg-base border-border-subtle" style={{ minHeight: 44 }}>

      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            onClick={() => setAppOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors outline-none"
          >
            <div className="w-5 h-5 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center">
              <div className="w-2 h-2 rounded-sm bg-brand" />
            </div>
            {activeApp}
            <ChevronDown size={11} className={`transition-transform text-muted-foreground ${appOpen ? 'rotate-180' : ''}`} />
          </button>
          {appOpen && (
            <div className="absolute left-0 top-full mt-1 w-52 rounded-lg border border-border-subtle shadow-xl backdrop-blur-md z-50 py-1 max-h-60 overflow-y-auto bg-bg-elevated">
              {appNames.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">No applications found</div>
              )}
              {appNames.map(app => (
                <button key={app} onClick={() => { setSelectedApp(app); setAppOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-bg-hover ${app === activeApp ? 'text-brand font-semibold' : 'text-text-secondary'}`}>
                  {app}
                </button>
              ))}
            </div>
          )}
        </div>

        <ChevronRight size={12} className="text-muted-foreground" />
        <span className="text-xs font-medium text-text-secondary">{currentPage}</span>
        {subPage && (
          <>
            <ChevronRight size={12} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-text-primary">
              {pathParts[1] === 'api-catalogue' ? 'API Catalogue' :
                pathParts[1] === 'api-governance' ? 'API Governance' : subPage}
            </span>
          </>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5">
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-[11px] text-green-500 font-medium">
          <Wifi size={10} />
          <span>Live</span>
        </div>

        <button className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-elevated flex items-center justify-center text-muted-foreground hover:text-text-primary transition-all outline-none">
          <Search size={13} />
        </button>

        <button className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-elevated flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} />
        </button>

        <button className="relative w-7 h-7 rounded-lg border border-border-subtle bg-bg-elevated flex items-center justify-center text-muted-foreground hover:text-text-primary transition-all outline-none">
          <Bell size={13} />
          {hasNotif && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand" />
          )}
        </button>

        <div className="w-px h-4 bg-border-subtle mx-0.5" />

        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-bg-elevated transition-colors outline-none"
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm bg-gradient-to-br from-brand to-brand-dark">
              {initials}
            </div>
            <span className="hidden md:block text-xs font-medium text-text-secondary">{roleLabel}</span>
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border-subtle shadow-xl backdrop-blur-md z-50 py-1 bg-bg-elevated">
              <div className="px-3 py-2 border-b border-border-subtle">
                <div className="text-xs font-semibold text-text-primary">{displayName}</div>
                <div className="text-[10px] text-text-muted">{user?.login}</div>
                <div className="mt-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-brand border border-brand/20 bg-brand/10">
                  {roleLabel}
                </div>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); logout(); }}
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-2"
              >
                <LogOut size={12} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
