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

# Ensure the process is always recreated from the current repo state.
/usr/bin/env pm2 delete copje 2>/dev/null || true
/usr/bin/env pm2 start "$PM2_CONFIG"
