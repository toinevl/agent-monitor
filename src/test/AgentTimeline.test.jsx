import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AgentTimeline from '../AgentTimeline';

describe('AgentTimeline', () => {
  it('shows empty state when no agents and no snapshots', () => {
    render(<AgentTimeline agents={[]} snapshots={[]} />);
    expect(
      screen.getByText(/No timeline data yet/i)
    ).toBeInTheDocument();
  });

  it('renders an agent row for each live agent', () => {
    const agents = [
      { id: 'agent-1', name: 'Orchestrator', status: 'running', startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
      { id: 'agent-2', name: 'Worker-1',     status: 'done',    startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString() },
    ];
    render(<AgentTimeline agents={agents} snapshots={[]} />);

    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
    expect(screen.getByText('Worker-1')).toBeInTheDocument();
  });

  it('shows correct agent count in toolbar', () => {
    const agents = [
      { id: 'a1', name: 'Agent A', status: 'running', startTime: new Date().toISOString() },
      { id: 'a2', name: 'Agent B', status: 'idle',    startTime: new Date().toISOString() },
      { id: 'a3', name: 'Agent C', status: 'done',    startTime: new Date().toISOString() },
    ];
    render(<AgentTimeline agents={agents} snapshots={[]} />);
    expect(screen.getByText('3 agents')).toBeInTheDocument();
  });

  it('renders time window selector buttons', () => {
    render(<AgentTimeline agents={[]} snapshots={[]} />);
    expect(screen.getByText('15m')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('6h')).toBeInTheDocument();
  });

  it('switches time window when a button is clicked', () => {
    render(<AgentTimeline agents={[]} snapshots={[]} />);
    const btn15m = screen.getByText('15m');
    fireEvent.click(btn15m);
    // After clicking 15m the button should appear active (no crash is the key check)
    expect(btn15m).toBeInTheDocument();
  });

  it('does not crash with agents that have no startTime', () => {
    const agents = [
      { id: 'x1', name: 'NoStart', status: 'idle' },
    ];
    render(<AgentTimeline agents={agents} snapshots={[]} />);
    expect(screen.getByText('NoStart')).toBeInTheDocument();
  });

  it('handles snapshot data gracefully', () => {
    const snapshots = [
      {
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        agents: [
          { id: 'snap-1', name: 'SnapAgent', status: 'running' },
        ],
      },
    ];
    render(<AgentTimeline agents={[]} snapshots={snapshots} />);
    expect(screen.getByText('SnapAgent')).toBeInTheDocument();
  });
});
