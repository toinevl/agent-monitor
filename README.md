# Agent Monitor

A graphical dashboard for monitoring multi-agent orchestration systems.
Built with Vite + React + React Flow.

## Quick Start

```bash
# Install dependencies (use pnpm — npm has an issue in this environment)
pnpm install

# Start dev server
pnpm run dev
```

Then open http://localhost:5173

## What You're Looking At

The mockup shows a 3-agent setup:
- 🧠 **Orchestrator** — breaks down tasks, assigns to sub-agents
- 🔍 **Investigator** — researches and returns findings
- ⚙️ **Worker(s)** — execute tasks (write, edit, call APIs, etc.)

Click any node to see its task + live logs in the side panel.

## Next Steps (after mockup)

1. **Backend bridge** — small Node/Express server that polls OpenClaw session state
2. **WebSocket stream** — push real-time status updates to the frontend
3. **Wire up React Flow nodes** to live agent data
4. **Azure deployment** — `pnpm run build` → deploy `/dist` to Azure Static Web Apps

## Project Structure

```
src/
  App.jsx        — main layout, graph + panel
  AgentNode.jsx  — custom React Flow node component
  LogPanel.jsx   — side panel with logs + task info
  mockData.js    — fake agent data for the mockup
```
