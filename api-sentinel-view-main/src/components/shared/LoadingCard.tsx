import React from 'react';

interface LoadingCardProps {
  count?: number;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({ count = 1 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-lg flex flex-col p-4 border border-border-subtle bg-bg-base animate-pulse"
      >
        <div className="h-2.5 w-20 rounded bg-muted mb-3" />
        <div className="h-7 w-16 rounded bg-muted mb-2" />
        <div className="h-2 w-24 rounded bg-muted/60" />
      </div>
    ))}
  </>
);

export default LoadingCard;
