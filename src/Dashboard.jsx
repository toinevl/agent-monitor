/**
 * Dashboard — Modern analytics dashboard with charts, metrics, and insights
 * Features: Line charts (trends), bar charts (costs), real-time metrics cards
 */

import { useState, useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import Chart from 'chart.js/auto';
import { useSessionStats, useSessionHistory, useCostMetrics, useMetrics } from './useAnalytics';
import { formatDistance, subDays, startOfDay, endOfDay } from 'date-fns';
import { TrendingUp, DollarSign, Zap, Server, AlertCircle, RefreshCw } from 'lucide-react';

// Ensure Chart.js is registered
Chart.register();

function MetricCard({ icon: Icon, label, value, unit = '', color = '#4ade80', subtext = '' }) {
  const displayValue = typeof value === 'number'
    ? value.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : value;
  const ariaLabel = subtext
    ? `${label}: ${displayValue}${unit}, ${subtext}`
    : `${label}: ${displayValue}${unit}`;

  return (
    <div
      aria-label={ariaLabel}
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '20px 24px',
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 10,
          background: `${color}22`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={24} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
          {label}
        </div>
        <div style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 700, marginTop: 4 }}>
          {typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : value}
          <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 4 }}>{unit}</span>
        </div>
        {subtext && (
          <div style={{ color: '#475569', fontSize: 11, marginTop: 6 }}>{subtext}</div>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children, loading = false, error = null }) {
  return (
    <div
      role="region"
      aria-label={title}
      style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '24px',
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>
        {title}
      </div>
      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}
      {error && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#f87171', fontSize: 13 }}>Failed to load: {error}</div>
        </div>
      )}
      {!loading && !error && children}
    </div>
  );
}

export default function Dashboard({ instances, agents, edges }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateRange, setDateRange] = useState(7); // Days to show

  // Memoize date objects — new Date instances on every render would cause
  // useSessionHistory's useEffect to refetch in an infinite loop
  const historyStart = useMemo(() => subDays(selectedDate, dateRange), [selectedDate, dateRange]);
  const historyEnd = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  // Fetch analytics data
  const { stats } = useSessionStats(selectedDate);
  const { snapshots, loading: historyLoading, error: historyError } = useSessionHistory(
    historyStart,
    historyEnd
  );
  const { dailyCost, monthlyCost, costByInstance } = useCostMetrics(instances);
  const metrics = useMetrics(instances, stats);

  // Prepare chart data for agent trends
  const agentTrendData = snapshots
    .sort((a, b) => a.timestamp - b.timestamp)
    .reduce((acc, snap) => {
      const date = new Date(snap.timestamp);
      const hour = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      acc.labels.push(hour);
      acc.data.push(snap.agentCount);
      return acc;
    }, { labels: [], data: [] });

  const agentTrendChartData = {
    labels: agentTrendData.labels.slice(-24), // Last 24 data points
    datasets: [
      {
        label: 'Active Agents',
        data: agentTrendData.data.slice(-24),
        borderColor: '#4ade80',
        backgroundColor: '#4ade8022',
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: '#4ade80',
        pointBorderColor: '#0f172a',
      },
    ],
  };

  // Cost breakdown chart
  const costChartData = {
    labels: costByInstance.slice(0, 5).map(c => c.label),
    datasets: [
      {
        label: 'Est. Daily Cost ($)',
        data: costByInstance.slice(0, 5).map(c => c.cost),
        backgroundColor: ['#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa'],
      },
    ],
  };

  // Instance status pie chart
  const instanceStatusData = {
    labels: ['Online', 'Offline'],
    datasets: [
      {
        data: [metrics.onlineInstances, metrics.totalInstances - metrics.onlineInstances],
        backgroundColor: ['#4ade80', '#f87171'],
        borderColor: '#0f172a',
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#94a3b8', font: { size: 12 } },
      },
    },
    scales: {
      y: {
        ticks: { color: '#64748b' },
        grid: { color: '#1e293b' },
      },
      x: {
        ticks: { color: '#64748b' },
        grid: { color: '#1e293b' },
      },
    },
  };

  return (
    <div
      style={{
        padding: '24px',
        background: '#020617',
        color: '#f1f5f9',
        overflow: 'auto',
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📊 Analytics Dashboard</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select
              value={dateRange}
              onChange={e => setDateRange(parseInt(e.target.value))}
              aria-label="Date range"
              style={{
                padding: '6px 10px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#f1f5f9',
                fontSize: 12,
              }}
            >
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7d</option>
              <option value={30}>Last 30d</option>
            </select>
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={e => setSelectedDate(new Date(e.target.value))}
              aria-label="Select date"
              style={{
                padding: '6px 10px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#f1f5f9',
                fontSize: 12,
              }}
            />
          </div>
        </div>

        {/* Key metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          <MetricCard
            icon={Server}
            label="Instances"
            value={metrics.totalInstances}
            color="#60a5fa"
            subtext={`${metrics.onlineInstances} online`}
          />
          <MetricCard
            icon={Zap}
            label="Active Sessions"
            value={metrics.totalActiveSessions}
            color="#4ade80"
            subtext={`${metrics.totalAgents} agents running`}
          />
          <MetricCard
            icon={TrendingUp}
            label="Max Agents (24h)"
            value={metrics.maxAgentCount}
            color="#fbbf24"
            subtext={`Avg: ${metrics.avgAgentCount.toFixed(1)}`}
          />
          <MetricCard
            icon={DollarSign}
            label="Est. Daily Cost"
            value={dailyCost.toFixed(2)}
            unit="$"
            color="#f87171"
            subtext={`Monthly: $${monthlyCost.toFixed(2)}`}
          />
        </div>
      </div>

      {/* Charts grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: 24,
        }}
      >
        {/* Agent trend line chart */}
        <ChartCard title="Agent Activity Trend" loading={historyLoading} error={historyError}>
          <div style={{ position: 'relative', height: 300 }}>
            <Line data={agentTrendChartData} options={chartOptions} />
          </div>
        </ChartCard>

        {/* Cost breakdown bar chart */}
        <ChartCard title="Estimated Costs by Instance">
          <div style={{ position: 'relative', height: 300 }}>
            <Bar
              data={costChartData}
              options={{
                ...chartOptions,
                indexAxis: 'y',
              }}
            />
          </div>
        </ChartCard>

        {/* Instance status pie */}
        <ChartCard title="Instance Status">
          <div style={{ position: 'relative', height: 300 }}>
            <Doughnut data={instanceStatusData} options={chartOptions} />
          </div>
        </ChartCard>

        {/* Session stats card */}
        <ChartCard title="Session Statistics">
          {stats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>AVG AGENTS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>
                    {stats.avgAgentCount || '—'}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>MAX AGENTS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fbbf24' }}>
                    {stats.maxAgentCount || '—'}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>MIN AGENTS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa' }}>
                    {stats.minAgentCount || '—'}
                  </div>
                </div>
                <div style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>SNAPSHOTS</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>
                    {stats.snapshotCount || '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No data available for selected date</div>
          )}
        </ChartCard>

        {/* Alerts */}
        {metrics.onlineInstances < metrics.totalInstances && (
          <ChartCard title="⚠️ Alerts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  background: '#7f1d1d',
                  border: '1px solid #dc2626',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>Offline Instances</div>
                  <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                    {metrics.totalInstances - metrics.onlineInstances} instance
                    {metrics.totalInstances - metrics.onlineInstances !== 1 ? 's' : ''} offline
                  </div>
                </div>
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      {/* Data sync info */}
      <div
        style={{
          marginTop: 24,
          padding: 12,
          background: '#0f172a',
          borderRadius: 8,
          fontSize: 11,
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        Last updated: {new Date().toLocaleTimeString()} • Data syncs every 30 seconds
      </div>
    </div>
  );
}
