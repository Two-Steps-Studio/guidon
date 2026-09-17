#!/bin/sh
# Pulls the latest code and rebuilds/restarts the bot only if anything
# actually changed - `docker compose up -d --build` is a no-op (no
# container restart) when the image content is unchanged, so running this
# hourly doesn't bounce the bot's Discord Gateway connection every time.
set -e
cd "$(dirname "$0")"

git pull --ff-only
docker compose up -d --build
