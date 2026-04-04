import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './AgentNode';

const nodeTypes = { agent: AgentNode };

const base = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

// ── Graph layout helpers (mirrors App.jsx) ──────────────────────────────────

const NODE_WIDTH  = 200;
const NODE_HEIGHT = 90;
const H_GAP = 40;
const V_GAP = 120;

function rowLayout(agents, y) {
  const total = agents.length;
  const rowWidth = total * NODE_WIDTH + (total - 1) * H_GAP;
  return agents.map((agent, idx) => ({
    id:       agent.id,
    type:     'agent',
    position: {
      x: -rowWidth / 2 + idx * (NODE_WIDTH + H_GAP),
      y,
    },
    data: { ...agent },
  }));
}

function buildNodes(agents) {
  const orchestrators = agents.filter(a => a.type === 'orchestrator');
  const investigators = agents.filter(a => a.type === 'investigator');
  const workers       = agents.filter(a => a.type === 'worker');

  const rows = [];
  let y = 0;

  if (orchestrators.length) {
    rows.push(...rowLayout(orchestrators, y));
    y += NODE_HEIGHT + V_GAP;
  }
  if (investigators.length) {
    rows.push(...rowLayout(investigators, y));
    y += NODE_HEIGHT + V_GAP;
  }
  if (workers.length) {
    rows.push(...rowLayout(workers, y));
  }

  return rows;
}

function buildEdges(edges) {
  return edges.map(e => ({
    ...e,
    animated: true,
    style:      { stroke: '#334155', strokeWidth: 2 },
    labelStyle: { fill: '#64748b', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' },
  }));
}

// ── Small UI helpers ────────────────────────────────────────────────────────

function CtrlBtn({ onClick, title, children, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        color: disabled ? '#334155' : '#94a3b8',
        borderRadius: 6,
        padding: '4px 10px',
        fontSize: 16,
        cursor: disabled ? 'not-allowed' : 'pointer',
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SessionReplay() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [snapshots, setSnapshots] = useState(null); // null = not yet loaded
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cursor, setCursor] = useState(0);       // index into snapshots[]
  const [playing, setPlaying] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const timerRef = useRef(null);

  // ── Apply snapshot at cursor ─────────────────────────────────────────────

  useEffect(() => {
    if (!snapshots || snapshots.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const snap = snapshots[cursor];
    // Snapshots from JSON fallback store state directly; Azure wraps in `.state`
    const state = snap.state || snap;
    const agents = state.agents || [];
    const rawEdges = state.edges || [];

    setNodes(buildNodes(agents));
    setEdges(buildEdges(rawEdges));
  }, [snapshots, cursor]);

  // ── Auto-play timer ──────────────────────────────────────────────────────

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setCursor(c => {
          const next = c + 1;
          if (!snapshots || next >= snapshots.length) {
            setPlaying(false);
            return c;
          }
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, snapshots]);

  // ── Fetch history ────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setCursor(0);
    setSnapshots(null);

    try {
      const res = await fetch(`${base}/api/sessions/history?start=${date}&end=${date}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      // API returns { snapshots: [...] }
      const snaps = Array.isArray(data.snapshots) ? data.snapshots : [];
      // Sort oldest → newest so scrubbing left-to-right is chronological
      snaps.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setSnapshots(snaps);
    } catch (err) {
      setError(err.message);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  // ── Playback controls ────────────────────────────────────────────────────

  const goFirst = () => { setPlaying(false); setCursor(0); };
  const goPrev  = () => { setPlaying(false); setCursor(c => Math.max(0, c - 1)); };
  const goNext  = () => {
    setPlaying(false);
    setCursor(c => Math.min((snapshots?.length ?? 1) - 1, c + 1));
  };
  const goLast  = () => {
    setPlaying(false);
    setCursor((snapshots?.length ?? 1) - 1);
  };
  const togglePlay = () => setPlaying(p => !p);

  // ── Derived display values ───────────────────────────────────────────────

  const hasSnapshots = snapshots !== null && snapshots.length > 0;
  const currentSnap  = hasSnapshots ? snapshots[cursor] : null;
  const timestampStr = currentSnap
    ? new Date(currentSnap.timestamp).toLocaleString()
    : '';

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#020617',
      color: '#f1f5f9',
      overflow: 'hidden',
    }}>
      {/* Controls bar */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        {/* Date picker */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
          Date
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#f1f5f9',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          />
        </label>

        {/* Load button */}
        <button
          onClick={loadHistory}
          disabled={loading || !date}
          style={{
            background: '#1e40af',
            border: '1px solid #2563eb',
            color: loading ? '#475569' : '#bfdbfe',
            borderRadius: 6,
            padding: '5px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Load'}
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Playback controls — only shown when snapshots are loaded */}
        {hasSnapshots && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CtrlBtn onClick={goFirst} title="First" disabled={cursor === 0}>⏮</CtrlBtn>
            <CtrlBtn onClick={goPrev}  title="Previous" disabled={cursor === 0}>⏪</CtrlBtn>
            <CtrlBtn onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : '▶'}
            </CtrlBtn>
            <CtrlBtn onClick={goNext} title="Next" disabled={cursor === snapshots.length - 1}>⏩</CtrlBtn>
            <CtrlBtn onClick={goLast} title="Last"  disabled={cursor === snapshots.length - 1}>⏭</CtrlBtn>

            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>
              {cursor + 1} / {snapshots.length}
            </span>
          </div>
        )}

        {/* Timestamp */}
        {timestampStr && (
          <span style={{ fontSize: 12, color: '#475569' }}>{timestampStr}</span>
        )}
      </div>

      {/* Scrubber */}
      {hasSnapshots && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b' }}>
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={cursor}
            onChange={e => {
              setPlaying(false);
              setCursor(Number(e.target.value));
            }}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
          />
        </div>
      )}

      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Not yet loaded */}
        {snapshots === null && !loading && !error && (
          <EmptyState icon="🎬" message="Select a date and click Load to replay session history" />
        )}

        {/* Loading */}
        {loading && (
          <EmptyState icon="⏳" message="Loading snapshots…" />
        )}

        {/* Error */}
        {error && (
          <EmptyState icon="⚠️" message={`Error: ${error}`} color="#f87171" />
        )}

        {/* Empty result */}
        {!loading && snapshots !== null && snapshots.length === 0 && !error && (
          <EmptyState icon="📭" message="No snapshots found for this date" />
        )}

        {/* ReactFlow graph */}
        {hasSnapshots && (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
          >
            <Background color="#1e293b" gap={24} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, message, color = '#334155' }) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 12,
      color,
    }}>
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  );
}
