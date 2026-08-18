# =====================================================
# GUIDON — obraz produkcyjny
# =====================================================
#
# Wieloetapowy: zależności → build → runtime. Etap runtime nie zawiera
# ani kodu źródłowego, ani devDependencies, ani menedżera pakietów.
#
#   docker build -t guidon .
#   docker run -p 3000:3000 --env-file .env guidon
#
# Zwykle uruchamiany przez docker-compose.yml — patrz docs/self-hosting.md.

# -----------------------------------------------------
# 1. Zależności
# -----------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Instalacja z lockfile'a, bez skryptów — build nie może wykonywać
# postinstall z zależności (§10: self-hosting to wdrożenie wrażliwe).
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# -----------------------------------------------------
# 2. Build
# -----------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Zmienne NEXT_PUBLIC_* są wkompilowywane w bundle klienta, więc muszą
# istnieć w czasie builda. Przekazywane jako build args, nie zaszyte.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_AUTH_PROVIDERS
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_AUTH_PROVIDERS=$NEXT_PUBLIC_AUTH_PROVIDERS

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# -----------------------------------------------------
# 3. Runtime
# -----------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Nie uruchamiamy jako root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs guidon

COPY --from=builder /app/public ./public
# standalone zawiera tylko moduły faktycznie importowane przez serwer
COPY --from=builder --chown=guidon:nodejs /app/.next/standalone ./
COPY --from=builder --chown=guidon:nodejs /app/.next/static ./.next/static

# Migracje i runner są potrzebne w runtime: `docker compose run migrate`
# stosuje je przed startem aplikacji (§13, §15).
COPY --from=builder --chown=guidon:nodejs /app/scripts ./scripts
COPY --from=builder --chown=guidon:nodejs /app/src/db/migrations ./src/db/migrations
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=deps --chown=guidon:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=deps --chown=guidon:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=deps --chown=guidon:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=deps --chown=guidon:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=deps --chown=guidon:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=deps --chown=guidon:nodejs /app/node_modules/split2 ./node_modules/split2

# Katalog na pliki przy STORAGE_PROVIDER=local. W compose montowany jako
# wolumen — bez tego uploady znikają przy restarcie (§30).
RUN mkdir -p /app/storage && chown guidon:nodejs /app/storage

USER guidon
EXPOSE 3000

# Sonda korzysta z /api/health, który celowo nie wymaga uwierzytelnienia (§12).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
