import React from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, LayoutDashboard, Radar, FlaskConical, ShieldCheck, BarChart2, Settings, Activity, MoreHorizontal, PlusCircle, BrainCircuit, LucideIcon, Radio, Bell, Ban } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  adminOnly?: boolean;
  live?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: Building2,     label: 'Org',       path: '/organization' },
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: Radio,         label: 'Live',      path: '/live', live: true },
  { icon: Bell,          label: 'Alerts',    path: '/alerts' },
  { icon: Radar,         label: 'Discovery', path: '/discovery' },
  { icon: FlaskConical,  label: 'Testing',   path: '/testing' },
  { icon: ShieldCheck,   label: 'Protection', path: '/protection' },
  { icon: Ban,           label: 'Blocklist', path: '/blocklist' },
  { icon: BarChart2,     label: 'Reports',   path: '/reports' },
  { icon: BrainCircuit,  label: 'Intel',     path: '/intelligence' },
  { icon: PlusCircle,    label: 'Add App',   path: '/add-application', adminOnly: true },
  { icon: MoreHorizontal, label: 'More',     path: '/operations', adminOnly: true },
];

const BOTTOM_ITEMS: NavItem[] = [
  { icon: Activity, label: 'Health', path: '/system-health', adminOnly: true },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

function getInitials(user: { login: string; name?: string } | null): string {
  if (!user) return '??';
  const name = user.name || user.login;
  const parts = name.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const initials = getInitials(user);

  const visibleNav = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const visibleBottom = BOTTOM_ITEMS.filter(item => !item.adminOnly || isAdmin);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    twMerge(clsx(
      'relative flex flex-col items-center justify-center w-full py-2.5 gap-1 cursor-pointer transition-all duration-150 outline-none group',
      isActive
        ? 'text-brand nav-active-bar'
        : 'text-text-muted hover:text-text-secondary'
    ));

  return (
    <nav
      className="flex flex-col items-center w-[72px] min-h-screen shrink-0 border-r border-border-subtle bg-bg-sidebar"
    >
      {/* Logo */}
      <div className="w-full flex flex-col items-center py-5 mb-1 border-b border-border-subtle">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-bg-elevated border border-brand/20">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L21 6.5V13C21 17.4 17 21.2 12 22C7 21.2 3 17.4 3 13V6.5L12 2Z" fill="#F97316" />
            <path d="M12 6L17 8.5V13C17 15.5 14.8 17.7 12 18.5C9.2 17.7 7 15.5 7 13V8.5L12 6Z" fill="#FFFFFF" />
          </svg>
        </div>
      </div>

      {/* Main Nav */}
      <div className="flex flex-col w-full px-1 flex-1 pt-2">
        {visibleNav.map(item => (
          <NavLink key={item.path} to={item.path} className={navClass} title={item.label}>
            {({ isActive }) => (
              <>
                <div className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 relative',
                  isActive ? 'bg-brand/10 text-brand' : 'group-hover:bg-bg-elevated text-text-muted'
                )}>
                  <item.icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
                  {item.live && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  )}
                </div>
                <span className={clsx(
                  'text-[9.5px] font-semibold tracking-tight',
                  isActive ? 'text-brand' : 'text-text-muted'
                )}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Bottom Nav */}
      <div className="flex flex-col w-full px-1 pb-4 border-t border-border-subtle pt-3">
        {visibleBottom.map(item => (
          <NavLink key={item.path} to={item.path} className={navClass} title={item.label}>
            {({ isActive }) => (
              <>
                <div className={clsx(
                  'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150',
                  isActive ? 'bg-brand/10 text-brand' : 'group-hover:bg-bg-elevated text-text-muted'
                )}>
                  <item.icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={clsx(
                  'text-[9.5px] font-semibold tracking-tight',
                  isActive ? 'text-brand' : 'text-text-muted'
                )}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        {/* Avatar */}
        <div className="mt-3 flex justify-center">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm bg-gradient-to-br from-brand to-brand-dark">
            {initials}
          </div>
        </div>
      </div>
    </nav>
  );
};
