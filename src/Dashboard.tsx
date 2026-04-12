import React from 'react';
/**
 * Dashboard — Modern analytics dashboard with charts, metrics, and insights
 */

import { useState, useMemo } from 'react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import Chart from 'chart.js/auto';
import { useSessionStats, useSessionHistory, useCostMetrics, useMetrics } from './useAnalytics';
import { subDays, endOfDay } from 'date-fns';
import { TrendingUp, DollarSign, Zap, Server, AlertCircle, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Agent, Edge } from './mockData';
import type { Instance } from './useAgentState';

Chart.register();

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
  subtext?: string;
}

function MetricCard({ icon: Icon, label, value, unit = '', color = '#4ade80', subtext = '' }: MetricCardProps): React.ReactElement {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '20px 24px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={24} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
        <div style={{ color: '#f1f5f9', fontSize: 28, fontWeight: 700, marginTop: 4 }}>
          {typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : value}
          <span style={{ fontSize: 14, color: '#94a3b8', marginLeft: 4 }}>{unit}</span>
        </div>
        {subtext && <div style={{ color: '#475569', fontSize: 11, marginTop: 6 }}>{subtext}</div>}
      </div>
    </div>
  );
}

interface ChartCardProps {
  title: string;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
}

function ChartCard({ title, children, loading = false, error = null }: ChartCardProps): React.ReactElement {
  return (
    <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, padding: '24px', minHeight: 400, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 20 }}>{title}</div>
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

interface DashboardProps {
  instances: Instance[];
  agents: Agent[];
  edges: Edge[];
}

interface SnapshotItem {
  timestamp: number;
  agentCount: number;
}

export default function Dashboard({ instances, agents, edges: _edges }: DashboardProps): React.ReactElement {
  void agents; // used by parent for live data
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateRange, setDateRange]       = useState<number>(7);

  const historyStart = useMemo(() => subDays(selectedDate, dateRange), [selectedDate, dateRange]);
  const historyEnd   = useMemo(() => endOfDay(selectedDate), [selectedDate]);

  const { stats }                                                   = useSessionStats(selectedDate);
  const { snapshots, loading: historyLoading, error: historyError } = useSessionHistory(historyStart, historyEnd);
  const { dailyCost, monthlyCost, costByInstance }                  = useCostMetrics(instances);
  const metrics                                                     = useMetrics(instances, stats);

  const agentTrendData = (snapshots as unknown as SnapshotItem[])
    .sort((a, b) => a.timestamp - b.timestamp)
    .reduce<{ labels: string[]; data: number[] }>((acc, snap) => {
      const hour = new Date(snap.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      acc.labels.push(hour);
      acc.data.push(snap.agentCount);
      return acc;
    }, { labels: [], data: [] });

  const agentTrendChartData = {
    labels: agentTrendData.labels.slice(-24),
    datasets: [{
      label: 'Active Agents',
      data: agentTrendData.data.slice(-24),
      borderColor: '#4ade80', backgroundColor: '#4ade8022',
      tension: 0.3, fill: true, pointRadius: 4,
      pointBackgroundColor: '#4ade80', pointBorderColor: '#0f172a',
    }],
  };

  const costChartData = {
    labels: costByInstance.slice(0, 5).map(c => c.label),
    datasets: [{
      label: 'Est. Daily Cost ($)',
      data: costByInstance.slice(0, 5).map(c => c.cost),
      backgroundColor: ['#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa'],
    }],
  };

  const instanceStatusData = {
    labels: ['Online', 'Offline'],
    datasets: [{
      data: [metrics.onlineInstances, metrics.totalInstances - metrics.onlineInstances],
      backgroundColor: ['#4ade80', '#f87171'],
      borderColor: '#0f172a', borderWidth: 2,
    }],
  };

  const chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } },
    scales: {
      y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
      x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    },
  };

  return (
    <div style={{ padding: '24px', background: '#020617', color: '#f1f5f9', overflow: 'auto', minHeight: '100vh' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>📊 Analytics Dashboard</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select value={dateRange} onChange={e => setDateRange(parseInt(e.target.value))} style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 12 }}>
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7d</option>
              <option value={30}>Last 30d</option>
            </select>
            <input type="date" value={selectedDate.toISOString().split('T')[0]}
              onChange={e => setSelectedDate(new Date(e.target.value))}
              style={{ padding: '6px 10px', background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: 12 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <MetricCard icon={Server}     label="Instances"        value={metrics.totalInstances}       color="#60a5fa" subtext={`${metrics.onlineInstances} online`} />
          <MetricCard icon={Zap}        label="Active Sessions"  value={metrics.totalActiveSessions}  color="#4ade80" subtext={`${metrics.totalAgents} agents running`} />
          <MetricCard icon={TrendingUp} label="Max Agents (24h)" value={metrics.maxAgentCount}        color="#fbbf24" subtext={`Avg: ${metrics.avgAgentCount.toFixed(1)}`} />
          <MetricCard icon={DollarSign} label="Est. Daily Cost"  value={dailyCost.toFixed(2)} unit="$" color="#f87171" subtext={`Monthly: $${monthlyCost.toFixed(2)}`} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: 24 }}>
        <ChartCard title="Agent Activity Trend" loading={historyLoading} error={historyError}>
          <div style={{ position: 'relative', height: 300 }}>
            <Line data={agentTrendChartData} options={chartOptions as ChartOptions<'line'>} />
          </div>
        </ChartCard>

        <ChartCard title="Estimated Costs by Instance">
          <div style={{ position: 'relative', height: 300 }}>
            <Bar data={costChartData} options={{ ...chartOptions, indexAxis: 'y' } as ChartOptions<'bar'>} />
          </div>
        </ChartCard>

        <ChartCard title="Instance Status">
          <div style={{ position: 'relative', height: 300 }}>
            <Doughnut data={instanceStatusData} options={chartOptions as ChartOptions<'doughnut'>} />
          </div>
        </ChartCard>

        <ChartCard title="Session Statistics">
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {([
                { label: 'AVG AGENTS', value: stats.avgAgentCount, color: '#4ade80' },
                { label: 'MAX AGENTS', value: stats.maxAgentCount, color: '#fbbf24' },
              ] as const).map(item => (
                <div key={item.label} style={{ background: '#1e293b', padding: 16, borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.value || '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>No data available for selected date</div>
          )}
        </ChartCard>

        {metrics.onlineInstances < metrics.totalInstances && (
          <ChartCard title="⚠️ Alerts">
            <div style={{ background: '#7f1d1d', border: '1px solid #dc2626', borderRadius: 8, padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>Offline Instances</div>
                <div style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>
                  {metrics.totalInstances - metrics.onlineInstances} instance{metrics.totalInstances - metrics.onlineInstances !== 1 ? 's' : ''} offline
                </div>
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      <div style={{ marginTop: 24, padding: 12, background: '#0f172a', borderRadius: 8, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
        Last updated: {new Date().toLocaleTimeString()} • Data syncs every 30 seconds
      </div>
    </div>
  );
}
