#!/bin/sh
# Guidon Cloud on one server (Supabase stays the database):
#   ./scripts/cloud-host.sh          build and start, or update after `git pull`
# Needs .env.cloud (copy .env.cloud.example). See docs/cloud-hosting.md.
set -eu
# Every file this creates holds secrets (.env.cloud.tmp below): private from the start.
umask 077
cd "$(dirname "$0")/.."

command -v docker >/dev/null 2>&1 || { echo "Docker is required: curl -fsSL https://get.docker.com | sh" >&2; exit 1; }
[ -f .env.cloud ] || { echo "Create .env.cloud first: cp .env.cloud.example .env.cloud, then fill it in." >&2; exit 1; }
chmod 600 .env.cloud
if grep -q '^DATABASE_URL=.' .env.cloud; then
  echo ".env.cloud sets DATABASE_URL - that switches the app away from Supabase. Remove it (or use ./scripts/self-host.sh)." >&2
  exit 1
fi
for name in GUIDON_DOMAIN NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  grep -q "^$name=." .env.cloud || { echo "$name is empty in .env.cloud." >&2; exit 1; }
done
# It keys the encryption of stored secrets and signed tokens: a short value can be guessed.
auth_secret=$(sed -n 's/^AUTH_SECRET=//p' .env.cloud | tail -n 1)
if [ "${#auth_secret}" -lt 32 ]; then
  echo "AUTH_SECRET in .env.cloud must be at least 32 characters (it is ${#auth_secret}). Reuse the old value, or generate one: openssl rand -hex 32" >&2
  exit 1
fi
if ! grep -q '^CRON_SECRET=.' .env.cloud; then
  secret=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  grep -v '^CRON_SECRET=' .env.cloud > .env.cloud.tmp && printf 'CRON_SECRET=%s\n' "$secret" >> .env.cloud.tmp && mv .env.cloud.tmp .env.cloud && chmod 600 .env.cloud
fi

# A tunnel token means no open ports (home server/NAS); otherwise Caddy on 80/443.
if grep -q '^TUNNEL_TOKEN=.' .env.cloud; then profile=tunnel; else profile=caddy; fi
compose="docker compose --env-file .env.cloud -f docker-compose.cloud.yml --profile $profile"
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
if [ "$profile" = tunnel ]; then
  echo "Guidon is running behind the Cloudflare tunnel: https://$domain (public hostnames -> http://edge:80)."
else
  echo "Guidon is running. Once DNS for $domain points at this server, open https://$domain (the certificate takes a minute)."
fi
