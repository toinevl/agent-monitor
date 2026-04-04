import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import InstancesPanel from '../InstancesPanel';

const mockInstances = [
  { instanceId: 'agent-1', label: 'Agent 1', online: true, lastSeenAgo: 30, version: '1.0.0' },
  { instanceId: 'agent-2', label: 'Agent 2', online: false, lastSeenAgo: 900 },
];

describe('InstancesPanel', () => {
  it('renders without crashing with empty instances', () => {
    render(<InstancesPanel instances={[]} />);
    expect(screen.getByText('No instances registered yet')).toBeInTheDocument();
  });

  it('renders instance cards', () => {
    render(<InstancesPanel instances={mockInstances} />);
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Agent 2')).toBeInTheDocument();
  });

  it('shows online/offline counts', () => {
    render(<InstancesPanel instances={mockInstances} />);
    expect(screen.getByText('1 online')).toBeInTheDocument();
    expect(screen.getByText('1 offline')).toBeInTheDocument();
  });

  it('filters by search query', () => {
    render(<InstancesPanel instances={mockInstances} />);
    fireEvent.change(screen.getByPlaceholderText('Search instances...'), {
      target: { value: 'Agent 1' },
    });
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.queryByText('Agent 2')).not.toBeInTheDocument();
  });

  it('filters by online status', () => {
    render(<InstancesPanel instances={mockInstances} />);
    fireEvent.change(screen.getByDisplayValue('All'), {
      target: { value: 'online' },
    });
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.queryByText('Agent 2')).not.toBeInTheDocument();
  });
});
