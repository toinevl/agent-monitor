export type AgentStatus = 'running' | 'done' | 'idle' | 'error';
export type AgentType = 'orchestrator' | 'investigator' | 'worker';

export interface Agent {
  id: string;
  type: AgentType;
  label: string;
  status: AgentStatus;
  task: string;
  startedAt: string | null;
  logs: string[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export const mockAgents: Agent[] = [
  {
    id: 'orchestrator-1',
    type: 'orchestrator',
    label: 'Orchestrator',
    status: 'running',
    task: 'Analyzing user request and delegating tasks',
    startedAt: '17:42:10',
    logs: [
      '17:42:10 Task received: Research competitors and write report',
      '17:42:11 Spawning Investigator agent...',
      '17:42:12 Spawning Worker agent...',
      '17:43:05 Investigator returned 3 sources',
      '17:43:06 Delegating write task to Worker...',
    ],
  },
  {
    id: 'investigator-1',
    type: 'investigator',
    label: 'Investigator',
    status: 'done',
    task: 'Research competitor landscape',
    startedAt: '17:42:12',
    logs: [
      '17:42:12 Starting research task',
      '17:42:15 Searching web: "top AI assistant platforms 2025"',
      '17:42:30 Found 5 results, filtering relevant...',
      '17:43:00 Extracted data from 3 sources',
      '17:43:05 Returning findings to Orchestrator',
    ],
  },
  {
    id: 'worker-1',
    type: 'worker',
    label: 'Worker',
    status: 'running',
    task: 'Write competitor analysis report',
    startedAt: '17:43:06',
    logs: [
      '17:43:06 Received task from Orchestrator',
      '17:43:07 Loading investigator findings...',
      '17:43:10 Drafting report structure',
      '17:43:20 Writing section 1/3: Overview',
    ],
  },
  {
    id: 'worker-2',
    type: 'worker',
    label: 'Worker 2',
    status: 'idle',
    task: 'Awaiting assignment',
    startedAt: null,
    logs: [
      '17:42:13 Spawned, waiting for task...',
    ],
  },
];

export const mockEdges: Edge[] = [
  { id: 'e1', source: 'orchestrator-1', target: 'investigator-1', label: 'assigned' },
  { id: 'e2', source: 'orchestrator-1', target: 'worker-1', label: 'assigned' },
  { id: 'e3', source: 'orchestrator-1', target: 'worker-2', label: 'spawned' },
  { id: 'e4', source: 'investigator-1', target: 'orchestrator-1', label: 'returned data' },
];
