import React from 'react';

import WorkspaceLayout from '@/components/layout/WorkspaceLayout';
import { adminWorkspace } from '@/components/layout/workspaces';

const AdminLayout: React.FC = () => (
  <WorkspaceLayout workspace={adminWorkspace} />
);

export default AdminLayout;
