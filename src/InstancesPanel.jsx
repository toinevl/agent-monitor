/**
 * InstancesPanel — Fleet overview with search, filter, sort, and pagination
 * Supports: search by label/ID, filter by status, sort by various fields
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X, RefreshCw, EyeOff, Eye } from 'lucide-react';

function ago(sec) {
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function Badge({ children, color = '#6b7280', bg }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: bg || `${color}22`,
        color,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}
    >
      {children}
    </span>
  );
}

function InstanceCard({ inst }) {
  const online = inst.online;
  const statusColor = online ? '#4ade80' : '#f87171';

  return (
    <div
      style={{
        background: '#0f172a',
        border: `1px solid ${online ? '#166534' : '#2e1a1a'}`,
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: online ? `0 0 6px ${statusColor}` : 'none',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: '#f1f5f9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={inst.label || inst.instanceId}
          >
            {inst.label || inst.instanceId}
          </div>
          {inst.label && (
            <div
              style={{
                fontSize: 11,
                color: '#475569',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {inst.instanceId}
            </div>
          )}
        </div>
        <Badge color={statusColor}>{online ? 'online' : 'offline'}</Badge>
      </div>

      {/* Meta grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 12px',
          fontSize: 12,
          color: '#94a3b8',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {inst.version && <MetaRow icon="📦" label="Version" value={inst.version} />}
        {inst.model && <MetaRow icon="🧠" label="Model" value={inst.model} span />}
        {inst.host && <MetaRow icon="💻" label="Host" value={inst.host} span />}
        {inst.activeSessions != null && (
          <MetaRow icon="⚡" label="Sessions" value={inst.activeSessions} />
        )}
        {inst.plugins && (
          <MetaRow icon="🔌" label="Plugins" value={`${inst.plugins.loaded}/${inst.plugins.total}`} />
        )}
        {inst.uptime != null && <MetaRow icon="⏱️" label="Uptime" value={fmtUptime(inst.uptime)} />}
        <MetaRow
          icon="🕐"
          label="Last seen"
          value={inst.lastSeenAgo != null ? ago(inst.lastSeenAgo) : '—'}
        />
      </div>

      {/* Agent list */}
      {inst.agents?.length > 0 && (
        <div
          style={{
            background: '#0a0f1e',
            borderRadius: 8,
            padding: '8px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
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
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
        gridColumn: span ? '1 / -1' : undefined,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 12, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#475569', flexShrink: 0, whiteSpace: 'nowrap' }}>{label}:</span>
      <span
        style={{
          color: '#cbd5e1',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}
        title={String(value)}
      >
        {String(value)}
      </span>
    </div>
  );
}

function fmtUptime(sec) {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function SearchInput({ value, onChange, placeholder = 'Search instances...' }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        flex: 1,
        minWidth: 200,
      }}
    >
      <Search size={16} style={{ position: 'absolute', left: 10, color: '#64748b' }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '6px 10px 6px 32px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#f1f5f9',
          fontSize: 12,
          outline: 'none',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function SortDropdown({ value, onChange }) {
  const options = [
    { label: 'Last seen (newest)', value: 'lastSeen' },
    { label: 'Status (online first)', value: 'status' },
    { label: 'Name (A-Z)', value: 'name' },
    { label: 'Active sessions', value: 'sessions' },
  ];

  return (
    <div style={{ position: 'relative', minWidth: 180 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#f1f5f9',
          fontSize: 12,
          cursor: 'pointer',
          appearance: 'none',
          paddingRight: 28,
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          color: '#64748b',
        }}
      />
    </div>
  );
}

const HIDE_OFFLINE_KEY = 'instancesPanel.hideOffline';

export default function InstancesPanel({ instances, onRefresh }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'online', 'offline'
  const [sortBy, setSortBy] = useState('lastSeen');
  const [currentPage, setCurrentPage] = useState(1);
  const [hideOffline, setHideOffline] = useState(
    () => localStorage.getItem(HIDE_OFFLINE_KEY) === 'true'
  );
  const [refreshing, setRefreshing] = useState(false);
  const ITEMS_PER_PAGE = 12;

  const toggleHideOffline = useCallback(() => {
    setHideOffline(prev => {
      const next = !prev;
      localStorage.setItem(HIDE_OFFLINE_KEY, String(next));
      return next;
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  // Filter instances
  const filtered = useMemo(() => {
    let result = instances;

    // Hide-offline toggle
    if (hideOffline) {
      result = result.filter(i => i.online);
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        i =>
          (i.label || '').toLowerCase().includes(q) ||
          (i.instanceId || '').toLowerCase().includes(q) ||
          (i.version || '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter === 'online') {
      result = result.filter(i => i.online);
    } else if (statusFilter === 'offline') {
      result = result.filter(i => !i.online);
    }

    return result;
  }, [instances, searchQuery, statusFilter, hideOffline]);

  // Sort instances
  const sorted = useMemo(() => {
    const copy = [...filtered];

    if (sortBy === 'lastSeen') {
      copy.sort((a, b) => (a.lastSeenAgo || 999999) - (b.lastSeenAgo || 999999));
    } else if (sortBy === 'status') {
      copy.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    } else if (sortBy === 'name') {
      copy.sort((a, b) => (a.label || a.instanceId).localeCompare(b.label || b.instanceId));
    } else if (sortBy === 'sessions') {
      copy.sort((a, b) => (b.activeSessions || 0) - (a.activeSessions || 0));
    }

    return copy;
  }, [filtered, sortBy]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginatedInstances = sorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const online = instances.filter(i => i.online).length;
  const offline = instances.filter(i => !i.online).length;

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, sortBy, hideOffline]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflow: 'hidden',
      }}
    >
      {/* Summary bar */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#475569', fontSize: 13 }}>Fleet overview</span>
        <span style={{ color: '#4ade80', fontWeight: 700 }}>{online} online</span>
        {offline > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}>{offline} offline</span>}
        <span style={{ color: '#334155', fontSize: 12, marginLeft: 'auto' }}>
          {sorted.length}/{instances.length} instance
          {instances.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Toolbar */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <SearchInput value={searchQuery} onChange={setSearchQuery} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>Filter:</span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: '#f1f5f9',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <option value="all">All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 12, whiteSpace: 'nowrap' }}>Sort:</span>
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>

        {/* Hide-offline toggle */}
        <button
          onClick={toggleHideOffline}
          title={hideOffline ? 'Show offline instances' : 'Hide offline instances'}
          aria-label={hideOffline ? 'Show offline instances' : 'Hide offline instances'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: hideOffline ? '#1e3a5f' : '#1e293b',
            border: `1px solid ${hideOffline ? '#2563eb' : '#334155'}`,
            borderRadius: 6,
            color: hideOffline ? '#60a5fa' : '#94a3b8',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontWeight: hideOffline ? 600 : 400,
          }}
        >
          {hideOffline ? <EyeOff size={14} /> : <Eye size={14} />}
          {hideOffline ? 'Offline hidden' : 'Show offline'}
        </button>

        {/* Refresh button */}
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh instance list"
            aria-label="Refresh instance list"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 6,
              color: refreshing ? '#475569' : '#94a3b8',
              fontSize: 12,
              cursor: refreshing ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
              }}
            />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Spin keyframe — injected once via a style tag */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Cards */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          alignContent: 'start',
        }}
      >
        {sorted.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              color: '#334155',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 32 }}>📡</div>
            <div style={{ fontSize: 14 }}>
              {instances.length === 0 ? 'No instances registered yet' : 'No results found'}
            </div>
            <div style={{ fontSize: 12, color: '#1e293b', textAlign: 'center', maxWidth: 300 }}>
              {instances.length === 0
                ? 'Install the beacon skill on each OpenClaw instance to start seeing them here.'
                : 'Try adjusting your search or filter criteria.'}
            </div>
          </div>
        ) : (
          paginatedInstances.map(inst => <InstanceCard key={inst.instanceId} inst={inst} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '4px 12px',
              background: currentPage === 1 ? '#1e293b' : '#334155',
              border: 'none',
              borderRadius: 4,
              color: currentPage === 1 ? '#64748b' : '#f1f5f9',
              cursor: currentPage === 1 ? 'default' : 'pointer',
              fontSize: 11,
            }}
          >
            ← Prev
          </button>

          <span style={{ color: '#64748b', fontSize: 11 }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            style={{
              padding: '4px 12px',
              background: currentPage === totalPages ? '#1e293b' : '#334155',
              border: 'none',
              borderRadius: 4,
              color: currentPage === totalPages ? '#64748b' : '#f1f5f9',
              cursor: currentPage === totalPages ? 'default' : 'pointer',
              fontSize: 11,
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
