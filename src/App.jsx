import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode from './AgentNode';
import LogPanel from './LogPanel';
import ReportPanel from './ReportPanel';
import { useAgentState } from './useAgentState';
import ESMApp from './esm/ESMApp';

const nodeTypes = { agent: AgentNode };

const STATUS_COLOR = {
  running: '#4ade80',
  done:    '#60a5fa',
  idle:    '#6b7280',
  error:   '#f87171',
};

const TYPE_POSITIONS = {
  orchestrator: { x: 320, y: 60 },
};

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

const statusCount = (agents, status) => agents.filter(a => a.status === status).length;

export default function App() {
  const [appMode, setAppMode] = useState('esm'); // 'esm' | 'monitor'
  const { agents, edges: rawEdges, connected, lastUpdated } = useAgentState();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showReport, setShowReport] = useState(false);

  // Sync live data into React Flow
  useEffect(() => {
    setNodes(buildNodes(agents));
    setEdges(buildEdges(rawEdges));

    // Update selected agent if still present
    if (selectedAgent) {
      const updated = agents.find(a => a.id === selectedAgent.id);
      if (updated) setSelectedAgent(updated);
    }
  }, [agents, rawEdges]);

  const onNodeClick = useCallback((_, node) => {
    const agent = agents.find(a => a.id === node.id);
    setSelectedAgent(agent || null);
  }, [agents]);

  const running = statusCount(agents, 'running');
  const done    = statusCount(agents, 'done');
  const idle    = statusCount(agents, 'idle');

  if (appMode === 'esm') {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ESMApp />
        <button
          onClick={() => setAppMode('monitor')}
          style={{
            position: 'fixed', bottom: 16, right: 16, zIndex: 999,
            background: '#0f172a', color: '#64748b', border: '1px solid #1e293b',
            borderRadius: 8, padding: '6px 12px', fontSize: 11, cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          🧠 Agent Monitor
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#020617',
      color: '#f1f5f9',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setAppMode('esm')} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>🧠 Agent Monitor</span>
          </button>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', borderRadius: 20, fontSize: 11,
            background: connected ? '#14532d' : '#1c1917',
            color:      connected ? '#4ade80' : '#78716c',
            border: `1px solid ${connected ? '#166534' : '#292524'}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: connected ? '#4ade80' : '#78716c',
              boxShadow: connected ? '0 0 6px #4ade80' : 'none',
            }} />
            {connected ? 'live' : 'connecting...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', alignItems: 'center' }}>
          {lastUpdated && (
            <span style={{ color: '#334155', fontSize: 11 }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={() => setShowReport(true)} style={{
            background: '#1e293b', border: '1px solid #334155',
            color: '#94a3b8', borderRadius: 8, padding: '6px 14px',
            fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>
            📄 Report
          </button>
          <Stat label="Running" value={running} color="#4ade80" />
          <Stat label="Done"    value={done}    color="#60a5fa" />
          <Stat label="Idle"    value={idle}    color="#6b7280" />
          <Stat label="Total"   value={agents.length} color="#f1f5f9" />
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1 }}>
          {agents.length === 0 ? (
            <div style={{
              height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#334155', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 32 }}>⏳</div>
              <div style={{ fontSize: 14 }}>Waiting for agent data...</div>
              <div style={{ fontSize: 12, color: '#1e293b' }}>
                {connected ? 'Connected — no active sessions yet' : 'Connecting to backend...'}
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              colorMode="dark"
            >
              <Background color="#1e293b" gap={24} />
              <Controls />
              <MiniMap
                nodeColor={n => STATUS_COLOR[n.data?.status] || '#6b7280'}
                style={{ background: '#0f172a', border: '1px solid #1e293b' }}
              />
            </ReactFlow>
          )}
        </div>

        <div style={{ width: 340, padding: 16, borderLeft: '1px solid #1e293b', overflow: 'hidden' }}>
          <LogPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        </div>
      </div>
      {showReport && <ReportPanel onClose={() => setShowReport(false)} />}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}
