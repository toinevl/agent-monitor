import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import App from '../App';

// Mock WebSocket so the app doesn't try to connect in tests
class MockWebSocket {
  constructor() { this.readyState = 1; }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}
beforeAll(() => { global.WebSocket = MockWebSocket; });

// Mock ReactFlow — it requires a browser layout engine
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

// Mock chart components
vi.mock('react-chartjs-2', () => ({
  Line: () => <div />,
  Bar: () => <div />,
  Doughnut: () => <div />,
}));

// Mock analytics hooks
vi.mock('../useAnalytics', () => ({
  useSessionStats: () => ({ stats: null, loading: false, error: null }),
  useSessionHistory: () => ({ snapshots: [], loading: false, error: null }),
  useCostMetrics: () => ({ dailyCost: 0, monthlyCost: 0, costByInstance: [] }),
  useMetrics: () => ({
    totalInstances: 0,
    onlineInstances: 0,
    totalActiveSessions: 0,
    totalAgents: 0,
    avgAgentCount: 0,
    maxAgentCount: 0,
  }),
}));

describe('App', () => {
  it('renders header and tab buttons', () => {
    render(<App />);
    expect(screen.getByText(/Agent Monitor/)).toBeInTheDocument();
    expect(screen.getByText(/Sessions/)).toBeInTheDocument();
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/Instances/)).toBeInTheDocument();
  });

  it('shows Sessions tab by default', () => {
    render(<App />);
    expect(screen.getByText('Waiting for agent data...')).toBeInTheDocument();
  });

  it('switches to Dashboard tab without crashing', async () => {
    render(<App />);
    fireEvent.click(screen.getByText(/Dashboard/));
    await waitFor(() => expect(screen.getByText('📊 Analytics Dashboard')).toBeInTheDocument());
  });

  it('switches to Instances tab without crashing', async () => {
    render(<App />);
    fireEvent.click(screen.getByText(/Instances/));
    await waitFor(() => expect(screen.getByText('No instances registered yet')).toBeInTheDocument());
  });
});
