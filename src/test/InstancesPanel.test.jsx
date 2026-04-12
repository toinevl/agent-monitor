import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import InstancesPanel from '../InstancesPanel';

const mockInstances = [
  { instanceId: 'agent-1', label: 'Agent 1', online: true, lastSeenAgo: 30, version: '1.0.0' },
  { instanceId: 'agent-2', label: 'Agent 2', online: false, lastSeenAgo: 900 },
];

beforeEach(() => {
  localStorage.clear();
});

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

  it('hides offline instances when toggle is clicked', () => {
    render(<InstancesPanel instances={mockInstances} />);
    // Both visible initially
    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.getByText('Agent 2')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Hide offline instances'));

    expect(screen.getByText('Agent 1')).toBeInTheDocument();
    expect(screen.queryByText('Agent 2')).not.toBeInTheDocument();
  });

  it('shows offline instances again after toggle is clicked twice', () => {
    render(<InstancesPanel instances={mockInstances} />);
    const btn = screen.getByLabelText('Hide offline instances');
    fireEvent.click(btn);
    // label changes after first click
    fireEvent.click(screen.getByLabelText('Show offline instances'));
    expect(screen.getByText('Agent 2')).toBeInTheDocument();
  });

  it('persists hide-offline preference in localStorage', () => {
    render(<InstancesPanel instances={mockInstances} />);
    fireEvent.click(screen.getByLabelText('Hide offline instances'));
    expect(localStorage.getItem('instancesPanel.hideOffline')).toBe('true');
  });

  it('renders refresh button when onRefresh prop provided', () => {
    render(<InstancesPanel instances={mockInstances} onRefresh={vi.fn()} />);
    expect(screen.getByLabelText('Refresh instance list')).toBeInTheDocument();
  });

  it('does not render refresh button without onRefresh prop', () => {
    render(<InstancesPanel instances={mockInstances} />);
    expect(screen.queryByLabelText('Refresh instance list')).not.toBeInTheDocument();
  });

  it('calls onRefresh when refresh button is clicked', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<InstancesPanel instances={mockInstances} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByLabelText('Refresh instance list'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });
});
