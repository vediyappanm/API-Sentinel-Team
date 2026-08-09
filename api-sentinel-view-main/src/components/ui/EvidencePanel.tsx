import React from 'react';
import { cn } from '@/lib/utils';

/** An "exhibit" panel — flat, hairline-bordered, numbered in its corner like a
 * case-file exhibit tag. The evidence-system replacement for GlassCard. Only
 * takes effect inside the customer workspace (.evd-root); renders as a plain
 * div with no visual effect elsewhere. */
export const EvidencePanel: React.FC<{
  exhibit?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ exhibit, className, style, children }) => (
  <div className={cn('evd-panel', className)} data-exhibit={exhibit} style={style}>
    {children}
  </div>
);

export default EvidencePanel;
