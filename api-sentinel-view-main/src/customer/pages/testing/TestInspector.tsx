import React from 'react';

const TestInspector: React.FC = () => (
  <div className="space-y-4 animate-fade-in">
    <div className="rounded-lg border border-border-subtle bg-bg-base p-6 text-center">
      <h2 className="text-sm font-medium text-text-primary mb-2">Test Inspector</h2>
      <p className="text-[13px] text-muted-foreground leading-relaxed">Select a vulnerability from the Vulnerabilities tab to view detailed request/response data, proof of concept, and remediation guidance.</p>
    </div>
  </div>
);

export default TestInspector;
