import React, { useState } from 'react';
import { Shield, Ban, FileText, Bell, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { post } from '@/lib/api-client';

interface ResponseActionsProps {
  actorIp?: string;
  eventId?: string;
  severity?: string;
  onActionComplete?: () => void;
}

const ResponseActions: React.FC<ResponseActionsProps> = ({
  actorIp,
  eventId,
  severity,
  onActionComplete,
}) => {
  const [action, setAction] = useState<'block' | 'ticket' | 'suppress' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleBlockIP = async () => {
    if (!actorIp) return;
    setLoading(true);
    setAction('block');
    
    try {
      await post(`/blocklist/`, {
        ip: actorIp,
        reason: `Blocked via security event ${eventId || 'manual'}`,
        expires_in_hours: 24,
      });
      
      toast({
        title: 'IP Blocked',
        description: `${actorIp} has been added to the blocklist`,
      });
      
      onActionComplete?.();
    } catch (error) {
      toast({
        title: 'Failed to Block IP',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleCreateTicket = async () => {
    setLoading(true);
    setAction('ticket');
    
    try {
      await post('/integrations/ticket', {
        event_id: eventId,
        severity,
        title: `Security Event: ${severity} - ${actorIp || 'Unknown'}`,
        description: `Automated ticket created from security event ${eventId}`,
      });
      
      toast({
        title: 'Ticket Created',
        description: 'Incident ticket has been created in Jira',
      });
      
      onActionComplete?.();
    } catch (error) {
      toast({
        title: 'Failed to Create Ticket',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  const handleSuppress = async () => {
    setLoading(true);
    setAction('suppress');
    
    try {
      await post('/alerts/suppress', {
        event_id: eventId,
        reason: 'Manual suppression',
      });
      
      toast({
        title: 'Alert Suppressed',
        description: 'Future similar alerts will be suppressed',
      });
      
      onActionComplete?.();
    } catch (error) {
      toast({
        title: 'Failed to Suppress',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  };

  return (
    <div className="flex gap-2 pt-4 border-t border-border-subtle">
      <button
        onClick={handleBlockIP}
        disabled={loading || !actorIp}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sev-critical/10 text-sev-critical hover:bg-sev-critical/20 transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {action === 'block' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Ban size={14} />
        )}
        Block IP
      </button>
      
      <button
        onClick={handleCreateTicket}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {action === 'ticket' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <FileText size={14} />
        )}
        Create Ticket
      </button>
      
      <button
        onClick={handleSuppress}
        disabled={loading}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle transition-all text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {action === 'suppress' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Bell size={14} />
        )}
        Suppress
      </button>
    </div>
  );
};

export default ResponseActions;
