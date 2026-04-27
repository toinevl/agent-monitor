import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { AgentStatus, AgentType } from './mockData';

export interface AgentNodeData extends Record<string, unknown> {
  id: string;
  type: AgentType;
  label: string;
  status: AgentStatus;
  task: string;
  startedAt: string | null;
  logs: string[];
  tokens?: number;
  model?: string;
  ageSec?: number;
  key?: string;
}

interface StatusColor {
  bg: string;
  border: string;
  dot: string;
}

const statusColors: Record<AgentStatus, StatusColor> = {
  running: { bg: 'var(--node-running)', border: '#4ade80', dot: '#4ade80' },
  done:    { bg: 'var(--node-done)',    border: '#60a5fa', dot: '#60a5fa' },
  idle:    { bg: 'var(--node-idle)',    border: '#6b7280', dot: '#6b7280' },
  error:   { bg: 'var(--node-error)',   border: '#f87171', dot: '#f87171' },
};

const typeIcons: Record<AgentType, string> = {
  orchestrator: '🧠',
  investigator: '🔍',
  worker:       '⚙️',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AgentNode({ data, selected }: { data: any; selected?: boolean }): React.ReactElement {
  const d = data as AgentNodeData;
  const colors = statusColors[d.status] || statusColors.idle;

  return (
    <div style={{
      background: colors.bg,
      border: `2px solid ${selected ? '#f59e0b' : colors.border}`,
      borderRadius: 12,
      padding: '12px 16px',
      minWidth: 180,
      boxShadow: `0 0 12px ${colors.border}33`,
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: colors.border }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{typeIcons[d.type] || '🤖'}</span>
        <span style={{ color: 'var(--tx-hi)', fontWeight: 700, fontSize: 14 }}>{d.label}</span>
        <span style={{
          marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
          background: colors.dot, boxShadow: `0 0 6px ${colors.dot}`,
        }} />
      </div>

      <div style={{ color: 'var(--tx-med)', fontSize: 11, lineHeight: 1.4, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {d.task}
      </div>

      <div style={{
        marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 20,
        fontSize: 10, fontWeight: 600,
        background: `${colors.dot}22`, color: colors.dot,
        textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {d.status}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}
