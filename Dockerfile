# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.29.3

# Copy frontend files
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build frontend (backend URL = same origin, relative paths)
ENV VITE_BACKEND_HTTP=""
ENV VITE_BACKEND_WS=""
RUN pnpm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime

WORKDIR /app

# Install backend dependencies
COPY backend/package.json ./backend/
RUN cd backend && npm install --production

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend
COPY --from=builder /app/dist ./dist

# Copy results dir placeholder (for report)
RUN mkdir -p /home/node/.openclaw/workspace/agents/results

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production
# Required environment variables — must be set at runtime (e.g. via Azure Container Apps secrets):
# PUSH_SECRET                    — secret for /api/push  (local pusher)
# BEACON_SECRET                  — secret for /api/beacon (instance beacon skill)
# AZURE_STORAGE_CONNECTION_STRING — Azure Table Storage connection string

# data/ used only as local dev fallback (Azure Table Storage used in prod)
RUN mkdir -p /app/data

CMD ["node", "backend/server.js"]
