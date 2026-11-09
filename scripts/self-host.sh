#!/bin/sh
# One command to run Guidon on your own server:
#   ./scripts/self-host.sh
# First run: writes .env from .env.example with random secrets and the
# self-hosted settings (local file storage, no Supabase), then builds and
# starts the Docker Compose stack and waits until it answers. Later runs keep
# your .env and update the stack (rebuild + migrate + restart).
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
random_hex() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

if [ ! -f .env ]; then
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
fi

port=$(sed -n 's/^APP_PORT=//p' .env | tail -n 1)
port=${port:-3000}

docker compose up -d --build

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
echo "Guidon is running at http://localhost:$port - sign up to create the first account."
echo "To make it the instance admin, add ADMIN_EMAILS=<that email> to .env and run this script again."
