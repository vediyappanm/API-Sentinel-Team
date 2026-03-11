import React from 'react';
import { GitBranch } from 'lucide-react';

const ApiSequenceFlow: React.FC = () => (
  <div className="rounded-lg border border-border-subtle bg-bg-surface p-8 text-center animate-fade-in">
    <GitBranch size={32} className="mx-auto mb-3 text-muted-foreground" />
    <h2 className="text-lg font-medium text-text-primary mb-2">API Sequence Flow</h2>
    <p className="text-sm text-muted-foreground mb-4">Visual flow diagram showing API call sequences and request chain visualization.</p>
    <p className="text-xs text-muted-foreground">Sequence data will appear here once API traffic is analyzed.</p>
  </div>
);

export default ApiSequenceFlow;
