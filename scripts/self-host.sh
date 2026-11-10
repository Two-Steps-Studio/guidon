#!/bin/sh
# Run Guidon on your own server with Docker Compose.
#
#   ./scripts/self-host.sh                  install or start (first run writes .env)
#   ./scripts/self-host.sh update           back up, pull the latest code, rebuild, migrate, restart
#   ./scripts/self-host.sh backup           database + roles + uploaded files + .env into backups/<date>/
#   ./scripts/self-host.sh restore <dir>    replace everything with a backup (asks first)
#
# First run: writes .env from .env.example with random secrets and the
# self-hosted settings (local file storage, no Supabase), then builds and
# starts the stack and waits until it answers. Later runs keep your .env.
set -eu
cd "$(dirname "$0")/.."

command -v docker >/dev/null 2>&1 || { echo "Docker is required: https://docs.docker.com/get-docker/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required (docker compose ...)." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }

# KEY=VALUE in .env: replaced if present, appended if not. Values here are hex
# or URLs, so no sed escaping is needed.
set_var() {
  if grep -q "^$1=" .env; then
    sed "s|^$1=.*|$1=$2|" .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
get_var() { v=$(sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1); echo "${v:-$2}"; }
random_hex() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

write_env() {
  port=${APP_PORT:-3000}
  url=${GUIDON_URL:-http://localhost:$port}
  cp .env.example .env
  set_var POSTGRES_PASSWORD "$(random_hex)"
  set_var AUTH_SECRET "$(random_hex)"
  set_var APP_PORT "$port"
  set_var APP_URL "$url"
  set_var NEXT_PUBLIC_APP_URL "$url"
  # Self-hosted: your own Postgres (DATABASE_URL is set by docker-compose.yml)
  # and files on a volume - the example file's Supabase placeholders would
  # otherwise be used.
  set_var STORAGE_PROVIDER local
  set_var NEXT_PUBLIC_SUPABASE_URL ""
  set_var NEXT_PUBLIC_SUPABASE_ANON_KEY ""
  set_var SUPABASE_SERVICE_ROLE_KEY ""
  set_var SUPABASE_JWT_SECRET ""
  chmod 600 .env
  echo "Created .env with random secrets (keep it private; it is not committed)."
}

wait_healthy() {
  port=$(get_var APP_PORT 3000)
  printf 'Waiting for Guidon on http://localhost:%s ' "$port"
  tries=0
  until curl -fsS "http://localhost:$port/api/health" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 120 ]; then
      echo
      echo "Not answering after 10 minutes. Logs: docker compose logs migrate app" >&2
      exit 1
    fi
    printf '.'
    sleep 5
  done
  echo
}

require_env() { [ -f .env ] || { echo "No .env here - run ./scripts/self-host.sh first." >&2; exit 1; }; }

backup() {
  require_env
  user=$(get_var POSTGRES_USER guidon)
  db=$(get_var POSTGRES_DB guidon)
  dir="backups/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  chmod 700 backups "$dir"
  docker compose up -d db >/dev/null
  until docker compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; do sleep 2; done
  echo "Backing up into $dir"
  # Roles first: the RLS policies are granted to roles a new server doesn't have.
  docker compose exec -T db pg_dumpall -U "$user" --roles-only > "$dir/roles.sql"
  docker compose exec -T db pg_dump -U "$user" -Fc "$db" > "$dir/database.dump"
  # Uploaded files (STORAGE_PROVIDER=local). The app container mounts the volume.
  if [ "$(get_var STORAGE_PROVIDER local)" = local ] && docker compose ps --status running --services | grep -qx app; then
    docker compose exec -T app tar czf - -C /app/storage . > "$dir/storage.tar.gz"
  else
    echo "  (files skipped: the app isn't running or files aren't stored locally)"
  fi
  # .env holds AUTH_SECRET, which encrypted values in the database need.
  cp .env "$dir/env"
  chmod 600 "$dir"/*
  [ -s "$dir/database.dump" ] || { echo "The database dump is empty - backup failed." >&2; exit 1; }
  echo "Done: $dir ($(du -sh "$dir" | cut -f1)). It contains your secrets - copy it somewhere safe and private."
}

restore() {
  require_env
  dir=${1:-}
  [ -n "$dir" ] && [ -s "$dir/database.dump" ] || { echo "Usage: ./scripts/self-host.sh restore backups/<date>" >&2; exit 1; }
  user=$(get_var POSTGRES_USER guidon)
  db=$(get_var POSTGRES_DB guidon)
  if [ "${GUIDON_YES:-}" != 1 ]; then
    echo "This replaces ALL current data (database and uploaded files) with $dir."
    printf 'Type RESTORE to continue: '
    read -r answer
    [ "$answer" = RESTORE ] || { echo "Cancelled."; exit 1; }
  fi
  if [ -f "$dir/env" ] && ! cmp -s "$dir/env" .env; then
    echo "Note: $dir/env differs from your .env. If AUTH_SECRET changed, saved integration secrets can't be read."
    echo "      To use the backed-up settings: cp $dir/env .env (then run this again)."
  fi
  docker compose up -d db >/dev/null
  until docker compose exec -T db pg_isready -U "$user" -d "$db" >/dev/null 2>&1; do sleep 2; done
  docker compose stop app >/dev/null 2>&1 || true
  # "already exists" errors for roles this server has are expected.
  docker compose exec -T db psql -q -U "$user" -d postgres < "$dir/roles.sql" >/dev/null 2>&1 || true
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$user" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\""
  docker compose exec -T db pg_restore --exit-on-error --no-owner --role="$user" -U "$user" -d "$db" < "$dir/database.dump"
  docker compose up -d >/dev/null
  if [ -s "$dir/storage.tar.gz" ]; then
    wait_healthy
    docker compose exec -T app sh -c 'find /app/storage -mindepth 1 -delete && tar xzf - -C /app/storage' < "$dir/storage.tar.gz"
  fi
  wait_healthy
  echo "Restored from $dir."
}

case "${1:-start}" in
  start)
    [ -f .env ] || write_env
    docker compose up -d --build
    wait_healthy
    echo "Guidon is running at http://localhost:$(get_var APP_PORT 3000) - sign up to create the first account."
    echo "To make it the instance admin, add ADMIN_EMAILS=<that email> to .env and run this script again."
    ;;
  update)
    require_env
    backup
    if [ -d .git ]; then
      git pull --ff-only || { echo "git pull failed (local changes?). Nothing was changed; your backup is above." >&2; exit 1; }
    fi
    docker compose up -d --build
    wait_healthy
    echo "Updated. If something is wrong: ./scripts/self-host.sh restore <the backup above>"
    ;;
  backup) backup ;;
  restore) restore "${2:-}" ;;
  *)
    echo "Usage: ./scripts/self-host.sh [start|update|backup|restore <dir>]" >&2
    exit 1
    ;;
esac
