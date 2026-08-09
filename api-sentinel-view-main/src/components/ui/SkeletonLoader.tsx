import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonLoaderProps {
  variant?: 'card' | 'chart' | 'table' | 'metric' | 'text' | 'list';
  className?: string;
  count?: number;
  /** Alias for `count`, used by table/list call sites; takes precedence when set. */
  rows?: number;
}

const SkeletonBar: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <div className={cn('animate-shimmer rounded', className)} style={style} />
);

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'card',
  className,
  count = 1,
  rows,
}) => {
  const items = Array.from({ length: rows ?? count });

  if (variant === 'list') {
    return (
      <div className={cn('space-y-2', className)}>
        {items.map((_, i) => (
          <div key={i} className="metric-card p-3 flex items-center gap-3">
            <SkeletonBar className="w-8 h-8 rounded-[2px] shrink-0" />
            <div className="flex-1 space-y-2">
              <SkeletonBar className="h-3 w-2/3 rounded-full" />
              <SkeletonBar className="h-2.5 w-1/3 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)}>
        {items.map((_, i) => (
          <SkeletonBar key={i} className="h-3 rounded-full" style={{ width: `${80 - i * 15}%` }} />
        ))}
      </div>
    );
  }

  if (variant === 'metric') {
    return (
      <div className={cn('flex gap-4', className)}>
        {items.map((_, i) => (
          <div key={i} className="metric-card p-4 flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <SkeletonBar className="w-9 h-9 rounded-lg" />
              <SkeletonBar className="h-3 w-20 rounded-full" />
            </div>
            <SkeletonBar className="h-7 w-24 rounded" />
            <SkeletonBar className="h-5 w-full rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn('metric-card p-4 space-y-4', className)}>
        <div className="flex justify-between items-center">
          <SkeletonBar className="h-4 w-32 rounded-full" />
          <SkeletonBar className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex items-end gap-1 h-32">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonBar
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${30 + Math.random() * 70}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn('metric-card overflow-hidden', className)}>
        <div className="p-3 flex gap-4 border-b border-border-subtle">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBar key={i} className="h-3 flex-1 rounded-full" />
          ))}
        </div>
        {items.map((_, i) => (
          <div key={i} className="p-3 flex gap-4 border-b border-border-subtle last:border-0">
            {Array.from({ length: 4 }).map((_, j) => (
              <SkeletonBar key={j} className="h-3 flex-1 rounded-full" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Default: card
  return (
    <div className={cn('space-y-4', className)}>
      {items.map((_, i) => (
        <div key={i} className="metric-card p-4 space-y-3">
          <SkeletonBar className="h-4 w-2/3 rounded-full" />
          <SkeletonBar className="h-3 w-full rounded-full" />
          <SkeletonBar className="h-3 w-4/5 rounded-full" />
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
