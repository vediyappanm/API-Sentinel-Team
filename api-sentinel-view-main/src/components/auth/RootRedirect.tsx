import React from 'react';
import { Navigate } from 'react-router-dom';

import AppShellFallback from '@/components/layout/AppShellFallback';
import { useAuth } from '@/lib/auth-context';
import { useOnboarding } from '@/lib/onboarding-context';

const RootRedirect: React.FC = () => {
  const { isLoading, user, canAccessPlatformWorkspace, canAccessAdminWorkspace, canAccessCustomerWorkspace } = useAuth();
  const onboarding = useOnboarding();

  if (isLoading) {
    return <AppShellFallback variant="auth" message="Routing to the right workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (canAccessPlatformWorkspace) {
    return <Navigate to="/platform/overview" replace />;
  }

  if (canAccessAdminWorkspace && !onboarding.data.completed) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  if (canAccessCustomerWorkspace) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <Navigate to="/access-restricted" replace />;
};

export default RootRedirect;
