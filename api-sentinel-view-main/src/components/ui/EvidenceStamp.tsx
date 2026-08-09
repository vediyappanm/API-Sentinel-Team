import React from 'react';

/** The signature element: a rotated, bordered stamp — used for live status
 * and confirmed/clear/warn states. The one bold move in the evidence
 * system; everything else around it stays quiet. */
export const EvidenceStamp: React.FC<{
  children: React.ReactNode;
  tone?: 'signal' | 'ok' | 'warn';
  pulse?: boolean;
}> = ({ children, tone = 'signal', pulse = false }) => (
  <span className={`evd-stamp ${tone === 'ok' ? 'evd-stamp-ok' : tone === 'warn' ? 'evd-stamp-warn' : ''}`}>
    {pulse && <span className="evd-stamp-dot" />}
    {children}
  </span>
);

export default EvidenceStamp;
