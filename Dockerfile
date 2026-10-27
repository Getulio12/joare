# syntax=docker/dockerfile:1
FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:24.19.0-bookworm-slim AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    PUBLIC_MODE=true \
    DATABASE_PATH=/var/data/joare.sqlite
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node server ./server
RUN mkdir -p /var/data && chown node:node /var/data
USER node
VOLUME ["/var/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server/index.mjs"]
