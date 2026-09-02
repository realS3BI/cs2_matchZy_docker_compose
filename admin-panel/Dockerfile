FROM node:22-alpine

RUN apk add --no-cache docker-cli docker-cli-compose
RUN corepack enable pnpm

WORKDIR /app

COPY admin-panel/package.json admin-panel/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY admin-panel/src ./src
COPY admin-panel/test ./test
COPY admin-panel/client ./client
COPY admin-panel/tsconfig*.json ./
RUN pnpm run build && pnpm prune --prod

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "build/src/server.js"]
