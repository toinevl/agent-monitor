/**
 * InstancesPanel — shows all registered OpenClaw instances
 * (fleet overview, powered by /api/instances + WebSocket beacon updates)
 */

function ago(sec) {
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function Badge({ children, color = '#6b7280', bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 20,
      fontSize: 10,
      fontWeight: 600,
      background: bg || `${color}22`,
      color,
      textTransform: 'uppercase',
      letterSpacing: 1,
    }}>
      {children}
    </span>
  );
}

function InstanceCard({ inst }) {
  const online = inst.online;
  const statusColor = online ? '#4ade80' : '#f87171';

  return (
    <div style={{
      background: '#0f172a',
      border: `1px solid ${online ? '#166534' : '#2e1a1a'}`,
      borderRadius: 12,
      padding: '16px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: statusColor,
          boxShadow: online ? `0 0 6px ${statusColor}` : 'none',
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 15, color: '#f1f5f9',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={inst.label || inst.instanceId}>
            {inst.label || inst.instanceId}
          </div>
          {inst.label && (
            <div style={{
              fontSize: 11, color: '#475569',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {inst.instanceId}
            </div>
          )}
        </div>
        <Badge color={statusColor}>{online ? 'online' : 'offline'}</Badge>
      </div>

      {/* Meta grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        fontSize: 12,
        color: '#94a3b8',
        minWidth: 0,
      }}>
        {inst.label && (
          <MetaRow icon="🏷️" label="Label" value={inst.label} />
        )}
        {inst.version && (
          <MetaRow icon="📦" label="Version" value={inst.version} />
        )}
        {inst.model && (
          <MetaRow icon="🧠" label="Model" value={inst.model} span />
        )}
        {inst.host && (
          <MetaRow icon="💻" label="Host" value={inst.host} span />
        )}
        {inst.agents?.length > 0 && (
          <MetaRow icon="🤖" label="Agents" value={inst.agents.length} />
        )}
        {inst.activeSessions != null && (
          <MetaRow icon="⚡" label="Active sessions" value={inst.activeSessions} />
        )}
        {inst.plugins && (
          <MetaRow icon="🔌" label="Plugins" value={`${inst.plugins.loaded}/${inst.plugins.total}`} />
        )}
        {inst.uptime != null && (
          <MetaRow icon="⏱️" label="Uptime" value={fmtUptime(inst.uptime)} />
        )}
        {inst.channel && (
          <MetaRow icon="📡" label="Channel" value={inst.channel} />
        )}
        <MetaRow
          icon="🕐"
          label="Last seen"
          value={inst.lastSeenAgo != null ? ago(inst.lastSeenAgo) : '—'}
        />
      </div>

      {/* Agent list (collapsed) */}
      {inst.agents?.length > 0 && (
        <div style={{
          background: '#0a0f1e',
          borderRadius: 8,
          padding: '8px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
        }}>
          {inst.agents.map(a => (
            <Badge key={a.id || a.name} color="#60a5fa">
              {a.name || a.id}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaRow({ icon, label, value, span }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 6,
      gridColumn: span ? '1 / -1' : undefined,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#475569', flexShrink: 0, minWidth: 70 }}>{label}:</span>
      <span style={{
        color: '#cbd5e1', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flex: 1, minWidth: 0,
      }} title={String(value)}>
        {String(value)}
      </span>
    </div>
  );
}

function fmtUptime(sec) {
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

export default function InstancesPanel({ instances }) {
  const online  = instances.filter(i => i.online).length;
  const offline = instances.filter(i => !i.online).length;

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      overflow: 'hidden',
    }}>
      {/* Summary bar */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}>
        <span style={{ color: '#475569', fontSize: 13 }}>Fleet overview</span>
        <span style={{ color: '#4ade80', fontWeight: 700 }}>{online} online</span>
        {offline > 0 && (
          <span style={{ color: '#f87171', fontWeight: 700 }}>{offline} offline</span>
        )}
        <span style={{ color: '#334155', fontSize: 12, marginLeft: 'auto' }}>
          {instances.length} instance{instances.length !== 1 ? 's' : ''} registered
        </span>
      </div>

      {/* Cards */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 420px))',
        gap: 16,
        alignContent: 'start',
      }}>
        {instances.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            color: '#334155',
            gap: 12,
          }}>
            <div style={{ fontSize: 32 }}>📡</div>
            <div style={{ fontSize: 14 }}>No instances registered yet</div>
            <div style={{ fontSize: 12, color: '#1e293b', textAlign: 'center', maxWidth: 300 }}>
              Install the beacon skill on each OpenClaw instance to start seeing them here.
            </div>
          </div>
        ) : (
          instances.map(inst => (
            <InstanceCard key={inst.instanceId} inst={inst} />
          ))
        )}
      </div>
    </div>
  );
}
