import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SessionReplay from '../SessionReplay';

// Mock ReactFlow — it requires a browser layout engine
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }) => <div data-testid="react-flow">{children}</div>,
  Background: () => null,
  Controls: () => null,
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

// Helper to mock fetch
function mockFetch(responseBody, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => responseBody,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SessionReplay', () => {
  it('renders the initial empty state prompt', () => {
    render(<SessionReplay />);
    expect(screen.getByText('Select a date and click Load to replay session history')).toBeInTheDocument();
  });

  it('renders date picker and Load button', () => {
    render(<SessionReplay />);
    expect(screen.getByRole('button', { name: /load/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue(new Date().toISOString().slice(0, 10))).toBeInTheDocument();
  });

  it('shows "No snapshots found" when API returns empty array', async () => {
    mockFetch({ snapshots: [] });
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('No snapshots found for this date')).toBeInTheDocument();
    });
  });

  it('shows error message when API call fails', async () => {
    mockFetch({}, false);
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });

  it('shows playback controls and graph when snapshots are loaded', async () => {
    const snapshots = [
      {
        timestamp: 1743254400000,
        agentCount: 2,
        state: {
          agents: [
            { id: 'a1', type: 'orchestrator', status: 'running', label: 'Orchestrator', task: 'coord' },
            { id: 'a2', type: 'worker', status: 'idle', label: 'Worker 1', task: 'idle' },
          ],
          edges: [],
        },
      },
      {
        timestamp: 1743254460000,
        agentCount: 2,
        state: {
          agents: [
            { id: 'a1', type: 'orchestrator', status: 'running', label: 'Orchestrator', task: 'coord' },
            { id: 'a2', type: 'worker', status: 'running', label: 'Worker 1', task: 'processing' },
          ],
          edges: [],
        },
      },
    ];

    mockFetch({ snapshots });
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByTestId('react-flow')).toBeInTheDocument();
    });

    // Playback controls should be visible
    expect(screen.getByTitle('First')).toBeInTheDocument();
    expect(screen.getByTitle('Previous')).toBeInTheDocument();
    expect(screen.getByTitle('Play')).toBeInTheDocument();
    expect(screen.getByTitle('Next')).toBeInTheDocument();
    expect(screen.getByTitle('Last')).toBeInTheDocument();

    // Counter shows position
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    // Scrubber range input
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('navigates to next snapshot when Next is clicked', async () => {
    const snapshots = [
      { timestamp: 1743254400000, agentCount: 1, state: { agents: [], edges: [] } },
      { timestamp: 1743254460000, agentCount: 1, state: { agents: [], edges: [] } },
    ];

    mockFetch({ snapshots });
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Next'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('navigates to last snapshot when Last is clicked', async () => {
    const snapshots = [
      { timestamp: 1743254400000, agentCount: 1, state: { agents: [], edges: [] } },
      { timestamp: 1743254460000, agentCount: 1, state: { agents: [], edges: [] } },
      { timestamp: 1743254520000, agentCount: 1, state: { agents: [], edges: [] } },
    ];

    mockFetch({ snapshots });
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Last'));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    // Never-resolving promise to catch loading state
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<SessionReplay />);

    fireEvent.click(screen.getByRole('button', { name: /load/i }));

    expect(screen.getByText('Loading\u2026')).toBeInTheDocument();
  });
});
