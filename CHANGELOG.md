# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] — Phase 3: Analytics Dashboard & Modern Charts — 2026-03-29

### Added

#### Analytics Dashboard (Dashboard.jsx)
- **New tab:** "📊 Dashboard" with comprehensive analytics and KPIs
- **Metrics cards** with real-time statistics:
  - Total instances with online/offline breakdown
  - Active sessions and agent counts
  - Max agent count (24h) with average comparison
  - Estimated daily and monthly costs
- **Modern chart visualizations:**
  - **Line chart** — Agent activity trends (animated, responsive)
  - **Bar chart** — Cost estimates per instance (top 5)
  - **Doughnut chart** — Instance status distribution
  - **Stats grid** — Min/max/avg agent counts + snapshot metrics
- **Interactive controls:**
  - Date range selector (24h, 7d, 30d quick options)
  - Datepicker for point-in-time analysis
  - Automatic data refresh with loading indicators
- **Alerts system:**
  - Real-time alerts for offline instances
  - Color-coded severity levels
  - Dismissible notification cards
- **Responsive layout:**
  - CSS Grid auto-fit for different screen sizes
  - Professional dark theme (Slate color palette)
  - Proper contrast and visual hierarchy

#### Analytics Hooks (useAnalytics.js)
- **useSessionStats()** — Fetch daily aggregated statistics
  - Returns: avgAgentCount, maxAgentCount, minAgentCount, snapshotCount
  - Configurable date parameter
  - Automatic refetch capability

- **useSessionHistory()** — Retrieve session snapshots for date range
  - Multi-day query support
  - Sorted by timestamp (newest first)
  - Full state reconstruction for each snapshot

- **useCostMetrics()** — Automatic cost estimation engine
  - Supports 3 model tiers: Opus, Sonnet, Haiku
  - Token-based pricing: input (cheaper) + output (more expensive)
  - Per-instance daily cost calculation
  - Aggregated daily/monthly totals
  - Estimation formula: sessions/day × avg tokens × model rate

- **useMetrics()** — Aggregate metrics computation
  - Instance counts: total, online, offline
  - Session counts: active
  - Agent counts: total, average (from stats)
  - Memoized for performance

#### Chart.js Integration
- **Dependencies added:**
  - `chart.js@^4.4.1` — Modern charting library
  - `react-chartjs-2@^5.2.0` — React component wrapper
  - `date-fns@^3.3.1` — Lightweight date utilities
- **Theme support:**
  - Dark mode color scheme (blue/cyan/yellow/red)
  - Responsive sizing with maintained aspect ratio
  - Custom grid lines and axis styling
  - Legend properly positioned and styled

#### Frontend Navigation
- **App.jsx updates:**
  - New "📊 Dashboard" tab (middle position)
  - Tab ordering: Sessions → Dashboard → Instances
  - Stats header shows for both Sessions and Dashboard tabs
  - Proper tab state management (three states)

### Changed

#### package.json
- Added 3 new dependencies (chart, react-chartjs-2, date-fns)
- No version bumps for existing packages
- Minimal bundle impact (chart.js is lightweight)

#### App.jsx Structure
- Tab state expanded: 'sessions' | 'dashboard' | 'instances'
- Header stats conditional rendering updated
- Main content section refactored for third tab
- Navigation integration seamless

### Architecture

- **Client-side cost calculation** — No backend impact, instant results
- **Lazy evaluation** — Charts only render when tab is active
- **Separated concerns** — Analytics logic in useAnalytics hook, UI in Dashboard
- **Time-series ready** — Can scale to historical data in future

### Performance

- ✅ Chart.js rendering optimized
- ✅ React.useCallback memoization on analytics functions
- ✅ CSS Grid layout (GPU-accelerated)
- ✅ Date calculations lightweight with date-fns
- ✅ Lazy chart initialization (on tab click)

### Backward Compatibility

- ✅ All existing tabs fully functional
- ✅ No API changes
- ✅ Dashboard is purely additive feature
- ✅ Sessions and Instances tabs unchanged
- ✅ Graceful degradation if analytics data unavailable

### Testing

- Chart rendering with sample data
- Date range selection (24h, 7d, 30d)
- Cost calculation accuracy
- Responsive layout on different resolutions
- Error handling when endpoints unavailable

### Future Enhancements

- [ ] Cost model customization UI
- [ ] Export dashboard as PDF/PNG
- [ ] Real-time metric streaming (WebSocket)
- [ ] Custom alerts (cost threshold, uptime %)
- [ ] Metric history persistence (trending)
- [ ] Advanced filtering on charts (by model, status, etc.)

---

## [0.3.0] — Phase 2: Session History & Fleet Analytics — 2026-03-29

### Added

#### Session History Persistence (sessionHistory.js)
- **Module:** `backend/sessionHistory.js` — Time-series storage for agent sessions
  - Automatic snapshots on each `/api/push` (async, non-blocking)
  - Azure Table Storage backend (date-partitioned for efficient querying)
  - JSON fallback for local development (`data/sessions.json`)
  - Configurable retention (default 30 days)
  - Public API: `storeSessionSnapshot()`, `getSessionHistory()`, `getSessionStats()`, `pruneOldSessions()`

#### New API Endpoints
- **`GET /api/sessions/history`** — Retrieve session snapshots for a date range
  - Query: `?start=2026-03-29&end=2026-03-30`
  - Returns: Array of snapshots (timestamp, agentCount, edgeCount, full state)
  - Useful for: Replaying agent activity, trend analysis, post-mortems
  
- **`GET /api/sessions/stats`** — Daily session statistics
  - Query: `?date=2026-03-29` (optional, defaults to today)
  - Returns: avgAgentCount, maxAgentCount, minAgentCount, snapshotCount
  - Useful for: Dashboards, reporting, capacity planning

#### Fleet Management Enhancements (InstancesPanel.jsx)
- **Search** — Filter instances by label, instanceId, or version in real-time
- **Status filter** — Quick toggle between online, offline, or all instances
- **Sorting** — Sort by:
  - Last seen (default, newest first)
  - Status (online first)
  - Name (alphabetical)
  - Active sessions (descending)
- **Pagination** — 12 instances per page with prev/next navigation
- **Result counter** — Shows filtered count vs. total instances
- **Better UX** — Search input with clear button, responsive toolbar

#### Documentation Updates
- **README.md:** New Phase 2 section explaining session history and fleet management
- **API Reference:** Expanded table with new endpoints
- **Session History guide:** Query examples and use cases

### Changed

#### server.js (Session History Integration)
- Import and use `sessionHistory.js` module
- On each `/api/push`, async store snapshot (doesn't block response)
- Log events when snapshots are stored/retrieved
- Error handling for storage failures (logged but non-fatal)

#### Backend Architecture
- Cleaner separation: sessions are now **dual-modeled**
  - **In-memory:** `pushedState` for live WebSocket broadcasts (ephemeral)
  - **Persistent:** Session history for analytics and auditing
  - Both models serve different purposes, no duplication

### Backward Compatibility

- ✅ All existing endpoints unchanged
- ✅ `/api/push` payload format unchanged
- ✅ WebSocket message types unchanged
- ✅ No frontend breaking changes (InstancesPanel is backward compatible)
- ✅ Session history is opt-in (works with or without Azure Storage configured)

### Performance

- ✅ Session snapshots stored asynchronously (non-blocking `/api/push`)
- ✅ Azure Table Storage queries are efficient (date-partitioned)
- ✅ Frontend search/filter/sort computed with React.useMemo (no unnecessary recalculations)
- ✅ Pagination reduces DOM nodes (12 items per page instead of N)

### Migration Guide

**For existing deployments:**

1. No breaking changes — update and redeploy
2. Session history will start being collected immediately
3. Old sessions (before upgrade) won't be in history
4. Configure retention period if needed (default 30 days is fine)
5. Optional: Set up Azure Table Storage for durable history (else uses JSON)

**New env vars (optional):**
- `SESSION_RETENTION_DAYS` — Days to keep session history (default 30)

---

## [0.2.0] — Phase 1: Hardening — 2026-03-29

### Added

#### Structured Logging (Pino)
- **logger.js**: Structured logging with Pino for all requests and events
  - Pretty-printed output in development (colored, human-readable)
  - JSON output in production (compatible with Azure Log Analytics, ELK stacks)
  - Separate loggers for events, errors, and HTTP middleware
- **Middleware integration**: All HTTP endpoints now logged with request/response metadata
- **WebSocket logging**: Connection/disconnection events logged with client count

#### Request Validation (Zod)
- **validation.js**: Strong payload validation for all incoming requests
  - `pushPayloadSchema`: Validates agent state (agents array, edges array, agents types)
  - `beaconPayloadSchema`: Validates instance beacon (instanceId required, optional fields typed)
  - Detailed error messages for invalid payloads (field path + error reason)
- **API responses**: Invalid payloads now return 400 with structured error details

#### Rate Limiting
- **middleware.js**: Per-endpoint rate limiters using express-rate-limit
  - `/api/push`: 60 requests/min (1 push/sec average)
  - `/api/beacon`: 30 requests/min (account for fleet heartbeats)
  - Proper RateLimit headers in responses
  - Logs rate limit violations with IP and endpoint
- **Graceful degradation**: Rate limit errors don't count against limit itself

#### WebSocket Authentication
- **middleware.js**: Token-based WebSocket auth (optional, backward-compatible)
  - Extract token from query string: `ws://host/?token=abc123`
  - If `WS_TOKEN` env var not set, allows all connections (default, no breaking change)
  - Logs unauthorized connection attempts with source IP
- **server.js**: Rejects unauthorized WebSocket connections with 1008 close code

#### Configuration Management
- **.env.example**: Template for all environment variables with descriptions
- **Env var documentation**: PUSH_SECRET, BEACON_SECRET, WS_TOKEN, AZURE_STORAGE_CONNECTION_STRING, etc.
- **Production security warnings**: Logs warn messages if using default secrets in production
- **Configurable report path**: REPORT_BASE_DIR env var (was hardcoded before)

#### Enhanced Error Handling
- **server.js**: Global error handler middleware for uncaught exceptions
- **Consistent error responses**: All errors return structured JSON with error message
- **Error logging**: Full error context logged (stack trace, request metadata)
- **Storage layer**: Try-catch blocks in report file reads with error logging

#### API Improvements
- **Response enrichment**: Endpoints now return more useful data
  - `/api/push` returns `broadcastTo` (number of clients reached)
  - `/api/health` includes `connectedClients` count and timestamp
  - `/api/report` includes `reportPath` for debugging
- **New endpoint metadata**: All endpoints logged with method, path, auth status
- **Request validation**: Checks for missing/invalid fields before processing

#### Documentation
- **backend/README.md**: Comprehensive guide covering:
  - Quick start (dev setup)
  - All environment variables documented with defaults
  - Full API reference with curl examples
  - WebSocket connection guide with JavaScript example
  - Logging explanation (development vs. production formats)
  - Development tips (testing endpoints, debugging)
  - Troubleshooting section
  - Deployment instructions

### Changed

#### server.js (Major refactor)
- Imports reorganized (utility imports at top)
- Rate limiting applied to `/api/push` and `/api/beacon`
- Auth checks delegated to middleware layer (cleaner)
- Validation checks with Zod schemas (before processing)
- Console.log statements replaced with structured logger
- WebSocket connections now tracked (connectedClients counter)
- WebSocket close/error handlers with logging
- Report path now configurable via REPORT_BASE_DIR env var
- Hardcoded "/home/node/.openclaw/..." replaced with env var

#### instances.js (Minor improvements)
- Error handling in file operations now logged via logger context
- No API changes (backward compatible)

#### package.json
- Added dependencies: `express-rate-limit`, `pino`, `pino-http`, `zod`
- No breaking changes to existing dependencies

### Security

- ✅ Rate limiting prevents abuse of `/api/push` and `/api/beacon`
- ✅ WebSocket can now be authenticated with token (optional)
- ✅ All invalid requests logged with source IP
- ✅ Default secrets flagged in production logs
- ✅ CORS remains enabled (can be restricted further if needed)

### Backward Compatibility

- ✅ All existing API contracts unchanged
- ✅ WebSocket auth is optional (doesn't break existing clients)
- ✅ Fallback to JSON storage still works (Azure Tables optional)
- ✅ Existing beacon/push payloads still work (validation is permissive on optional fields)

---

## [0.1.0] — Initial Release

### Added

- React Flow-based agent session visualization
- WebSocket real-time updates
- Azure Container Apps deployment
- Instance beacon registration
- Markdown report integration
- Tab-based navigation (Sessions / Instances / Reports)

### Added

#### Structured Logging (Pino)
- **logger.js**: Structured logging with Pino for all requests and events
  - Pretty-printed output in development (colored, human-readable)
  - JSON output in production (compatible with Azure Log Analytics, ELK stacks)
  - Separate loggers for events, errors, and HTTP middleware
- **Middleware integration**: All HTTP endpoints now logged with request/response metadata
- **WebSocket logging**: Connection/disconnection events logged with client count

#### Request Validation (Zod)
- **validation.js**: Strong payload validation for all incoming requests
  - `pushPayloadSchema`: Validates agent state (agents array, edges array, agents types)
  - `beaconPayloadSchema`: Validates instance beacon (instanceId required, optional fields typed)
  - Detailed error messages for invalid payloads (field path + error reason)
- **API responses**: Invalid payloads now return 400 with structured error details

#### Rate Limiting
- **middleware.js**: Per-endpoint rate limiters using express-rate-limit
  - `/api/push`: 60 requests/min (1 push/sec average)
  - `/api/beacon`: 30 requests/min (account for fleet heartbeats)
  - Proper RateLimit headers in responses
  - Logs rate limit violations with IP and endpoint
- **Graceful degradation**: Rate limit errors don't count against limit itself

#### WebSocket Authentication
- **middleware.js**: Token-based WebSocket auth (optional, backward-compatible)
  - Extract token from query string: `ws://host/?token=abc123`
  - If `WS_TOKEN` env var not set, allows all connections (default, no breaking change)
  - Logs unauthorized connection attempts with source IP
- **server.js**: Rejects unauthorized WebSocket connections with 1008 close code

#### Configuration Management
- **.env.example**: Template for all environment variables with descriptions
- **Env var documentation**: PUSH_SECRET, BEACON_SECRET, WS_TOKEN, AZURE_STORAGE_CONNECTION_STRING, etc.
- **Production security warnings**: Logs warn messages if using default secrets in production
- **Configurable report path**: REPORT_BASE_DIR env var (was hardcoded before)

#### Enhanced Error Handling
- **server.js**: Global error handler middleware for uncaught exceptions
- **Consistent error responses**: All errors return structured JSON with error message
- **Error logging**: Full error context logged (stack trace, request metadata)
- **Storage layer**: Try-catch blocks in report file reads with error logging

#### API Improvements
- **Response enrichment**: Endpoints now return more useful data
  - `/api/push` returns `broadcastTo` (number of clients reached)
  - `/api/health` includes `connectedClients` count and timestamp
  - `/api/report` includes `reportPath` for debugging
- **New endpoint metadata**: All endpoints logged with method, path, auth status
- **Request validation**: Checks for missing/invalid fields before processing

#### Documentation
- **backend/README.md**: Comprehensive guide covering:
  - Quick start (dev setup)
  - All environment variables documented with defaults
  - Full API reference with curl examples
  - WebSocket connection guide with JavaScript example
  - Logging explanation (development vs. production formats)
  - Development tips (testing endpoints, debugging)
  - Troubleshooting section
  - Deployment instructions

### Changed

#### server.js (Major refactor)
- Imports reorganized (utility imports at top)
- Rate limiting applied to `/api/push` and `/api/beacon`
- Auth checks delegated to middleware layer (cleaner)
- Validation checks with Zod schemas (before processing)
- Console.log statements replaced with structured logger
- WebSocket connections now tracked (connectedClients counter)
- WebSocket close/error handlers with logging
- Report path now configurable via REPORT_BASE_DIR env var
- Hardcoded "/home/node/.openclaw/..." replaced with env var

#### instances.js (Minor improvements)
- Error handling in file operations now logged via logger context
- No API changes (backward compatible)

#### package.json
- Added dependencies: `express-rate-limit`, `pino`, `pino-http`, `zod`
- No breaking changes to existing dependencies

### Security

- ✅ Rate limiting prevents abuse of `/api/push` and `/api/beacon`
- ✅ WebSocket can now be authenticated with token (optional)
- ✅ All invalid requests logged with source IP
- ✅ Default secrets flagged in production logs
- ✅ CORS remains enabled (can be restricted further if needed)

### Performance

- ✅ Pino logging is optimized for production (async, minimal overhead)
- ✅ Rate limiting uses in-memory store (suitable for single-container Azure deployments)
- ✅ Validation is fast (Zod is performant, fails early on bad data)
- ✅ Request logging doesn't block responses

### Backward Compatibility

- ✅ All existing API contracts unchanged
- ✅ WebSocket auth is optional (doesn't break existing clients)
- ✅ Fallback to JSON storage still works (Azure Tables optional)
- ✅ Existing beacon/push payloads still work (validation is permissive on optional fields)

### Migration Guide

**For existing deployments:**

1. Update dependencies:
   ```bash
   npm install
   ```

2. Configure new env vars (optional):
   ```bash
   export LOG_LEVEL=info
   export WS_TOKEN=your-token  # Only if you want WebSocket auth
   ```

3. Generate new secrets (recommended):
   ```bash
   openssl rand -base64 32  # For PUSH_SECRET
   openssl rand -base64 32  # For BEACON_SECRET
   ```

4. No frontend changes required (all improvements are backend-only)

---

## [0.1.0] — Initial Release

### Added

- React Flow-based agent session visualization
- WebSocket real-time updates
- Azure Container Apps deployment
- Instance beacon registration
- Markdown report integration
- Tab-based navigation (Sessions / Instances / Reports)
