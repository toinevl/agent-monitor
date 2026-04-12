import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Node, Edge as FlowEdge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AgentNode from './AgentNode';
import type { Agent, Edge } from './mockData';

const nodeTypes = { agent: AgentNode };

const base = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

const NODE_WIDTH  = 200;
const NODE_HEIGHT = 90;
const H_GAP = 40;
const V_GAP = 120;

function rowLayout(agents: Agent[], y: number): Node[] {
  const total = agents.length;
  const rowWidth = total * NODE_WIDTH + (total - 1) * H_GAP;
  return agents.map((agent, idx) => ({
    id:   agent.id,
    type: 'agent',
    position: { x: -rowWidth / 2 + idx * (NODE_WIDTH + H_GAP), y },
    data: { ...agent },
  }));
}

function buildNodes(agents: Agent[]): Node[] {
  const orchestrators = agents.filter(a => a.type === 'orchestrator');
  const investigators = agents.filter(a => a.type === 'investigator');
  const workers       = agents.filter(a => a.type === 'worker');
  const rows: Node[] = [];
  let y = 0;
  if (orchestrators.length) { rows.push(...rowLayout(orchestrators, y)); y += NODE_HEIGHT + V_GAP; }
  if (investigators.length) { rows.push(...rowLayout(investigators, y)); y += NODE_HEIGHT + V_GAP; }
  if (workers.length) rows.push(...rowLayout(workers, y));
  return rows;
}

function buildEdges(edges: Edge[]): FlowEdge[] {
  return edges.map(e => ({
    ...e,
    animated: true,
    style:      { stroke: '#334155', strokeWidth: 2 },
    labelStyle: { fill: '#64748b', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' },
  }));
}

interface CtrlBtnProps {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function CtrlBtn({ onClick, title, children, disabled }: CtrlBtnProps): JSX.Element {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      background: '#1e293b', border: '1px solid #334155',
      color: disabled ? '#334155' : '#94a3b8',
      borderRadius: 6, padding: '4px 10px', fontSize: 16,
      cursor: disabled ? 'not-allowed' : 'pointer', lineHeight: 1,
    }}>
      {children}
    </button>
  );
}

interface SnapshotState {
  agents?: Agent[];
  edges?: Edge[];
}

interface Snapshot {
  timestamp: number;
  state?: SnapshotState;
  agents?: Agent[];
  edges?: Edge[];
}

interface EmptyStateProps {
  icon: string;
  message: string;
  color?: string;
}

function EmptyState({ icon, message, color = '#334155' }: EmptyStateProps): JSX.Element {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color }}>
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  );
}

export default function SessionReplay(): JSX.Element {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate]         = useState<string>(today);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading]   = useState<boolean>(false);
  const [error, setError]       = useState<string | null>(null);
  const [cursor, setCursor]     = useState<number>(0);
  const [playing, setPlaying]   = useState<boolean>(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!snapshots || snapshots.length === 0) { setNodes([]); setEdges([]); return; }
    const snap  = snapshots[cursor];
    const state = snap.state || snap;
    setNodes(buildNodes(state.agents || []));
    setEdges(buildEdges(state.edges  || []));
  }, [snapshots, cursor]);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setCursor(c => {
          const next = c + 1;
          if (!snapshots || next >= snapshots.length) { setPlaying(false); return c; }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, snapshots]);

  const loadHistory = useCallback(async (): Promise<void> => {
    setLoading(true); setError(null); setPlaying(false); setCursor(0); setSnapshots(null);
    try {
      const res = await fetch(`${base}/api/sessions/history?start=${date}&end=${date}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const snaps: Snapshot[] = Array.isArray(data.snapshots) ? data.snapshots : [];
      snaps.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setSnapshots(snaps);
    } catch (err) {
      setError((err as Error).message);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const goFirst  = (): void => { setPlaying(false); setCursor(0); };
  const goPrev   = (): void => { setPlaying(false); setCursor(c => Math.max(0, c - 1)); };
  const goNext   = (): void => { setPlaying(false); setCursor(c => Math.min((snapshots?.length ?? 1) - 1, c + 1)); };
  const goLast   = (): void => { setPlaying(false); setCursor((snapshots?.length ?? 1) - 1); };
  const togglePlay = (): void => setPlaying(p => !p);

  const hasSnapshots = snapshots !== null && snapshots.length > 0;
  const currentSnap  = hasSnapshots ? snapshots[cursor] : null;
  const timestampStr = currentSnap ? new Date(currentSnap.timestamp).toLocaleString() : '';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#020617', color: '#f1f5f9', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{
            background: '#0f172a', border: '1px solid #334155', color: '#f1f5f9',
            borderRadius: 6, padding: '4px 8px', fontSize: 13, cursor: 'pointer',
          }} />
        </label>
        <button onClick={loadHistory} disabled={loading || !date} style={{
          background: '#1e40af', border: '1px solid #2563eb',
          color: loading ? '#475569' : '#bfdbfe',
          borderRadius: 6, padding: '5px 14px', fontSize: 13, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Loading…' : 'Load'}
        </button>
        <div style={{ flex: 1 }} />
        {hasSnapshots && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CtrlBtn onClick={goFirst} title="First"    disabled={cursor === 0}>⏮</CtrlBtn>
            <CtrlBtn onClick={goPrev}  title="Previous" disabled={cursor === 0}>⏪</CtrlBtn>
            <CtrlBtn onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</CtrlBtn>
            <CtrlBtn onClick={goNext} title="Next" disabled={cursor === snapshots!.length - 1}>⏩</CtrlBtn>
            <CtrlBtn onClick={goLast} title="Last" disabled={cursor === snapshots!.length - 1}>⏭</CtrlBtn>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>{cursor + 1} / {snapshots!.length}</span>
          </div>
        )}
        {timestampStr && <span style={{ fontSize: 12, color: '#475569' }}>{timestampStr}</span>}
      </div>

      {hasSnapshots && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid #1e293b' }}>
          <input type="range" min={0} max={snapshots!.length - 1} value={cursor}
            onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }}
            style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} />
        </div>
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        {snapshots === null && !loading && !error && <EmptyState icon="🎬" message="Select a date and click Load to replay session history" />}
        {loading  && <EmptyState icon="⏳" message="Loading snapshots…" />}
        {error    && <EmptyState icon="⚠️" message={`Error: ${error}`} color="#f87171" />}
        {!loading && snapshots !== null && snapshots.length === 0 && !error && <EmptyState icon="📭" message="No snapshots found for this date" />}
        {hasSnapshots && (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView colorMode="dark">
            <Background color="#1e293b" gap={24} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
