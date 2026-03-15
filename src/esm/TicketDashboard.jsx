import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const STATUS_META = {
  open:         { label: 'Open',          color: '#ef4444', bg: '#fef2f2', dot: '#ef4444' },
  in_progress:  { label: 'In behandeling', color: '#f59e0b', bg: '#fffbeb', dot: '#f59e0b' },
  opgelost:     { label: 'Opgelost',       color: '#10b981', bg: '#ecfdf5', dot: '#10b981' },
  gesloten:     { label: 'Gesloten',       color: '#6b7280', bg: '#f9fafb', dot: '#6b7280' },
};

const CATEGORY_ICON = {
  IT_INCIDENT: '🔴', IT_REQUEST: '🟡', HR_REQUEST: '🟣', FAQ: '🟢',
};

const PRIORITY_COLOR = {
  laag: '#6b7280', normaal: '#3b82f6', hoog: '#f59e0b', kritiek: '#ef4444',
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot,
        boxShadow: status === 'open' ? `0 0 6px ${meta.dot}` : 'none' }} />
      {meta.label}
    </span>
  );
}

function TicketCard({ ticket, onClick, selected }) {
  const relTime = ts => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'zojuist';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m geleden`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}u geleden`;
    return new Date(ts).toLocaleDateString('nl-NL');
  };

  return (
    <div
      onClick={() => onClick(ticket)}
      style={{
        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
        background: selected ? '#eff6ff' : '#ffffff',
        border: `1.5px solid ${selected ? '#3b82f6' : '#e2e8f0'}`,
        transition: 'all 0.15s', marginBottom: 8,
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = '#bfdbfe'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = '#e2e8f0'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>{CATEGORY_ICON[ticket.category] || '⚪'}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.title}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {ticket.id} · {relTime(ticket.createdAt)}
            {ticket.priority && ticket.priority !== 'normaal' && (
              <span style={{ marginLeft: 8, color: PRIORITY_COLOR[ticket.priority], fontWeight: 600 }}>
                ● {ticket.priority}
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
    </div>
  );
}

function TicketDetail({ ticket, onClose, onRefresh }) {
  const [note, setNote] = useState('');
  const [updating, setUpdating] = useState(false);

  async function updateStatus(status) {
    setUpdating(true);
    await fetch(`${API_BASE}/api/esm/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setUpdating(false);
    onRefresh();
  }

  async function addNote() {
    if (!note.trim()) return;
    setUpdating(true);
    await fetch(`${API_BASE}/api/esm/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: note }),
    });
    setNote('');
    setUpdating(false);
    onRefresh();
  }

  const STATUS_FLOW = {
    open: ['in_progress'],
    in_progress: ['opgelost'],
    opgelost: ['gesloten'],
    gesloten: [],
  };
  const nextStatuses = STATUS_FLOW[ticket.status] || [];

  return (
    <div style={{
      background: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0',
      padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 16,
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
            {ticket.id} · {CATEGORY_ICON[ticket.category]} {ticket.category?.replace('_', ' ')}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
            {ticket.title}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#94a3b8', fontSize: 18, padding: 4,
        }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={ticket.status} />
        <span style={{
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: '#f1f5f9', color: PRIORITY_COLOR[ticket.priority] || '#6b7280',
        }}>
          Prioriteit: {ticket.priority}
        </span>
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11,
          background: '#f1f5f9', color: '#475569' }}>
          {ticket.userName}
        </span>
      </div>

      {/* Description */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Omschrijving</div>
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{ticket.description}</div>
      </div>

      {/* Timeline */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Activiteit</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ticket.messages?.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'agent' ? '#dbeafe' : '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>
                {m.role === 'agent' ? '👤' : '🤖'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.4 }}>{m.content}</div>
                <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>
                  {new Date(m.at).toLocaleString('nl-NL')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNote()}
          placeholder="Voeg notitie toe..."
          style={{
            flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 10,
            padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button onClick={addNote} disabled={updating || !note.trim()} style={{
          background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10,
          padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>Voeg toe</button>
      </div>

      {/* Status actions */}
      {nextStatuses.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {nextStatuses.map(s => (
            <button key={s} onClick={() => updateStatus(s)} disabled={updating} style={{
              background: STATUS_META[s]?.bg, color: STATUS_META[s]?.color,
              border: `1px solid ${STATUS_META[s]?.color}50`,
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
            }}>
              Markeer als: {STATUS_META[s]?.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TicketDashboard({ userId, refreshTrigger }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  async function fetchTickets() {
    try {
      const url = userId
        ? `${API_BASE}/api/esm/tickets?userId=${userId}`
        : `${API_BASE}/api/esm/tickets`;
      const res = await fetch(url);
      const data = await res.json();
      setTickets(data.tickets || []);
      if (selected) {
        const updated = data.tickets?.find(t => t.id === selected.id);
        if (updated) setSelected(updated);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTickets(); }, [userId, refreshTrigger]);

  const FILTERS = [
    { key: 'all', label: 'Alle' },
    { key: 'open', label: 'Open' },
    { key: 'in_progress', label: 'In behandeling' },
    { key: 'opgelost', label: 'Opgelost' },
    { key: 'gesloten', label: 'Gesloten' },
  ];

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    opgelost: tickets.filter(t => t.status === 'opgelost').length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', gap: 16 }}>
      {/* Left: ticket list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Open', value: stats.open, color: '#ef4444' },
            { label: 'In behandeling', value: stats.in_progress, color: '#f59e0b' },
            { label: 'Opgelost', value: stats.opgelost, color: '#10b981' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: '#ffffff', borderRadius: 12, padding: '12px 14px',
              border: '1px solid #e2e8f0', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: '#f1f5f9', borderRadius: 10, padding: 4 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              flex: 1, border: 'none', borderRadius: 8, padding: '6px 4px', fontSize: 11,
              fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              background: filter === f.key ? '#ffffff' : 'transparent',
              color: filter === f.key ? '#1e293b' : '#64748b',
              boxShadow: filter === f.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Tickets */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 13 }}>
              Laden...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Geen tickets gevonden</div>
            </div>
          ) : (
            filtered.map(t => (
              <TicketCard
                key={t.id}
                ticket={t}
                onClick={setSelected}
                selected={selected?.id === t.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: ticket detail */}
      {selected && (
        <div style={{ width: 360, flexShrink: 0 }}>
          <TicketDetail
            ticket={selected}
            onClose={() => setSelected(null)}
            onRefresh={fetchTickets}
          />
        </div>
      )}
    </div>
  );
}
