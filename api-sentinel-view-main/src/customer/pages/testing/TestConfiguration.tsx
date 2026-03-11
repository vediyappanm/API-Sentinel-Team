import React from 'react';
import { Settings } from 'lucide-react';

const TestConfiguration: React.FC = () => (
  <div className="space-y-4 animate-fade-in">
    <div className="rounded-lg border border-border-subtle bg-bg-base p-8 text-center">
      <Settings size={32} className="mx-auto mb-3 text-muted-foreground" />
      <h2 className="text-sm font-medium text-text-primary mb-2">Scan Configuration</h2>
      <p className="text-sm text-muted-foreground">Configure scan scope, authentication, scheduling, and notification preferences.</p>
      <p className="text-xs text-muted-foreground mt-4">Configuration options will appear here once the testing module is active.</p>
    </div>
  </div>
);

export default TestConfiguration;
