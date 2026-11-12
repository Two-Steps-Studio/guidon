#!/bin/sh
# Guidon Cloud on one server (Supabase stays the database):
#   ./scripts/cloud-host.sh          build and start, or update after `git pull`
# Needs .env.cloud (copy .env.cloud.example). See docs/cloud-hosting.md.
set -eu
cd "$(dirname "$0")/.."

command -v docker >/dev/null 2>&1 || { echo "Docker is required: curl -fsSL https://get.docker.com | sh" >&2; exit 1; }
[ -f .env.cloud ] || { echo "Create .env.cloud first: cp .env.cloud.example .env.cloud, then fill it in." >&2; exit 1; }
chmod 600 .env.cloud
if grep -q '^DATABASE_URL=.' .env.cloud; then
  echo ".env.cloud sets DATABASE_URL - that switches the app away from Supabase. Remove it (or use ./scripts/self-host.sh)." >&2
  exit 1
fi
for name in GUIDON_DOMAIN NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY AUTH_SECRET; do
  grep -q "^$name=." .env.cloud || { echo "$name is empty in .env.cloud." >&2; exit 1; }
done
if ! grep -q '^CRON_SECRET=.' .env.cloud; then
  secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  grep -v '^CRON_SECRET=' .env.cloud > .env.cloud.tmp && printf 'CRON_SECRET=%s\n' "$secret" >> .env.cloud.tmp && mv .env.cloud.tmp .env.cloud && chmod 600 .env.cloud
fi

compose="docker compose --env-file .env.cloud -f docker-compose.cloud.yml"
$compose up -d --build

printf 'Waiting for Guidon '
tries=0
until $compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    echo
    echo "Not healthy after 5 minutes. Logs: $compose logs app caddy" >&2
    exit 1
  fi
  printf '.'
  sleep 5
done
echo
domain=$(sed -n 's/^GUIDON_DOMAIN=//p' .env.cloud | tail -n 1)
echo "Guidon is running. Once DNS for $domain points at this server, open https://$domain (the certificate takes a minute)."
