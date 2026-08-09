import React from 'react';

/** Report-style section header: a monospace section code + title + hairline
 * rule, in place of the soft pill badges used elsewhere. Pass `action`
 * (e.g. a "view all" link) OR `desc` (a trailing note) — both float right;
 * combine them yourself in a wrapping flex row if you need both at once. */
export const EvidenceSectionHead: React.FC<{
  code: string;
  title: string;
  desc?: string;
  action?: React.ReactNode;
}> = ({ code, title, desc, action }) => (
  <div className="evd-section-head">
    <span className="evd-section-code">{code}</span>
    <h2 className="evd-section-title">{title}</h2>
    {desc && <span className="evd-section-desc evd-mono">{desc}</span>}
    {action && <span className="ml-auto">{action}</span>}
  </div>
);

export default EvidenceSectionHead;
