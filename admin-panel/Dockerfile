FROM node:22-alpine

RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /app

COPY admin-panel/package*.json ./
RUN npm ci

COPY admin-panel/src ./src
COPY admin-panel/client ./client
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
