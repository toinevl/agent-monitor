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
import InstancesPanel from './InstancesPanel';
import Dashboard from './Dashboard';
import { useAgentState } from './useAgentState';

const nodeTypes = { agent: AgentNode };

const STATUS_COLOR = {
  running: '#4ade80',
  done:    '#60a5fa',
  idle:    '#6b7280',
  error:   '#f87171',
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

// Tab button component
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? '#1e293b' : 'transparent',
        border: active ? '1px solid #334155' : '1px solid transparent',
        color: active ? '#f1f5f9' : '#475569',
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 12,
        cursor: 'pointer',
        fontWeight: 600,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  const { agents, edges: rawEdges, instances, setInstances, connected, lastUpdated } = useAgentState();

  const refreshInstances = useCallback(async () => {
    const base = import.meta.env.VITE_BACKEND_HTTP ||
      (import.meta.env.PROD ? '' : 'http://localhost:3001');
    try {
      const res = await fetch(`${base}/api/instances`);
      if (res.ok) setInstances(await res.json());
    } catch (err) {
      console.error('[refresh] Failed to fetch instances:', err);
    }
  }, [setInstances]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'dashboard' | 'instances'

  // Sync live data into React Flow
  useEffect(() => {
    setNodes(buildNodes(agents));
    setEdges(buildEdges(rawEdges));

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
  const onlineInstances = instances.filter(i => i.online).length;

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
        gap: 16,
        flexWrap: 'wrap',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>🧠 Agent Monitor</span>
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

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4 }}>
          <TabButton active={activeTab === 'sessions'} onClick={() => setActiveTab('sessions')}>
            ⚡ Sessions
          </TabButton>
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </TabButton>
          <TabButton active={activeTab === 'instances'} onClick={() => setActiveTab('instances')}>
            📡 Instances
            {instances.length > 0 && (
              <span style={{
                marginLeft: 6,
                background: onlineInstances > 0 ? '#14532d' : '#2e1a1a',
                color: onlineInstances > 0 ? '#4ade80' : '#f87171',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 10,
              }}>
                {onlineInstances}/{instances.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', alignItems: 'center' }}>
          {lastUpdated && (activeTab === 'sessions' || activeTab === 'dashboard') && (
            <span style={{ color: '#334155', fontSize: 11 }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {activeTab === 'sessions' && (
            <button onClick={() => setShowReport(true)} style={{
              background: '#1e293b', border: '1px solid #334155',
              color: '#94a3b8', borderRadius: 8, padding: '6px 14px',
              fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}>
              📄 Report
            </button>
          )}
          {(activeTab === 'sessions' || activeTab === 'dashboard') && (
            <>
              <Stat label="Running" value={running} color="#4ade80" />
              <Stat label="Done"    value={done}    color="#60a5fa" />
              <Stat label="Idle"    value={idle}    color="#6b7280" />
              <Stat label="Total"   value={agents.length} color="#f1f5f9" />
            </>
          )}
          {activeTab === 'instances' && (
            <>
              <Stat label="Online"  value={onlineInstances}                    color="#4ade80" />
              <Stat label="Offline" value={instances.length - onlineInstances} color="#f87171" />
              <Stat label="Total"   value={instances.length}                   color="#f1f5f9" />
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      {activeTab === 'sessions' ? (
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
      ) : activeTab === 'dashboard' ? (
        <Dashboard instances={instances} agents={agents} edges={rawEdges} />
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <InstancesPanel instances={instances} onRefresh={refreshInstances} />
        </div>
      )}

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
