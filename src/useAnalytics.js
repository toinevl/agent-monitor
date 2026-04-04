import { useState, useEffect, useCallback } from 'react';

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP ||
  (import.meta.env.PROD ? '' : 'http://localhost:3001');

/**
 * Hook to fetch session statistics for a given date
 * Returns: { stats, loading, error, refetch }
 */
export function useSessionStats(date = new Date()) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async (targetDate) => {
    setLoading(true);
    setError(null);
    try {
      const dateStr = targetDate.toISOString().split('T')[0];
      const response = await fetch(`${BACKEND_HTTP}/api/sessions/stats?date=${dateStr}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err.message);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(date);
  }, [date, fetchStats]);

  return { stats, loading, error, refetch: () => fetchStats(date) };
}

/**
 * Hook to fetch session history for a date range
 * Returns: { snapshots, loading, error, refetch }
 */
export function useSessionHistory(startDate, endDate) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      const response = await fetch(
        `${BACKEND_HTTP}/api/sessions/history?start=${startStr}&end=${endStr}`
      );
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setSnapshots(data.snapshots || []);
    } catch (err) {
      setError(err.message);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(startDate, endDate);
  }, [startDate, endDate, fetchHistory]);

  return { snapshots, loading, error, refetch: () => fetchHistory(startDate, endDate) };
}

/**
 * Hook to compute cost metrics from instance beacons
 * Estimates API costs based on model pricing
 * Returns: { dailyCost, monthlyCost, costByInstance }
 */
export function useCostMetrics(instances = []) {
  // Simplified pricing model (update with actual rates)
  const PRICING = {
    'anthropic/claude-opus-4-6': { input: 0.015, output: 0.045 },
    'anthropic/claude-sonnet-4-6': { input: 0.003, output: 0.015 },
    'anthropic/claude-haiku-4-5': { input: 0.0008, output: 0.004 },
  };

  const estimateCost = useCallback((instance) => {
    const model = instance.model || 'anthropic/claude-sonnet-4-6';
    const pricing = PRICING[model] || PRICING['anthropic/claude-sonnet-4-6'];

    // Rough estimate: avg session = 5k input, 2k output tokens
    const sessionsPerDay = instance.activeSessions || 0;
    const avgInputTokens = 5000;
    const avgOutputTokens = 2000;

    const inputCost = (sessionsPerDay * avgInputTokens * pricing.input) / 1000;
    const outputCost = (sessionsPerDay * avgOutputTokens * pricing.output) / 1000;

    return inputCost + outputCost;
  }, []);

  const dailyCost = instances.reduce((sum, inst) => sum + estimateCost(inst), 0);
  const monthlyCost = dailyCost * 30;
  const costByInstance = instances.map(inst => ({
    instanceId: inst.instanceId,
    label: inst.label || inst.instanceId,
    cost: estimateCost(inst),
  }));

  return { dailyCost, monthlyCost, costByInstance };
}

/**
 * Hook to aggregate metrics from instances and sessions
 * Returns: { metrics, loading }
 */
export function useMetrics(instances = [], stats = null) {
  const [metrics, setMetrics] = useState({
    totalInstances: 0,
    onlineInstances: 0,
    totalActiveSessions: 0,
    totalAgents: 0,
    avgSessionDuration: 0,
    avgAgentCount: 0,
    maxAgentCount: 0,
  });

  useEffect(() => {
    const onlineCount = instances.filter(i => i.online).length;
    const totalSessions = instances.reduce((sum, i) => sum + (i.activeSessions || 0), 0);
    const totalAgents = instances.reduce((sum, i) => sum + (i.agents?.length || 0), 0);

    setMetrics({
      totalInstances: instances.length,
      onlineInstances: onlineCount,
      totalActiveSessions: totalSessions,
      totalAgents,
      avgAgentCount: stats?.avgAgentCount || 0,
      maxAgentCount: stats?.maxAgentCount || 0,
    });
  }, [instances, stats]);

  return metrics;
}
