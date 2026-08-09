import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { buildWebSocketUrl, getToken } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const WS_URL = buildWebSocketUrl('/api/stream/live');
const RECONNECT_DELAY_MS = 3000;

/** Mirrors server/api/websocket/event_types.py WSEventType. */
type WSEventType =
  | 'VULNERABILITY_FOUND'
  | 'SCAN_STARTED'
  | 'SCAN_COMPLETED'
  | 'SCAN_PROGRESS'
  | 'THREAT_ACTOR_FLAGGED'
  | 'TRAFFIC_INGESTED'
  | 'IP_BLOCKED'
  | 'ENDPOINT_BLOCKED'
  | 'RATE_LIMITED'
  | 'INCIDENT_CREATED';

type RealtimeMessage = { type: WSEventType | 'log_entry'; data?: unknown };

/** Which top-level React Query key namespaces go stale when a given
 * server event arrives. Keeps every page's data live without polling. */
const INVALIDATION_MAP: Record<WSEventType, string[][]> = {
  VULNERABILITY_FOUND: [['dashboard'], ['testing'], ['security-ops'], ['protection']],
  SCAN_STARTED: [['testing'], ['security-ops']],
  SCAN_COMPLETED: [['testing'], ['security-ops'], ['dashboard']],
  SCAN_PROGRESS: [['testing'], ['security-ops']],
  THREAT_ACTOR_FLAGGED: [['dashboard'], ['protection'], ['live-feed']],
  TRAFFIC_INGESTED: [['dashboard'], ['discovery'], ['live-feed']],
  IP_BLOCKED: [['protection'], ['dashboard'], ['blocklist']],
  ENDPOINT_BLOCKED: [['protection'], ['discovery']],
  RATE_LIMITED: [['protection'], ['alerts']],
  INCIDENT_CREATED: [['alerts'], ['dashboard'], ['protection']],
};

function applyInvalidation(qc: QueryClient, type: string) {
  const keys = INVALIDATION_MAP[type as WSEventType];
  if (!keys) return;
  for (const queryKey of keys) qc.invalidateQueries({ queryKey });
}

interface RealtimeContextValue {
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false });

/** Mounts once at the app shell: owns the single `/api/stream/live` socket
 * and turns server push events into React Query invalidations, so every
 * page reflects new data within one round trip instead of on a poll timer. */
export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAuthenticated = user !== null;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setConnected(false);
      return;
    }
    stoppedRef.current = false;

    const connect = () => {
      if (stoppedRef.current) return;
      const token = getToken();
      const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        try {
          const msg: RealtimeMessage = JSON.parse(ev.data);
          applyInvalidation(queryClient, msg.type);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (!stoppedRef.current) reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      stoppedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isAuthenticated, queryClient]);

  return React.createElement(RealtimeContext.Provider, { value: { connected } }, children);
};

/** Live-connection status for status badges (e.g. the Dashboard's stamp). */
export function useRealtimeStatus(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
