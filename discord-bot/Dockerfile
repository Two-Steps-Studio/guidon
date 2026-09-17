# =====================================================
# GUIDON DISCORD BOT — production image
# =====================================================
#
# Same multi-stage shape as the main app's own Dockerfile: deps -> build ->
# runtime, so the final image carries neither source nor devDependencies.
#
#   docker build -t guidon-discord-bot .
#   docker run --env-file .env guidon-discord-bot
#
# Long-running process (discord.js needs a persistent Gateway connection) -
# this is not a request/response server, don't put it behind a reverse proxy
# or expect a health-check port; there isn't one.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
