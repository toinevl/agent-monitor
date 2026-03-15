import { useState, useEffect, useRef } from 'react';

// In production (same-origin), use relative URLs. In dev, use env vars.
const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');
const BACKEND_WS = import.meta.env.VITE_BACKEND_WS ||
  (import.meta.env.PROD
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    : 'ws://localhost:3001');

export function useAgentState() {
  const [agents, setAgents] = useState([]);
  const [edges,  setEdges]  = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const wsRef = useRef(null);

  function applyState(data) {
    setAgents(data.agents || []);
    setEdges(data.edges   || []);
    setLastUpdated(new Date(data.polledAt));
  }

  useEffect(() => {
    // Initial fetch via HTTP
    fetch(`${BACKEND_HTTP}/api/state`)
      .then(r => r.json())
      .then(applyState)
      .catch(console.error);

    // Live updates via WebSocket
    function connect() {
      const ws = new WebSocket(BACKEND_WS);
      wsRef.current = ws;

      ws.onopen  = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000); // auto-reconnect
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'state') applyState(msg.data);
        } catch {}
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, []);

  return { agents, edges, connected, lastUpdated };
}
