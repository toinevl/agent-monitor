import { Handle, Position } from '@xyflow/react';

const statusColors = {
  running: { bg: '#1a2e1a', border: '#4ade80', dot: '#4ade80' },
  done:    { bg: '#1a1f2e', border: '#60a5fa', dot: '#60a5fa' },
  idle:    { bg: '#1e1e1e', border: '#6b7280', dot: '#6b7280' },
  error:   { bg: '#2e1a1a', border: '#f87171', dot: '#f87171' },
};

const typeIcons = {
  orchestrator: '🧠',
  investigator: '🔍',
  worker:       '⚙️',
};

export default function AgentNode({ data, selected }) {
  const colors = statusColors[data.status] || statusColors.idle;

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
        <span style={{ fontSize: 18 }}>{typeIcons[data.type] || '🤖'}</span>
        <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>{data.label}</span>
        <span style={{
          marginLeft: 'auto',
          width: 8, height: 8,
          borderRadius: '50%',
          background: colors.dot,
          boxShadow: `0 0 6px ${colors.dot}`,
        }} />
      </div>

      <div style={{
        color: '#94a3b8',
        fontSize: 11,
        lineHeight: 1.4,
        maxWidth: 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.task}
      </div>

      <div style={{
        marginTop: 6,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: `${colors.dot}22`,
        color: colors.dot,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}>
        {data.status}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: colors.border }} />
    </div>
  );
}
