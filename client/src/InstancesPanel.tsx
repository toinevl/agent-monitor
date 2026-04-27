import React from 'react';
/**
 * InstancesPanel — Fleet overview with search, filter, sort, and pagination
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X, RefreshCw, EyeOff, Eye } from 'lucide-react';
import type { Instance } from './useAgentState';

function ago(sec: number): string {
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function fmtUptime(sec: number): string {
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}

function Badge({ children, color = '#6b7280', bg }: BadgeProps): React.ReactElement {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 20,
      fontSize: 10, fontWeight: 600,
      background: bg || `${color}22`, color,
      textTransform: 'uppercase', letterSpacing: 1,
    }}>
      {children}
    </span>
  );
}

interface MetaRowProps {
  icon: string;
  label: string;
  value: string | number;
  span?: boolean;
}

function MetaRow({ icon, label, value, span }: MetaRowProps): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, gridColumn: span ? '1 / -1' : undefined, minWidth: 0, overflow: 'hidden' }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: 'var(--tx-dim)', flexShrink: 0, whiteSpace: 'nowrap' }}>{label}:</span>
      <span style={{ color: 'var(--tx-hi)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }} title={String(value)}>
        {String(value)}
      </span>
    </div>
  );
}

interface ExtendedInstance extends Instance {
  version?: string;
  host?: string;
  plugins?: { loaded: number; total: number };
  uptime?: number;
  lastSeenAgo?: number;
}

interface InstanceCardProps {
  inst: ExtendedInstance;
}

function InstanceCard({ inst }: InstanceCardProps): React.ReactElement {
  const online = inst.online;
  const statusColor = online ? '#4ade80' : '#f87171';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid var(${online ? '--inst-online-border' : '--inst-offline-border'})`,
      borderRadius: 12, padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: online ? `0 0 6px ${statusColor}` : 'none', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inst.label || inst.instanceId}>
            {inst.label || inst.instanceId}
          </div>
          {inst.label && (
            <div style={{ fontSize: 11, color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {inst.instanceId}
            </div>
          )}
        </div>
        <Badge color={statusColor}>{online ? 'online' : 'offline'}</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: 12, color: 'var(--tx-med)', minWidth: 0, overflow: 'hidden' }}>
        {inst.version         && <MetaRow icon="📦" label="Version"  value={inst.version} />}
        {inst.model           && <MetaRow icon="🧠" label="Model"    value={inst.model} span />}
        {inst.host            && <MetaRow icon="💻" label="Host"     value={inst.host} span />}
        {inst.activeSessions != null && <MetaRow icon="⚡" label="Sessions" value={inst.activeSessions} />}
        {inst.plugins         && <MetaRow icon="🔌" label="Plugins"  value={`${inst.plugins.loaded}/${inst.plugins.total}`} />}
        {inst.uptime != null  && <MetaRow icon="⏱️" label="Uptime"   value={fmtUptime(inst.uptime)} />}
        <MetaRow icon="🕐" label="Last seen" value={inst.lastSeenAgo != null ? ago(inst.lastSeenAgo) : '—'} />
      </div>

      {(inst.agents?.length ?? 0) > 0 && (
        <div style={{ background: 'var(--bg-raised)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {inst.agents!.map(a => (
            <Badge key={a.id} color="#60a5fa">{a.id}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

function SearchInput({ value, onChange, placeholder = 'Search instances...' }: SearchInputProps): React.ReactElement {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 200 }}>
      <Search size={16} style={{ position: 'absolute', left: 10, color: 'var(--tx-lo)' }} />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{
        width: '100%', padding: '6px 10px 6px 32px',
        background: 'var(--bg-raised)', border: '1px solid var(--border-lt)', borderRadius: 6,
        color: 'var(--tx-hi)', fontSize: 12, outline: 'none',
      }} />
      {value && (
        <button onClick={() => onChange('')} style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--tx-med)', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

type SortOption = 'lastSeen' | 'status' | 'name' | 'sessions';

interface SortDropdownProps {
  value: SortOption;
  onChange: (v: SortOption) => void;
}

function SortDropdown({ value, onChange }: SortDropdownProps): React.ReactElement {
  const options: { label: string; value: SortOption }[] = [
    { label: 'Last seen (newest)',    value: 'lastSeen' },
    { label: 'Status (online first)', value: 'status' },
    { label: 'Name (A-Z)',            value: 'name' },
    { label: 'Active sessions',       value: 'sessions' },
  ];
  return (
    <div style={{ position: 'relative', minWidth: 180 }}>
      <select value={value} onChange={e => onChange(e.target.value as SortOption)} style={{
        width: '100%', padding: '6px 10px', background: 'var(--bg-raised)',
        border: '1px solid var(--border-lt)', borderRadius: 6, color: 'var(--tx-hi)',
        fontSize: 12, cursor: 'pointer', appearance: 'none', paddingRight: 28,
      }}>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx-lo)' }} />
    </div>
  );
}

const HIDE_OFFLINE_KEY = 'instancesPanel.hideOffline';
const ITEMS_PER_PAGE   = 12;

interface InstancesPanelProps {
  instances: Instance[];
  onRefresh: () => Promise<void>;
}

export default function InstancesPanel({ instances, onRefresh }: InstancesPanelProps): React.ReactElement {
  const [searchQuery,  setSearchQuery]  = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [sortBy,       setSortBy]       = useState<SortOption>('lastSeen');
  const [currentPage,  setCurrentPage]  = useState<number>(1);
  const [hideOffline,  setHideOffline]  = useState<boolean>(() => localStorage.getItem(HIDE_OFFLINE_KEY) === 'true');
  const [refreshing,   setRefreshing]   = useState<boolean>(false);

  const extInstances = instances as ExtendedInstance[];

  const toggleHideOffline = useCallback((): void => {
    setHideOffline(prev => { const next = !prev; localStorage.setItem(HIDE_OFFLINE_KEY, String(next)); return next; });
  }, []);

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  }, [onRefresh, refreshing]);

  const filtered = useMemo<ExtendedInstance[]>(() => {
    let result = hideOffline ? extInstances.filter(i => i.online) : extInstances;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => (i.label || '').toLowerCase().includes(q) || (i.instanceId || '').toLowerCase().includes(q) || (i.version || '').toLowerCase().includes(q));
    }
    if (statusFilter === 'online')  result = result.filter(i => i.online);
    if (statusFilter === 'offline') result = result.filter(i => !i.online);
    return result;
  }, [extInstances, searchQuery, statusFilter, hideOffline]);

  const sorted = useMemo<ExtendedInstance[]>(() => {
    const copy = [...filtered];
    if (sortBy === 'lastSeen') copy.sort((a, b) => (a.lastSeenAgo || 999999) - (b.lastSeenAgo || 999999));
    if (sortBy === 'status')   copy.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
    if (sortBy === 'name')     copy.sort((a, b) => (a.label || a.instanceId).localeCompare(b.label || b.instanceId));
    if (sortBy === 'sessions') copy.sort((a, b) => (b.activeSessions || 0) - (a.activeSessions || 0));
    return copy;
  }, [filtered, sortBy]);

  const totalPages         = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginatedInstances = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const online  = extInstances.filter(i => i.online).length;
  const offline = extInstances.filter(i => !i.online).length;

  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, sortBy, hideOffline]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--tx-dim)', fontSize: 13 }}>Fleet overview</span>
        <span style={{ color: '#4ade80', fontWeight: 700 }}>{online} online</span>
        {offline > 0 && <span style={{ color: '#f87171', fontWeight: 700 }}>{offline} offline</span>}
        <span style={{ color: 'var(--border-lt)', fontSize: 12, marginLeft: 'auto' }}>{sorted.length}/{extInstances.length} instance{extInstances.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={searchQuery} onChange={setSearchQuery} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--tx-lo)', fontSize: 12, whiteSpace: 'nowrap' }}>Filter:</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'online' | 'offline')} style={{ padding: '6px 10px', background: 'var(--bg-raised)', border: '1px solid var(--border-lt)', borderRadius: 6, color: 'var(--tx-hi)', fontSize: 12, cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: 'var(--tx-lo)', fontSize: 12, whiteSpace: 'nowrap' }}>Sort:</span>
          <SortDropdown value={sortBy} onChange={setSortBy} />
        </div>

        <button onClick={toggleHideOffline} aria-label={hideOffline ? 'Show offline instances' : 'Hide offline instances'} title={hideOffline ? 'Show offline instances' : 'Hide offline instances'} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: hideOffline ? '#1e3a5f' : 'var(--bg-raised)',
          border: `1px solid ${hideOffline ? '#2563eb' : 'var(--border-lt)'}`,
          borderRadius: 6, color: hideOffline ? '#60a5fa' : 'var(--tx-med)',
          fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: hideOffline ? 600 : 400,
        }}>
          {hideOffline ? <EyeOff size={14} /> : <Eye size={14} />}
          {hideOffline ? 'Offline hidden' : 'Show offline'}
        </button>

        {onRefresh && <button onClick={handleRefresh} disabled={refreshing} aria-label="Refresh instance list" title="Refresh instance list" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          background: 'var(--bg-raised)', border: '1px solid var(--border-lt)', borderRadius: 6,
          color: refreshing ? 'var(--tx-dim)' : 'var(--tx-med)', fontSize: 12,
          cursor: refreshing ? 'default' : 'pointer', whiteSpace: 'nowrap',
        }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, alignContent: 'start' }}>
        {sorted.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--tx-lo)', gap: 12 }}>
            <div style={{ fontSize: 32 }}>📡</div>
            <div style={{ fontSize: 14 }}>{extInstances.length === 0 ? 'No instances registered yet' : 'No results found'}</div>
            <div style={{ fontSize: 12, color: 'var(--border-lt)', textAlign: 'center', maxWidth: 300 }}>
              {extInstances.length === 0 ? 'Install the beacon skill on each OpenClaw instance to start seeing them here.' : 'Try adjusting your search or filter criteria.'}
            </div>
          </div>
        ) : (
          paginatedInstances.map(inst => <InstanceCard key={inst.instanceId} inst={inst} />)
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} style={{ padding: '4px 12px', background: currentPage === 1 ? 'var(--bg-raised)' : 'var(--bg-hover)', border: 'none', borderRadius: 4, color: currentPage === 1 ? 'var(--tx-lo)' : 'var(--tx-hi)', cursor: currentPage === 1 ? 'default' : 'pointer', fontSize: 11 }}>← Prev</button>
          <span style={{ color: 'var(--tx-lo)', fontSize: 11 }}>Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} style={{ padding: '4px 12px', background: currentPage === totalPages ? 'var(--bg-raised)' : 'var(--bg-hover)', border: 'none', borderRadius: 4, color: currentPage === totalPages ? 'var(--tx-lo)' : 'var(--tx-hi)', cursor: currentPage === totalPages ? 'default' : 'pointer', fontSize: 11 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
