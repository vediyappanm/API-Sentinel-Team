import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const LEGACY_PREFIXES: Array<{ from: string; to: string }> = [
  { from: '/organization', to: '/app/organization' },
  { from: '/dashboard', to: '/app/dashboard' },
  { from: '/discovery', to: '/app/discovery' },
  { from: '/testing', to: '/app/testing' },
  { from: '/protection', to: '/app/protection' },
  { from: '/reports', to: '/app/reports' },
  { from: '/intelligence', to: '/app/intelligence' },
  { from: '/live', to: '/app/live' },
  { from: '/alerts', to: '/app/alerts' },
  { from: '/blocklist', to: '/app/blocklist' },
  { from: '/onboarding', to: '/admin/onboarding' },
  { from: '/settings', to: '/admin/settings' },
  { from: '/system-health', to: '/admin/system-health' },
  { from: '/operations', to: '/admin/operations' },
  { from: '/add-application', to: '/admin/applications/add' },
];

const LegacyRouteRedirect: React.FC = () => {
  const location = useLocation();
  const target = LEGACY_PREFIXES.find((entry) => location.pathname === entry.from || location.pathname.startsWith(`${entry.from}/`));

  if (!target) {
    return <Navigate to="/" replace />;
  }

  const nextPath = location.pathname.replace(target.from, target.to);
  return <Navigate to={`${nextPath}${location.search}${location.hash}`} replace />;
};

export default LegacyRouteRedirect;
