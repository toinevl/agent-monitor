import { useState, useEffect, useRef } from 'react';
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
  const wsRef = useRef<WebSocket | null>(null);

  function applyState(data: StatePayload): void {
    setAgents(data.agents || []);
    setEdges(data.edges   || []);
    setLastUpdated(new Date(data.polledAt || data.pushedAt || Date.now()));
  }

  useEffect(() => {
    fetch(`${BACKEND_HTTP}/api/state`)
      .then(r => r.json())
      .then(applyState)
      .catch(console.error);

    fetch(`${BACKEND_HTTP}/api/instances`)
      .then(r => r.json())
      .then(setInstances)
      .catch(console.error);

    function connect(): void {
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;

      ws.onopen  = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
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
    return () => wsRef.current?.close();
  }, []);

  return { agents, edges, instances, setInstances, connected, lastUpdated };
}
