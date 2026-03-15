# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy frontend files
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

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

CMD ["node", "backend/server.js"]
