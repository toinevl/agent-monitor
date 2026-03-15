# ---- Build stage ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Install frontend dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

# Copy source and build frontend
# VITE_API_URL="" → relative URLs so frontend calls /api/... on same origin
COPY . .
ENV VITE_API_URL=""
RUN pnpm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime

WORKDIR /app

# Install backend dependencies (production only)
COPY backend/package.json ./backend/
RUN cd backend && npm install --production

# Copy backend source and built frontend
COPY backend/ ./backend/
COPY --from=builder /app/dist ./dist

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "backend/server.js"]
