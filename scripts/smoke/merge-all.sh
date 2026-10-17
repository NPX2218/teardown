#!/usr/bin/env bash
# Throwaway merge of every open PR in docs/REVIEW-GUIDE.md order.
# Never pushes, never checks out main, never merges into the caller's branch.
set -u

ROOT="$(git rev-parse --show-toplevel)"
WT="${SMOKE_WORKTREE:-/tmp/teardown-smoke-stack}"
REPORT="${SMOKE_REPORT:-/tmp/teardown-smoke-report}"
mkdir -p "$REPORT"
rm -f "$REPORT/conflicts.txt" "$REPORT/summary.txt"
touch "$REPORT/conflicts.txt"

log() { printf '%s\n' "$*" | tee -a "$REPORT/summary.txt"; }

cd "$ROOT"
log "fetching PR heads"
for ref in \
  main \
  neel/01-setup-contract \
  neel/03-viewer-core \
  neel/07-flight \
  neel/10-phone-rocket \
  neel/11-rocket-link \
  neel/12-integration \
  neel/14-grok-mascot \
  neel/15-earth-skins \
  neel/16-spacexai-design \
  cursor/agent-grok-tools-dfdf \
  cursor/emissions-readout-1384 \
  cursor/imagine-show-in-action-1384 \
  cursor/mission-data-18be \
  cursor/parts-data-18be \
  cursor/presentation-readme-ecd4 \
  cursor/voice-realtime-dfdf \
  cursor/about-section-cd80 \
  neel/17-review-guide
do
  git fetch origin "$ref" || log "fetch miss $ref"
done

if git worktree list --porcelain | grep -q "worktree $WT$"; then
  git worktree remove --force "$WT" || true
fi
rm -rf "$WT"
git worktree add --detach "$WT" origin/main
cd "$WT" || exit 1

merge_one() {
  local num="$1" ref="$2" optional="${3:-required}"
  if ! git rev-parse --verify --quiet "$ref" >/dev/null; then
    if [[ "$optional" == "optional" ]]; then
      log "SKIP #$num ($ref missing)"
      return 0
    fi
    log "MISSING #$num $ref"
    echo "#$num missing $ref" >> "$REPORT/conflicts.txt"
    return 0
  fi
  local sha
  sha="$(git rev-parse "$ref")"
  if git merge-base --is-ancestor "$sha" HEAD; then
    log "SKIP #$num already on this base ($(git rev-parse --short "$sha"))"
    return 0
  fi
  if git merge --no-edit --no-ff "$sha" -m "smoke: merge #$num" >"$REPORT/merge-$num.txt" 2>&1; then
    log "OK   #$num $(git rev-parse --short HEAD)"
    return 0
  fi
  log "CONFLICT #$num"
  git diff --name-only --diff-filter=U | tee -a "$REPORT/conflicts.txt" | sed "s/^/     #$num /" | tee -a "$REPORT/summary.txt"
  echo "#$num" >> "$REPORT/conflicts.txt"
  git merge --abort || true
}

# Starts at origin/main. PRs already merged there are skipped.
# #11 is merged after #13 so the recorded resolution wins.
# #18 is the About sheet on #16. #17 is this guide and is optional.
merge_one 8  origin/neel/01-setup-contract
merge_one 10 origin/neel/03-viewer-core
merge_one 9  origin/neel/10-phone-rocket
merge_one 12 origin/neel/07-flight
merge_one 13 origin/neel/12-integration
merge_one 11 origin/neel/11-rocket-link
merge_one 14 origin/neel/15-earth-skins
merge_one 15 origin/neel/14-grok-mascot
merge_one 16 origin/neel/16-spacexai-design
merge_one 18 origin/cursor/about-section-cd80
merge_one 2  origin/cursor/parts-data-18be
merge_one 1  origin/cursor/emissions-readout-1384
merge_one 3  origin/cursor/agent-grok-tools-dfdf
merge_one 4  origin/cursor/imagine-show-in-action-1384
merge_one 7  origin/cursor/voice-realtime-dfdf
merge_one 5  origin/cursor/mission-data-18be
merge_one 6  origin/cursor/presentation-readme-ecd4
merge_one 17 origin/neel/17-review-guide optional

log "HEAD $(git rev-parse --short HEAD)"
node "$ROOT/scripts/smoke/apply-glue.mjs" "$WT" | tee -a "$REPORT/summary.txt"

FAILS=0
run_step() {
  local name="$1"
  shift
  log "RUN  $name"
  if "$@" >"$REPORT/$name.txt" 2>&1; then
    log "PASS $name"
  else
    FAILS=$((FAILS + 1))
    log "FAIL $name (see $REPORT/$name.txt)"
    tail -n 40 "$REPORT/$name.txt" | tee -a "$REPORT/summary.txt"
  fi
}

if [[ -f package-lock.json ]]; then
  run_step npm-ci npm ci
else
  run_step npm-install npm install
fi
run_step tsc npx tsc --noEmit
run_step lint npm run lint
run_step vitest npm test
run_step build npm run build

if grep -q "Tests " "$REPORT/vitest.txt" 2>/dev/null; then
  grep -E "Test Files|Tests " "$REPORT/vitest.txt" | tee -a "$REPORT/summary.txt"
fi

log "worktree $WT"
log "report   $REPORT/summary.txt"
if [[ -s "$REPORT/conflicts.txt" ]]; then
  log "conflicts recorded in $REPORT/conflicts.txt"
  exit 1
fi
if [[ "$FAILS" -ne 0 ]]; then
  log "$FAILS check(s) failed"
  exit 1
fi
