import React from 'react';
import { Shield, AlertTriangle, Ban, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: 'request' | 'alert' | 'block' | 'response';
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  ip?: string;
}

interface AttackSequenceTimelineProps {
  events?: TimelineEvent[];
  actorIp?: string;
  isLoading?: boolean;
}

const AttackSequenceTimeline: React.FC<AttackSequenceTimelineProps> = ({
  events = [],
  actorIp,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <GlassCard variant="default" className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-bg-elevated rounded w-1/3" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-32 h-4 bg-bg-elevated rounded" />
              <div className="flex-1 h-12 bg-bg-elevated rounded" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle size={16} />;
      case 'block':
        return <Ban size={16} />;
      case 'response':
        return <CheckCircle size={16} />;
      default:
        return <Shield size={16} />;
    }
  };

  const getEventColor = (type: TimelineEvent['type'], severity?: TimelineEvent['severity']) => {
    if (severity === 'critical') return '#EF4444';
    if (severity === 'high') return '#F97316';
    if (severity === 'medium') return '#EAB308';
    if (severity === 'low') return '#22C55E';
    
    switch (type) {
      case 'alert':
        return '#EF4444';
      case 'block':
        return '#F97316';
      case 'response':
        return '#22C55E';
      default:
        return '#3B82F6';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <GlassCard variant="default" className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-bold text-text-primary">Attack Sequence Timeline</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            {actorIp ? `Threat actor: ${actorIp}` : 'Chronological view of events'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <Clock size={12} />
          <span>{sortedEvents.length} events</span>
        </div>
      </div>

      {sortedEvents.length === 0 ? (
        <div className="text-center py-12">
          <Shield size={48} className="mx-auto text-text-muted opacity-30" />
          <p className="text-sm text-text-secondary mt-4">No events in timeline</p>
          <p className="text-xs text-text-muted mt-1">Events will appear here as they occur</p>
        </div>
      ) : (
        <div className="space-y-0 relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border-subtle" />

          {sortedEvents.map((event, index) => {
            const color = getEventColor(event.type, event.severity);
            const isLast = index === sortedEvents.length - 1;

            return (
              <div key={event.id} className="flex gap-4 relative">
                {/* Time column */}
                <div className="w-20 text-right shrink-0">
                  <div className="text-[11px] font-mono text-text-muted">{formatTime(event.timestamp)}</div>
                  {!isLast && <div className="text-[10px] text-text-secondary">{formatDate(event.timestamp)}</div>}
                </div>

                {/* Timeline dot */}
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center bg-bg-surface z-10 relative"
                    style={{ borderColor: color, color }}
                  >
                    {getEventIcon(event.type)}
                  </div>
                  {!isLast && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-8 bottom-0 w-px"
                      style={{ backgroundColor: `${color}40` }}
                    />
                  )}
                </div>

                {/* Event content */}
                <div className="flex-1 pb-6">
                  <div
                    className="rounded-lg border p-3 transition-all hover:shadow-md"
                    style={{
                      borderColor: `${color}30`,
                      background: `${color}08`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                          style={{ color, background: `${color}15` }}
                        >
                          {event.type}
                        </span>
                        <h4 className="text-xs font-semibold text-text-primary">{event.title}</h4>
                      </div>
                      {event.severity && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase"
                          style={{
                            color: color,
                            background: `${color}10`,
                            border: `1px solid ${color}30`,
                          }}
                        >
                          {event.severity}
                        </span>
                      )}
                    </div>

                    {event.description && (
                      <p className="text-[11px] text-text-secondary mt-2">{event.description}</p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-[10px] text-text-muted">
                      {event.endpoint && (
                        <div className="flex items-center gap-1">
                          <span className="font-mono">{event.method}</span>
                          <span className="font-mono truncate max-w-[200px]">{event.endpoint}</span>
                        </div>
                      )}
                      {event.statusCode && (
                        <div
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            background: event.statusCode >= 400 ? '#EF444420' : '#22C55E20',
                            color: event.statusCode >= 400 ? '#EF4444' : '#22C55E',
                          }}
                        >
                          {event.statusCode}
                        </div>
                      )}
                      {event.ip && (
                        <div className="font-mono">{event.ip}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
};

export default AttackSequenceTimeline;
