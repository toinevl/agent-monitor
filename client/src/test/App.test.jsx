import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import App from '../App';

// Mock WebSocket so the app doesn't try to connect in tests
class MockWebSocket {
  constructor() {
    this.readyState = 1;
    this._onopen = null;
    this._onclose = null;
    this._onerror = null;
  }

  set onopen(fn) {
    this._onopen = fn;
    if (typeof fn === 'function') {
      setTimeout(() => fn(), 0);
    }
  }

  set onclose(fn) {
    this._onclose = fn;
  }

  set onerror(fn) {
    this._onerror = fn;
  }

  send() {}
  close() {
    this.readyState = 3;
    if (typeof this._onclose === 'function') this._onclose();
  }
  addEventListener() {}
  removeEventListener() {}
}

beforeAll(() => { global.WebSocket = MockWebSocket; });

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation((url) => {
    if (url.endsWith('/api/state')) {
      return Promise.resolve({ ok: true, json: async () => ({ agents: [], edges: [], pushedAt: null }) });
    }
    if (url.endsWith('/api/instances')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  });
});

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

  it('shows backend error indicator when instance refresh fails', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.endsWith('/api/state')) {
        return Promise.resolve({ ok: true, json: async () => ({ agents: [], edges: [], pushedAt: null }) });
      }
      if (url.endsWith('/api/instances')) {
        return Promise.resolve({ ok: true, json: async () => { throw new Error('JSON parse error'); } });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('backend-error')).toHaveTextContent(/Failed to refresh instance list/i));
  });

  it('refreshes instance list and updates UI when refresh is clicked', async () => {
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.endsWith('/api/state')) {
        return Promise.resolve({ ok: true, json: async () => ({ agents: [], edges: [], pushedAt: null }) });
      }
      if (url.endsWith('/api/instances')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    render(<App />);
    fireEvent.click(screen.getByText(/Instances/));
    await waitFor(() => expect(screen.getByText('No instances registered yet')).toBeInTheDocument());

    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.endsWith('/api/instances')) {
        return Promise.resolve({ ok: true, json: async () => ([{ instanceId: 'agent-1', label: 'Agent 1', online: true, lastSeenAgo: 10, activeSessions: 1 }]) });
      }
      if (url.endsWith('/api/state')) {
        return Promise.resolve({ ok: true, json: async () => ({ agents: [], edges: [], pushedAt: null }) });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    });

    fireEvent.click(screen.getByLabelText('Refresh instance list'));
    await waitFor(() => expect(screen.getByText('Agent 1')).toBeInTheDocument());
  });
});
