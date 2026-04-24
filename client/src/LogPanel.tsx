import React from 'react';
import type { Agent, AgentStatus, AgentType } from './mockData';

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: '#4ade80',
  done:    '#60a5fa',
  idle:    '#6b7280',
  error:   '#f87171',
};

const TYPE_ICON: Record<AgentType, string> = {
  orchestrator: '🧠',
  investigator: '🔍',
  worker:       '⚙️',
};

function ago(sec: number): string {
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

interface LogPanelProps {
  agent: Agent & { tokens?: number; model?: string; ageSec?: number; key?: string } | null;
  onClose: () => void;
}

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps): React.ReactElement {
  return (
    <div style={{ background: '#020617', borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ color: '#334155', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function LogPanel({ agent, onClose }: LogPanelProps): React.ReactElement {
  if (!agent) return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: 12,
      padding: 24,
      color: '#475569',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 1.6,
    }}>
      Click an agent node<br />to view details
    </div>
  );

  const color = STATUS_COLOR[agent.status] || '#6b7280';

  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: 12,
      padding: 20,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{TYPE_ICON[agent.type] || '🤖'}</span>
          <div>
            <h3 style={{ color: '#f1f5f9', margin: 0, fontSize: 15 }}>{agent.label}</h3>
            <div style={{ color, fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
              {agent.status}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#475569',
          cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 0,
        }}>×</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatBox label="Model"   value={agent.model || '—'} />
        <StatBox label="Tokens"  value={(agent.tokens || 0).toLocaleString()} />
        <StatBox label="Type"    value={agent.type} />
        <StatBox label="Updated" value={ago(agent.ageSec || 0)} />
      </div>

      <div style={{
        background: '#020617',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 16,
        color: '#94a3b8',
        fontSize: 12,
        lineHeight: 1.5,
      }}>
        <div style={{ color: '#334155', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Current Task
        </div>
        {agent.task || 'No task info available'}
      </div>

      <div style={{
        color: '#1e293b',
        fontSize: 10,
        fontFamily: 'monospace',
        wordBreak: 'break-all',
        marginTop: 'auto',
        paddingTop: 12,
        borderTop: '1px solid #0f172a',
      }}>
        {agent.key}
      </div>
    </div>
  );
}
