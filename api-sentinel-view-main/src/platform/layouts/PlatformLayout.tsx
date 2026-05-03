import React from 'react';

import WorkspaceLayout from '@/components/layout/WorkspaceLayout';
import { platformWorkspace } from '@/components/layout/workspaces';

const PlatformLayout: React.FC = () => (
  <WorkspaceLayout workspace={platformWorkspace} />
);

export default PlatformLayout;
