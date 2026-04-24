FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install --frozen-lockfile --prod
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
