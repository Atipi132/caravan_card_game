# syntax=docker/dockerfile:1
# Caravan – single image: Node server serving the built client + the Socket.IO game server.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY apps/server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/server/dist/index.js ./index.js
COPY --from=build /app/apps/client/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "index.js"]
