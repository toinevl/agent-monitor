/**
 * AgentTimeline — Gantt-style view of agent activity over time.
 * Props: { agents, snapshots }
 *   agents    - live agent list from useAgentState
 *   snapshots - array of session history snapshots (may be empty)
 */

import { useState, useMemo } from 'react';

const STATUS_COLOR = {
  running: '#4ade80',
  done:    '#60a5fa',
  error:   '#f87171',
  idle:    '#6b7280',
};

const TIME_WINDOWS = [
  { label: '15m', minutes: 15 },
  { label: '1h',  minutes: 60 },
  { label: '6h',  minutes: 360 },
];

// Format a duration in ms to a human-readable string
function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// Format a timestamp (ms) to HH:MM
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Build a list of agent timeline entries from snapshots + live agents.
 * Returns: Array of { id, name, status, bars: [{ start, end, status }] }
 */
function buildTimelineEntries(agents, snapshots, windowStart, windowEnd) {
  const agentMap = new Map();

  // Seed from live agents first
  for (const agent of agents) {
    const id = agent.id;
    if (!agentMap.has(id)) {
      agentMap.set(id, {
        id,
        name: agent.name || agent.id,
        status: agent.status,
        bars: [],
      });
    } else {
      // Update status from live data
      agentMap.get(id).status = agent.status;
    }

    // For live agents with a startTime, add a "currently active" bar
    const startTs = agent.startTime ? new Date(agent.startTime).getTime() : null;
    if (startTs && startTs < windowEnd) {
      const barStart = Math.max(startTs, windowStart);
      const barEnd = windowEnd;
      if (barStart < barEnd) {
        agentMap.get(id).bars.push({
          start: barStart,
          end: barEnd,
          status: agent.status || 'running',
          live: true,
        });
      }
    }
  }

  // Overlay snapshot data (more precise activity windows)
  for (const snap of snapshots) {
    // Snapshots may have a `agents` array or `agentStates` map
    const snapAgents = snap.agents || [];
    const snapTime   = snap.timestamp ? new Date(snap.timestamp).getTime() : null;
    if (!snapTime) continue;

    for (const sa of snapAgents) {
      const id = sa.id || sa.agentId;
      if (!id) continue;

      if (!agentMap.has(id)) {
        agentMap.set(id, {
          id,
          name: sa.name || id,
          status: sa.status || 'idle',
          bars: [],
        });
      }

      const entry = agentMap.get(id);

      // Use snapshot timestamp as a point-in-time bar (width = 1 minute minimum)
      const barStart = Math.max(snapTime - 30000, windowStart);
      const barEnd   = Math.min(snapTime + 30000, windowEnd);
      if (barStart < windowEnd && barEnd > windowStart) {
        entry.bars.push({
          start: barStart,
          end: barEnd,
          status: sa.status || 'idle',
          live: false,
        });
      }
    }
  }

  return Array.from(agentMap.values());
}

// Merge overlapping bars for a single agent so the chart looks clean
function mergeBars(bars) {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur  = sorted[i];
    if (cur.start <= last.end) {
      last.end    = Math.max(last.end, cur.end);
      // Prefer more "interesting" status
      if (cur.status === 'running' || cur.status === 'error') {
        last.status = cur.status;
      }
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

// X-axis tick labels
function buildTicks(windowStart, windowEnd, count = 5) {
  const ticks = [];
  const span  = windowEnd - windowStart;
  for (let i = 0; i <= count; i++) {
    const ts = windowStart + (span * i) / count;
    ticks.push({ ts, label: fmtTime(ts), pct: (i / count) * 100 });
  }
  return ticks;
}

export default function AgentTimeline({ agents = [], snapshots = [] }) {
  const [windowMinutes, setWindowMinutes] = useState(60);

  const now         = Date.now();
  const windowEnd   = now;
  const windowStart = now - windowMinutes * 60 * 1000;
  const windowSpan  = windowEnd - windowStart;

  const entries = useMemo(
    () => buildTimelineEntries(agents, snapshots, windowStart, windowEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, snapshots, windowMinutes]
  );

  const ticks = useMemo(
    () => buildTicks(windowStart, windowEnd, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windowMinutes, now]
  );

  const hasData = entries.length > 0;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#020617',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: '#475569', fontSize: 13 }}>Agent activity window</span>

        {/* Time window selector */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_WINDOWS.map(w => (
            <button
              key={w.label}
              onClick={() => setWindowMinutes(w.minutes)}
              style={{
                background: windowMinutes === w.minutes ? '#1e293b' : 'transparent',
                border: windowMinutes === w.minutes ? '1px solid #334155' : '1px solid transparent',
                color: windowMinutes === w.minutes ? '#f1f5f9' : '#475569',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {w.label}
            </button>
          ))}
        </div>

        <span style={{ color: '#334155', fontSize: 12, marginLeft: 'auto' }}>
          {entries.length} agent{entries.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '16px 24px' }}>
        {!hasData ? (
          /* Empty state */
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 200,
              color: '#334155',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 32 }}>⏱️</div>
            <div style={{ fontSize: 14 }}>
              No timeline data yet — session history will appear here as agents run
            </div>
            <div style={{ fontSize: 12, color: '#1e293b', textAlign: 'center', maxWidth: 400 }}>
              Connect an OpenClaw instance and start a session to see the Gantt chart.
            </div>
          </div>
        ) : (
          <div style={{ minWidth: 0 }}>
            {/* X-axis ticks */}
            <div
              style={{
                display: 'flex',
                marginLeft: LABEL_WIDTH,
                position: 'relative',
                height: 24,
                marginBottom: 4,
              }}
            >
              {ticks.map(t => (
                <div
                  key={t.ts}
                  style={{
                    position: 'absolute',
                    left: `${t.pct}%`,
                    transform: t.pct === 100 ? 'translateX(-100%)' : t.pct === 0 ? 'none' : 'translateX(-50%)',
                    fontSize: 11,
                    color: '#475569',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.label}
                </div>
              ))}
            </div>

            {/* Rows */}
            {entries.map(entry => {
              const merged = mergeBars(entry.bars);
              return (
                <AgentRow
                  key={entry.id}
                  entry={entry}
                  bars={merged}
                  windowStart={windowStart}
                  windowSpan={windowSpan}
                />
              );
            })}

            {/* Legend */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid #1e293b',
                flexWrap: 'wrap',
              }}
            >
              {Object.entries(STATUS_COLOR).map(([status, color]) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: color,
                      opacity: 0.85,
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#475569', textTransform: 'capitalize' }}>
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const LABEL_WIDTH = '160px';
const ROW_HEIGHT  = 36;

function AgentRow({ entry, bars, windowStart, windowSpan }) {
  const statusColor = STATUS_COLOR[entry.status] || STATUS_COLOR.idle;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: ROW_HEIGHT,
        marginBottom: 4,
        gap: 0,
      }}
    >
      {/* Label column */}
      <div
        style={{
          width: LABEL_WIDTH,
          minWidth: LABEL_WIDTH,
          paddingRight: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            boxShadow: entry.status === 'running' ? `0 0 5px ${statusColor}` : 'none',
          }}
        />
        <span
          style={{
            fontSize: 12,
            color: '#cbd5e1',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.name}
        >
          {entry.name}
        </span>
      </div>

      {/* Bar track */}
      <div
        style={{
          flex: 1,
          height: ROW_HEIGHT - 10,
          background: '#0f172a',
          borderRadius: 4,
          position: 'relative',
          border: '1px solid #1e293b',
          overflow: 'hidden',
        }}
      >
        {/* Vertical tick grid lines */}
        {[25, 50, 75].map(pct => (
          <div
            key={pct}
            style={{
              position: 'absolute',
              left: `${pct}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: '#1e293b',
            }}
          />
        ))}

        {/* Activity bars */}
        {bars.map((bar, idx) => {
          const leftPct  = ((bar.start - windowStart) / windowSpan) * 100;
          const widthPct = ((bar.end - bar.start) / windowSpan) * 100;
          const color    = STATUS_COLOR[bar.status] || STATUS_COLOR.idle;

          // Clamp to [0, 100]
          const clampedLeft  = Math.max(0, Math.min(100, leftPct));
          const clampedWidth = Math.max(0.5, Math.min(100 - clampedLeft, widthPct));

          return (
            <div
              key={idx}
              title={`${bar.status} — ${fmtTime(bar.start)} to ${bar.live ? 'now' : fmtTime(bar.end)} (${fmtDuration(bar.end - bar.start)})`}
              style={{
                position: 'absolute',
                left:   `${clampedLeft}%`,
                width:  `${clampedWidth}%`,
                top:    3,
                bottom: 3,
                background: color,
                opacity: bar.live ? 0.85 : 0.65,
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          );
        })}

        {/* "No activity" label when no bars visible */}
        {bars.length === 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 8,
              fontSize: 11,
              color: '#1e293b',
            }}
          >
            no activity in window
          </div>
        )}
      </div>
    </div>
  );
}
