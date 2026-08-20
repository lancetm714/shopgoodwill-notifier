# Build stage
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

ENV PORT=7823
EXPOSE 7823

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:7823/api/overview || exit 1

# config.json and data/ are provided via mounted volumes.
# A default config is shipped so the container can start before volumes are set.
COPY config.docker.json ./config.json

CMD ["node", "dist/server.js"]
