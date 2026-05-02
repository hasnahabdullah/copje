#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/root/copje"
BRANCH="${COPJE_BRANCH:-main}"
PM2_CONFIG="$APP_DIR/deploy/ecosystem.config.cjs"

cd "$APP_DIR"

git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run build

/usr/bin/env pm2 startOrReload "$PM2_CONFIG"
