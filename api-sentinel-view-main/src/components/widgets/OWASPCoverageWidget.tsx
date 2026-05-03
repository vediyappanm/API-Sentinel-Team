import React from 'react';
import { OWASP_TOP_10, type OWASPCoverage } from '@/lib/owasp';
import GlassCard from '@/components/ui/GlassCard';

interface OWASPCoverageWidgetProps {
  coverage?: OWASPCoverage[];
  isLoading?: boolean;
}

const OWASPCoverageWidget: React.FC<OWASPCoverageWidgetProps> = ({ 
  coverage = [], 
  isLoading = false 
}) => {
  if (isLoading) {
    return (
      <GlassCard variant="default" className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-bg-elevated rounded w-1/3" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 bg-bg-elevated rounded w-1/4" />
              <div className="h-2 bg-bg-elevated rounded w-full" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  const sortedCoverage = [...coverage].sort((a, b) => b.coverage - a.coverage);
  const avgCoverage = coverage.length > 0 
    ? Math.round(coverage.reduce((sum, c) => sum + c.coverage, 0) / coverage.length) 
    : 0;

  return (
    <GlassCard variant="default" className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-text-primary">OWASP API Top 10 Coverage</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Average coverage: <span className="font-bold text-brand">{avgCoverage}%</span>
          </p>
        </div>
        <div className="text-2xl">🛡️</div>
      </div>

      <div className="space-y-2.5">
        {sortedCoverage.map((cat) => {
          const owaspCat = OWASP_TOP_10.find(c => c.id === cat.categoryId);
          const coverageColor = cat.coverage >= 80 ? '#22C55E' : cat.coverage >= 50 ? '#EAB308' : '#EF4444';
          
          return (
            <div key={cat.categoryId} className="space-y-1">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{owaspCat?.icon}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-text-secondary">{cat.categoryId}</p>
                    <p className="text-[10px] text-text-muted hidden sm:block">{owaspCat?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span 
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: coverageColor }}
                  >
                    {cat.coverage}%
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {cat.detected} / {cat.total}
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ 
                    width: `${cat.coverage}%`,
                    background: `linear-gradient(90deg, ${coverageColor}, ${coverageColor}DD)`,
                  }}
                />
              </div>
            </div>
          );
        })}
        
        {sortedCoverage.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-text-muted">No OWASP coverage data available</p>
            <p className="text-[11px] text-text-secondary mt-1">
              Run security tests to see coverage metrics
            </p>
          </div>
        )}
      </div>
    </GlassCard>
  );
};

export default OWASPCoverageWidget;
