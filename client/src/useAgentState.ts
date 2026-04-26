import { useState, useEffect, useRef, useCallback } from 'react';
import type { Agent, Edge } from './mockData';

export interface Instance {
  instanceId: string;
  label?: string;
  online: boolean;
  activeSessions: number;
  agents?: Agent[];
  model?: string;
  lastSeen?: number;
}

interface StatePayload {
  agents?: Agent[];
  edges?: Edge[];
  polledAt?: number;
  pushedAt?: number;
}

interface WsMessage {
  type: string;
  data?: StatePayload | Instance[];
}

interface AgentStateResult {
  agents: Agent[];
  edges: Edge[];
  instances: Instance[];
  setInstances: React.Dispatch<React.SetStateAction<Instance[]>>;
  connected: boolean;
  lastUpdated: Date | null;
  backendError: string | null;
  refreshInstances: () => Promise<void>;
}

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');
const BACKEND_WS = import.meta.env.VITE_BACKEND_WS ||
  (import.meta.env.PROD
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    : 'ws://localhost:3001');

export function useAgentState(): AgentStateResult {
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [edges, setEdges]         = useState<Edge[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const refreshInterval = useRef<number | null>(null);

  const applyState = useCallback((data: StatePayload): void => {
    setAgents(data.agents || []);
    setEdges(data.edges   || []);
    setLastUpdated(new Date(data.polledAt || data.pushedAt || Date.now()));
  }, []);

  const fetchInstances = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/instances`);
      if (!res.ok) throw new Error(`Instances fetch failed (${res.status})`);
      const data = await res.json();
      setInstances(data);
      setBackendError(null);
    } catch (err) {
      console.error('[fetch] Failed to load instances:', err);
      setBackendError('Failed to refresh instance list');
    }
  }, []);

  const fetchState = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/state`);
      if (!res.ok) throw new Error(`State fetch failed (${res.status})`);
      const data = await res.json();
      applyState(data);
      setBackendError(null);
    } catch (err) {
      console.error('[fetch] Failed to load state:', err);
      setBackendError('Failed to refresh backend state');
    }
  }, [applyState]);

  useEffect(() => {
    fetchState();
    fetchInstances();

    function connect(): void {
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setBackendError(null);
        fetchState();
        fetchInstances();
      };

      ws.onclose = () => {
        setConnected(false);
        if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setBackendError('WebSocket connection failed');
        ws.close();
      };

      ws.onmessage = (evt: MessageEvent) => {
        try {
          const msg: WsMessage = JSON.parse(evt.data as string);
          if (!msg || typeof msg.type !== 'string') return;
          if (msg.type === 'state' && msg.data && typeof msg.data === 'object') {
            applyState(msg.data as StatePayload);
          }
          if (msg.type === 'instances' && Array.isArray(msg.data)) {
            setInstances(msg.data as Instance[]);
          }
        } catch (err) {
          console.error('[ws] Failed to handle message:', err);
        }
      };
    }

    connect();

    refreshInterval.current = window.setInterval(() => {
      fetchInstances();
    }, 60000);

    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      if (refreshInterval.current) window.clearInterval(refreshInterval.current);
    };
  }, [fetchInstances, fetchState]);

  return {
    agents,
    edges,
    instances,
    setInstances,
    connected,
    lastUpdated,
    backendError,
    refreshInstances: fetchInstances,
  };
}
