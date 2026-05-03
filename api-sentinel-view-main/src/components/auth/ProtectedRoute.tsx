import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import type { UserRole, WorkspaceKey } from '@/lib/auth-context';
import AppShellFallback from '@/components/layout/AppShellFallback';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  workspace?: WorkspaceKey;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole, workspace, allowedRoles }) => {
  const { user, isLoading, role, canAccessWorkspace } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AppShellFallback variant="auth" message="Restoring your workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (workspace && !canAccessWorkspace(workspace)) {
    return <Navigate to="/access-restricted" state={{ from: location }} replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/access-restricted" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/access-restricted" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
