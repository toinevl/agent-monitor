import React, { lazy, Suspense } from 'react';
import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import type { Edge as FlowEdge, NodeMouseHandler, NodeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode, { type AgentNodeData } from './AgentNode';
import LogPanel from './LogPanel';
import ReportPanel from './ReportPanel';
import { useAgentState } from './useAgentState';
import type { Agent, AgentStatus, Edge } from './mockData';

const InstancesPanel  = lazy(() => import('./InstancesPanel'));
const Dashboard       = lazy(() => import('./Dashboard'));
const AgentTimeline   = lazy(() => import('./AgentTimeline'));
const SessionReplay   = lazy(() => import('./SessionReplay'));

const nodeTypes: NodeTypes = { agent: AgentNode as NodeTypes[string] };

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: '#4ade80',
  done:    '#60a5fa',
  idle:    '#6b7280',
  error:   '#f87171',
};

const NODE_WIDTH  = 200;
const NODE_HEIGHT = 90;
const H_GAP = 40;
const V_GAP = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowLayout(agents: Agent[], y: number): any[] {
  const total    = agents.length;
  const rowWidth = total * NODE_WIDTH + (total - 1) * H_GAP;
  return agents.map((agent, idx) => ({
    id:   agent.id,
    type: 'agent',
    position: { x: -rowWidth / 2 + idx * (NODE_WIDTH + H_GAP), y },
    data: { ...agent },
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildNodes(agents: Agent[]): any[] {
  const orchestrators = agents.filter(a => a.type === 'orchestrator');
  const investigators = agents.filter(a => a.type === 'investigator');
  const workers       = agents.filter(a => a.type === 'worker');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
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
    style:        { stroke: '#334155', strokeWidth: 2 },
    labelStyle:   { fill: '#64748b', fontSize: 11 },
    labelBgStyle: { fill: '#0f172a' },
  }));
}

const statusCount = (agents: Agent[], status: AgentStatus): number =>
  agents.filter(a => a.status === status).length;

type TabId = 'sessions' | 'dashboard' | 'instances' | 'timeline' | 'replay';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps): React.ReactElement {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        background: active ? '#1e293b' : 'transparent',
        border: active ? '1px solid #334155' : '1px solid transparent',
        color: active ? '#f1f5f9' : '#475569',
        borderRadius: 8, padding: '6px 14px', fontSize: 12,
        cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

interface StatProps {
  label: string;
  value: number;
  color: string;
}

function Stat({ label, value, color }: StatProps): React.ReactElement {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

export default function App(): React.ReactElement {
  const { agents, edges: rawEdges, instances, setInstances, connected, lastUpdated } = useAgentState();

  const refreshInstances = useCallback(async (): Promise<void> => {
    const base = import.meta.env.VITE_BACKEND_HTTP ||
      (import.meta.env.PROD ? '' : 'http://localhost:3001');
    try {
      const res = await fetch(`${base}/api/instances`);
      if (res.ok) setInstances(await res.json());
    } catch (err) {
      console.error('[refresh] Failed to fetch instances:', err);
    }
  }, [setInstances]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showReport, setShowReport]       = useState<boolean>(false);
  const [activeTab, setActiveTab]         = useState<TabId>('sessions');

  useEffect(() => {
    setNodes(buildNodes(agents));
    setEdges(buildEdges(rawEdges));
    if (selectedAgent) {
      const updated = agents.find(a => a.id === selectedAgent.id);
      if (updated) setSelectedAgent(updated);
    }
  }, [agents, rawEdges]);

  const onNodeClick = useCallback<NodeMouseHandler>((_evt, node) => {
    const agent = agents.find(a => a.id === node.id);
    setSelectedAgent(agent ?? null);
  }, [agents]);

  const running         = statusCount(agents, 'running');
  const done            = statusCount(agents, 'done');
  const idle            = statusCount(agents, 'idle');
  const onlineInstances = instances.filter(i => i.online).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#020617', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>🧠 Agent Monitor</span>
          <span
            aria-label={connected ? 'Connection status: live' : 'Connection status: connecting'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '2px 10px', borderRadius: 20, fontSize: 11,
              background: connected ? '#14532d' : '#1c1917',
              color:      connected ? '#4ade80' : '#78716c',
              border: `1px solid ${connected ? '#166534' : '#292524'}`,
            }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#4ade80' : '#78716c', boxShadow: connected ? '0 0 6px #4ade80' : 'none' }} />
            {connected ? 'live' : 'connecting...'}
          </span>
        </div>

        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          <TabButton active={activeTab === 'sessions'}  onClick={() => setActiveTab('sessions')}>⚡ Sessions</TabButton>
          <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</TabButton>
          <TabButton active={activeTab === 'instances'} onClick={() => setActiveTab('instances')}>
            📡 Instances
            {instances.length > 0 && (
              <span style={{ marginLeft: 6, background: onlineInstances > 0 ? '#14532d' : '#2e1a1a', color: onlineInstances > 0 ? '#4ade80' : '#f87171', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                {onlineInstances}/{instances.length}
              </span>
            )}
          </TabButton>
          <TabButton active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')}>
            ⏱️ Timeline
            {agents.length > 0 && (
              <span style={{ marginLeft: 6, background: '#1e293b', color: '#94a3b8', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
                {agents.length}
              </span>
            )}
          </TabButton>
          <TabButton active={activeTab === 'replay'} onClick={() => setActiveTab('replay')}>🎬 Replay</TabButton>
        </div>

        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', alignItems: 'center' }}>
          {lastUpdated && ['sessions', 'dashboard', 'timeline'].includes(activeTab) && (
            <span style={{ color: '#334155', fontSize: 11 }}>updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          {activeTab === 'sessions' && (
            <button onClick={() => setShowReport(true)} aria-label="Generate report" style={{ background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              📄 Report
            </button>
          )}
          {['sessions', 'dashboard', 'timeline'].includes(activeTab) && (
            <>
              <Stat label="Running" value={running}       color="#4ade80" />
              <Stat label="Done"    value={done}          color="#60a5fa" />
              <Stat label="Idle"    value={idle}          color="#6b7280" />
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
          {import.meta.env.VITE_BUILD_SHA && (
            <span style={{ color: '#334155', fontSize: 11, fontFamily: 'monospace' }}>
              #{(import.meta.env.VITE_BUILD_SHA as string).slice(0, 7)}
            </span>
          )}
        </div>
      </div>

      {/* Main content */}
      <Suspense fallback={
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155' }}>
          <div style={{ fontSize: 14 }}>Loading...</div>
        </div>
      }>
      {activeTab === 'sessions' ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <div style={{ flex: 1 }}>
            {agents.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 32 }}>⏳</div>
                <div style={{ fontSize: 14 }}>Waiting for agent data...</div>
                <div style={{ fontSize: 12, color: '#1e293b' }}>
                  {connected ? 'Connected — no active sessions yet' : 'Connecting to backend...'}
                </div>
              </div>
            ) : (
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView colorMode="dark">
                <Background color="#1e293b" gap={24} />
                <Controls />
                <MiniMap nodeColor={(n): string => STATUS_COLOR[(n.data?.status as AgentStatus)] || '#6b7280'} style={{ background: '#0f172a', border: '1px solid #1e293b' }} />
              </ReactFlow>
            )}
          </div>
          <div style={{ width: 340, padding: 16, borderLeft: '1px solid #1e293b', overflow: 'hidden' }}>
            <LogPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
          </div>
        </div>
      ) : activeTab === 'dashboard' ? (
        <Dashboard instances={instances} agents={agents} edges={rawEdges} />
      ) : activeTab === 'timeline' ? (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AgentTimeline agents={agents} snapshots={[]} />
        </div>
      ) : activeTab === 'replay' ? (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <SessionReplay />
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <InstancesPanel instances={instances} onRefresh={refreshInstances} />
        </div>
      )}

      </Suspense>

      {showReport && <ReportPanel onClose={() => setShowReport(false)} />}
    </div>
  );
}
