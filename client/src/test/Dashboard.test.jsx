import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Dashboard from '../Dashboard';

// Chart.js components require a real canvas — mock them in jsdom
vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="chart-line" />,
  Bar: () => <div data-testid="chart-bar" />,
  Doughnut: () => <div data-testid="chart-doughnut" />,
}));

// Mock analytics hooks — focus on component rendering, not data fetching
vi.mock('../useAnalytics', () => ({
  useSessionStats: () => ({ stats: null, loading: false, error: null }),
  useSessionHistory: () => ({ snapshots: [], loading: false, error: null }),
  useCostMetrics: () => ({ dailyCost: 0, monthlyCost: 0, costByInstance: [] }),
  useMetrics: () => ({
    totalInstances: 2,
    onlineInstances: 1,
    totalActiveSessions: 3,
    totalAgents: 5,
    avgAgentCount: 2.5,
    maxAgentCount: 5,
  }),
}));

describe('Dashboard', () => {
  it('renders without crashing with empty data', () => {
    render(<Dashboard instances={[]} agents={[]} edges={[]} />);
    expect(screen.getByText('📊 Analytics Dashboard')).toBeInTheDocument();
  });

  it('renders metric cards', () => {
    render(<Dashboard instances={[]} agents={[]} edges={[]} />);
    expect(screen.getByText('Instances')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.getByText('Max Agents (24h)')).toBeInTheDocument();
    expect(screen.getByText('Est. Daily Cost')).toBeInTheDocument();
  });

  it('renders charts', () => {
    render(<Dashboard instances={[]} agents={[]} edges={[]} />);
    expect(screen.getByTestId('chart-line')).toBeInTheDocument();
    expect(screen.getByTestId('chart-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chart-doughnut')).toBeInTheDocument();
  });

  it('shows offline alert when instances are offline', () => {
    render(<Dashboard
      instances={[{ instanceId: 'a', online: false }]}
      agents={[]}
      edges={[]}
    />);
    expect(screen.getByText('⚠️ Alerts')).toBeInTheDocument();
  });
});
