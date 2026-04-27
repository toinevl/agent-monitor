# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.29.3

# Copy workspace manifests before install for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY backend/package.json ./backend/
COPY local-pusher/package.json ./local-pusher/
RUN pnpm install --frozen-lockfile

COPY . .

# Build frontend (backend URL = same origin, relative paths)
ARG BUILD_SHA=""
ENV VITE_BACKEND_HTTP=""
ENV VITE_BACKEND_WS=""
ENV VITE_BUILD_SHA=$BUILD_SHA
RUN pnpm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
ARG BUILD_SHA=""
ENV BUILD_SHA=$BUILD_SHA

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./backend/
RUN cd backend && npm install --production

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend (vite outputs to client/dist)
COPY --from=builder /app/client/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy results dir placeholder (for report)
RUN mkdir -p /home/node/.openclaw/workspace/agents/results && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app /home/node/.openclaw

USER nodejs

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production
# Required environment variables — must be set at runtime (e.g. via Azure Container Apps secrets):
# PUSH_SECRET                    — secret for /api/push  (local pusher)
# BEACON_SECRET                  — secret for /api/beacon (instance beacon skill)
# AZURE_STORAGE_CONNECTION_STRING — Azure Table Storage connection string

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/api/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "backend/server.js"]
