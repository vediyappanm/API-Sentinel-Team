import React from 'react';

import WorkspaceLayout from '@/components/layout/WorkspaceLayout';
import { customerWorkspace } from '@/components/layout/workspaces';

const CustomerLayout: React.FC = () => (
  <WorkspaceLayout workspace={customerWorkspace} />
);

export default CustomerLayout;
