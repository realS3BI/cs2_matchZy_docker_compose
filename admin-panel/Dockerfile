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

CMD ["node", "build/src/server.js"]
