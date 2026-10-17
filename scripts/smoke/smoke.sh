#!/usr/bin/env bash
# Playwright smoke against the merged worktree from merge-all.sh.
set -u
ROOT="$(git rev-parse --show-toplevel)"
export SMOKE_APP_DIR="${SMOKE_APP_DIR:-/tmp/teardown-smoke-stack}"
export SMOKE_ARTIFACTS="${SMOKE_ARTIFACTS:-/opt/cursor/artifacts/smoke}"
mkdir -p "$SMOKE_ARTIFACTS"

if [[ ! -f "$SMOKE_APP_DIR/package.json" ]]; then
  echo "No merged app at $SMOKE_APP_DIR. Run scripts/smoke/merge-all.sh first." >&2
  exit 1
fi

PW="${SMOKE_PLAYWRIGHT_DIR:-/tmp/teardown-playwright}"
if [[ ! -x "$PW/node_modules/.bin/playwright" ]]; then
  mkdir -p "$PW"
  npm install --prefix "$PW" @playwright/test@1.55.1
fi
"$PW/node_modules/.bin/playwright" install chromium

cd "$ROOT"
export NODE_PATH="$PW/node_modules${NODE_PATH:+:$NODE_PATH}"
"$PW/node_modules/.bin/playwright" test --config e2e/smoke/playwright.config.ts
