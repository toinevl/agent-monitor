/**
 * AgentTimeline — Gantt-style view of agent activity over time.
 * Props: { agents, snapshots }
 *   agents    - live agent list from useAgentState
 *   snapshots - array of session history snapshots (may be empty)
 */

import { useState, useMemo } from 'react';
import type { Agent, AgentStatus } from './mockData';

interface TimeWindow {
  label: string;
  minutes: number;
}

interface Bar {
  start: number;
  end: number;
  status: AgentStatus;
  live: boolean;
}

interface TimelineEntry {
  id: string;
  name: string;
  status: AgentStatus;
  bars: Bar[];
}

interface Tick {
  ts: number;
  label: string;
  pct: number;
}

interface SnapshotAgent {
  id?: string;
  agentId?: string;
  name?: string;
  status?: AgentStatus;
}

interface Snapshot {
  timestamp?: string;
  agents?: SnapshotAgent[];
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  running: '#4ade80',
  done:    '#60a5fa',
  error:   '#f87171',
  idle:    '#6b7280',
};

const TIME_WINDOWS: TimeWindow[] = [
  { label: '15m', minutes: 15 },
  { label: '1h',  minutes: 60 },
  { label: '6h',  minutes: 360 },
];

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildTimelineEntries(
  agents: (Agent & { startTime?: string; name?: string })[],
  snapshots: Snapshot[],
  windowStart: number,
  windowEnd: number,
): TimelineEntry[] {
  const agentMap = new Map<string, TimelineEntry>();

  for (const agent of agents) {
    const id = agent.id;
    if (!agentMap.has(id)) {
      agentMap.set(id, { id, name: agent.label || agent.id, status: agent.status, bars: [] });
    } else {
      agentMap.get(id)!.status = agent.status;
    }
    const startTs = agent.startTime ? new Date(agent.startTime).getTime() : null;
    if (startTs && startTs < windowEnd) {
      const barStart = Math.max(startTs, windowStart);
      const barEnd   = windowEnd;
      if (barStart < barEnd) {
        agentMap.get(id)!.bars.push({ start: barStart, end: barEnd, status: agent.status || 'running', live: true });
      }
    }
  }

  for (const snap of snapshots) {
    const snapTime = snap.timestamp ? new Date(snap.timestamp).getTime() : null;
    if (!snapTime) continue;
    for (const sa of snap.agents || []) {
      const id = sa.id || sa.agentId;
      if (!id) continue;
      if (!agentMap.has(id)) {
        agentMap.set(id, { id, name: sa.name || id, status: sa.status || 'idle', bars: [] });
      }
      const barStart = Math.max(snapTime - 30000, windowStart);
      const barEnd   = Math.min(snapTime + 30000, windowEnd);
      if (barStart < windowEnd && barEnd > windowStart) {
        agentMap.get(id)!.bars.push({ start: barStart, end: barEnd, status: sa.status || 'idle', live: false });
      }
    }
  }
  return Array.from(agentMap.values());
}

function mergeBars(bars: Bar[]): Bar[] {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort((a, b) => a.start - b.start);
  const merged: Bar[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur  = sorted[i];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
      if (cur.status === 'running' || cur.status === 'error') last.status = cur.status;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function buildTicks(windowStart: number, windowEnd: number, count = 5): Tick[] {
  const ticks: Tick[] = [];
  const span = windowEnd - windowStart;
  for (let i = 0; i <= count; i++) {
    const ts = windowStart + (span * i) / count;
    ticks.push({ ts, label: fmtTime(ts), pct: (i / count) * 100 });
  }
  return ticks;
}

const LABEL_WIDTH = '160px';
const ROW_HEIGHT  = 36;

interface AgentTimelineProps {
  agents?: Agent[];
  snapshots?: Snapshot[];
}

export default function AgentTimeline({ agents = [], snapshots = [] }: AgentTimelineProps): JSX.Element {
  const [windowMinutes, setWindowMinutes] = useState<number>(60);

  const now         = Date.now();
  const windowEnd   = now;
  const windowStart = now - windowMinutes * 60 * 1000;
  const windowSpan  = windowEnd - windowStart;

  const entries = useMemo(
    () => buildTimelineEntries(agents, snapshots, windowStart, windowEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, snapshots, windowMinutes],
  );

  const ticks = useMemo(
    () => buildTicks(windowStart, windowEnd, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowMinutes, now],
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#020617' }}>
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ color: '#475569', fontSize: 13 }}>Agent activity window</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_WINDOWS.map(w => (
            <button key={w.label} onClick={() => setWindowMinutes(w.minutes)} style={{
              background: windowMinutes === w.minutes ? '#1e293b' : 'transparent',
              border: windowMinutes === w.minutes ? '1px solid #334155' : '1px solid transparent',
              color: windowMinutes === w.minutes ? '#f1f5f9' : '#475569',
              borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            }}>{w.label}</button>
          ))}
        </div>
        <span style={{ color: '#334155', fontSize: 12, marginLeft: 'auto' }}>
          {entries.length} agent{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 24px' }}>
        {entries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: '#334155', gap: 12 }}>
            <div style={{ fontSize: 32 }}>⏱️</div>
            <div style={{ fontSize: 14 }}>No timeline data yet</div>
          </div>
        ) : (
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', marginLeft: LABEL_WIDTH, position: 'relative', height: 24, marginBottom: 4 }}>
              {ticks.map(t => (
                <div key={t.ts} style={{
                  position: 'absolute', left: `${t.pct}%`,
                  transform: t.pct === 100 ? 'translateX(-100%)' : t.pct === 0 ? 'none' : 'translateX(-50%)',
                  fontSize: 11, color: '#475569', whiteSpace: 'nowrap',
                }}>{t.label}</div>
              ))}
            </div>
            {entries.map(entry => (
              <AgentRow key={entry.id} entry={entry} bars={mergeBars(entry.bars)} windowStart={windowStart} windowSpan={windowSpan} />
            ))}
            <div style={{ display: 'flex', gap: 16, marginTop: 20, paddingTop: 16, borderTop: '1px solid #1e293b', flexWrap: 'wrap' }}>
              {(Object.entries(STATUS_COLOR) as [AgentStatus, string][]).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity: 0.85 }} />
                  <span style={{ fontSize: 11, color: '#475569', textTransform: 'capitalize' }}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface AgentRowProps {
  entry: TimelineEntry;
  bars: Bar[];
  windowStart: number;
  windowSpan: number;
}

function AgentRow({ entry, bars, windowStart, windowSpan }: AgentRowProps): JSX.Element {
  const statusColor = STATUS_COLOR[entry.status] || STATUS_COLOR.idle;
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT, marginBottom: 4 }}>
      <div style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH, paddingRight: 12, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: entry.status === 'running' ? `0 0 5px ${statusColor}` : 'none' }} />
        <span style={{ fontSize: 12, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.name}>{entry.name}</span>
      </div>
      <div style={{ flex: 1, height: ROW_HEIGHT - 10, background: '#0f172a', borderRadius: 4, position: 'relative', border: '1px solid #1e293b', overflow: 'hidden' }}>
        {[25, 50, 75].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, width: 1, background: '#1e293b' }} />
        ))}
        {bars.map((bar, idx) => {
          const leftPct    = ((bar.start - windowStart) / windowSpan) * 100;
          const widthPct   = ((bar.end - bar.start) / windowSpan) * 100;
          const color      = STATUS_COLOR[bar.status] || STATUS_COLOR.idle;
          const cLeft  = Math.max(0, Math.min(100, leftPct));
          const cWidth = Math.max(0.5, Math.min(100 - cLeft, widthPct));
          return (
            <div key={idx} title={`${bar.status} — ${fmtTime(bar.start)} to ${bar.live ? 'now' : fmtTime(bar.end)} (${fmtDuration(bar.end - bar.start)})`} style={{
              position: 'absolute', left: `${cLeft}%`, width: `${cWidth}%`,
              top: 3, bottom: 3, background: color, opacity: bar.live ? 0.85 : 0.65,
              borderRadius: 3, transition: 'width 0.3s ease',
            }} />
          );
        })}
        {bars.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 11, color: '#1e293b' }}>
            no activity in window
          </div>
        )}
      </div>
    </div>
  );
}
