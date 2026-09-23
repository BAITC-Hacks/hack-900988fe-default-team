FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3388
ENV DATABASE_URL=file:/app/data/hackalem.db

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir /app/data && chown -R node:node /app

USER node
EXPOSE 3388

CMD ["node", "src/server.js"]
