import { useState, useEffect, useCallback } from 'react';
import type { Instance } from './useAgentState';

export interface SessionStats {
  date: string;
  totalSessions: number;
  avgAgentCount: number;
  maxAgentCount: number;
  totalTokens?: number;
  totalCost?: number;
}

export interface SessionSnapshot {
  sessionId: string;
  date: string;
  timestamp: number;
  agentCount: number;
  tokens?: number;
  cost?: number;
}

export interface CostByInstance {
  instanceId: string;
  label: string;
  cost: number;
}

export interface CostMetrics {
  dailyCost: number;
  monthlyCost: number;
  costByInstance: CostByInstance[];
}

export interface Metrics {
  totalInstances: number;
  onlineInstances: number;
  totalActiveSessions: number;
  totalAgents: number;
  avgAgentCount: number;
  maxAgentCount: number;
}

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

const PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-opus-4-6':    { input: 0.015,  output: 0.045 },
  'anthropic/claude-sonnet-4-6':  { input: 0.003,  output: 0.015 },
  'anthropic/claude-haiku-4-5':   { input: 0.0008, output: 0.004 },
};

export function useSessionStats(date: Date = new Date()): {
  stats: SessionStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [stats, setStats]     = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchStats = useCallback(async (targetDate: Date): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const dateStr = targetDate.toISOString().split('T')[0];
      const response = await fetch(`${BACKEND_HTTP}/api/sessions/stats?date=${dateStr}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      setStats(await response.json());
    } catch (err) {
      setError((err as Error).message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(date); }, [date, fetchStats]);

  return { stats, loading, error, refetch: () => fetchStats(date) };
}

export function useSessionHistory(startDate: Date, endDate: Date): {
  snapshots: SessionSnapshot[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>([]);
  const [loading, setLoading]     = useState<boolean>(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchHistory = useCallback(async (start: Date, end: Date): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const s = start.toISOString().split('T')[0];
      const e = end.toISOString().split('T')[0];
      const response = await fetch(`${BACKEND_HTTP}/api/sessions/history?start=${s}&end=${e}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setSnapshots(data.snapshots || []);
    } catch (err) {
      setError((err as Error).message);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(startDate, endDate); }, [startDate, endDate, fetchHistory]);

  return { snapshots, loading, error, refetch: () => fetchHistory(startDate, endDate) };
}

export function useCostMetrics(instances: Instance[] = []): CostMetrics {
  const estimateCost = useCallback((instance: Instance): number => {
    const model = instance.model || 'anthropic/claude-sonnet-4-6';
    const pricing = PRICING[model] || PRICING['anthropic/claude-sonnet-4-6'];
    const sessionsPerDay  = instance.activeSessions || 0;
    const inputCost  = (sessionsPerDay * 5000 * pricing.input)  / 1000;
    const outputCost = (sessionsPerDay * 2000 * pricing.output) / 1000;
    return inputCost + outputCost;
  }, []);

  const dailyCost = instances.reduce((sum, inst) => sum + estimateCost(inst), 0);

  return {
    dailyCost,
    monthlyCost: dailyCost * 30,
    costByInstance: instances.map(inst => ({
      instanceId: inst.instanceId,
      label: inst.label || inst.instanceId,
      cost: estimateCost(inst),
    })),
  };
}

export function useMetrics(instances: Instance[] = [], stats: SessionStats | null = null): Metrics {
  const [metrics, setMetrics] = useState<Metrics>({
    totalInstances: 0,
    onlineInstances: 0,
    totalActiveSessions: 0,
    totalAgents: 0,
    avgAgentCount: 0,
    maxAgentCount: 0,
  });

  useEffect(() => {
    setMetrics({
      totalInstances:      instances.length,
      onlineInstances:     instances.filter(i => i.online).length,
      totalActiveSessions: instances.reduce((s, i) => s + (i.activeSessions || 0), 0),
      totalAgents:         instances.reduce((s, i) => s + (i.agents?.length || 0), 0),
      avgAgentCount:       stats?.avgAgentCount || 0,
      maxAgentCount:       stats?.maxAgentCount || 0,
    });
  }, [instances, stats]);

  return metrics;
}
