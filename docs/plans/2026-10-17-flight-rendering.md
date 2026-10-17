# Flight rendering: RCA and repair plan

**Goal:** remove inconsistent effect occlusion and the camera jump at liftoff in Flight replay and Your mission.
**Scope:** shared flight rendering only. The perpendicular/orientation issue is explicitly deferred at the user's request. Physics, mission data, pitch semantics and camera up stay unchanged.
**Baseline:** `a1dfc3b`; investigation on 2026-10-17. Existing suite: 109 files passed, 797 tests passed, 1 skipped.

## Data flow and root causes

```text
FlightController → replay/physics store → PosePublisher → flightDrawNow
                                                   ├→ ChaseCamera
                                                   └→ vehicle, sky and cloud effects → WebGL depth test
```

| Defect | Evidence | Repair |
|---|---|---|
| Effects use a different depth convention from the globe/vehicle | FlightScene enables logarithmic depth. All twelve shader pairs in `fx/shaders.ts` omits its depth chunks. At 220 m, near `5e-8`, far `80`, ordinary depth is `0.9997727` versus logarithmic depth `0.0000501`. Transparent effects still depth-test even with depth writes disabled. | Use Three's logarithmic depth chunks in every FX vertex/fragment pair; keep ordinary rendering supported when the renderer disables logarithmic depth. |
| Pad and chase cameras disagree at the airborne boundary | Same pad pose, default yaw/pitch: desired eye moves 301.19 m. Its right offset changes from +171.71 m to −111.11 m because chase computes `behind × up`, opposite the pad's right axis. Range, target and FOV also change abruptly. | Share a stable launch-plane orbit basis and blend the full shot from pad to chase over the first vehicle length of altitude. |
| Camera-dependent effects can use the previous camera pose | Camera and effects use default frame priority. Effects in the world subtree register before the chase camera. The physics step also follows draw publication at default priority. | Explicit negative priorities: step clock first, publish draw second, update camera third, then run default-priority visual effects. Keep automatic canvas rendering. |

These are verified code defects. The depth mismatch explains invalid occlusion; the exact contribution of each defect to device-specific temporal flicker requires browser verification. The initial browser reproduction showed a rotated horizon and a harsh bright sky during powered ascent. Camera up and nose orientation are outside this repair.

## Repair sequence

- [x] Add failing camera regressions for exact pad/airborne continuity, matching drag direction, small positive/negative tilt changes and finite exterior shots at both launch sites.
- [x] Make chase orbit direction independent of near-vertical nose projection. Use the existing launch-plane axes; pitch still controls look-ahead. Blend eye, target and FOV from pad to chase through the first 70 m (the existing flight model height). This is presentation tuning, not a physical threshold.
- [x] Add the standard vertex/fragment depth chunks to all twelve FX pairs, including smoke, staging, explosion and cloud effects. Validate compilation and front/behind occlusion in a real WebGL renderer, with logarithmic depth on and off.
- [x] Order physics at −3, draw publication at −2, and the chase camera at −1; camera-dependent visual callbacks remain at 0. Drei's existing overview controls also run at −1, before visual callbacks. Positive priorities are avoided because they take over rendering.
- [x] Run the full unit suite, type checking, and real WebGL depth checks.
- [ ] Follow up with full visual/device QA for both modes: first entry, powered liftoff, pause, replay selection/restart, overview/follow, and reduced motion. This is not claimed complete by the targeted checks.

## Behavior matrix

| Scenario | Before | Intended after |
|---|---|---|
| First airborne frame at altitude 0 | Different side, range, target and FOV | Same shot as the pad |
| First vehicle length of ascent | Camera settles toward a discontinuous chase pose | Smooth altitude-based transition |
| Small tilt through vertical | Nose-projection threshold can reverse chase direction | Stable launch-plane orbit basis |
| Cloud or plume in front of an opaque surface | Depth values are incomparable | Shared depth convention |
| Cloud or plume behind an opaque surface | Depth values are incomparable | Correct occlusion |
| Moving follow camera | Sky/cloud billboards can follow the previous camera | Camera updated before visual callbacks |
| Camera up / rocket attitude | Existing orientation | Unchanged by request |

## Verification and limits

| Check | Actual result |
|---|---|
| Camera regressions | Before: 8 failures / 6 passes. After: 14/14 pass; the existing 8 launch-camera tests also pass. |
| WebGL regression | Before: 27/28 pass; a frontmost plume incorrectly reads green (blocked). After: 28/28 pass; the same pixel reads red. Includes all 12 shader pairs with log depth enabled/disabled, and four front/behind pixel assertions. |
| Full suite | 110 files pass; 811 tests pass, 1 skipped. |
| Type checking | `node_modules/.bin/tsc --noEmit` passes. |
| Manual diff review | Scoped to five runtime files, two regression files and this report; no dependency, secret or API changes. |

The WebGL test lives in `e2e/rendering/depth-check.ts`. To reproduce, from the repository root:

```sh
node <<'JS'
const fs = require("node:fs");
fs.mkdirSync("/tmp/flight-depth-check", { recursive: true });
require("esbuild").buildSync({
  entryPoints: ["e2e/rendering/depth-check.ts"],
  outfile: "/tmp/flight-depth-check/main.js", bundle: true, format: "esm"
});
fs.writeFileSync("/tmp/flight-depth-check/index.html",
  '<!doctype html><title>Flight depth regression</title><script type="module" src="/main.js"></script>');
JS
python3 -m http.server 3327 --bind 127.0.0.1 --directory /tmp/flight-depth-check
```

Open `http://127.0.0.1:3327`; expect `passed: 28, total: 28`. Run camera regressions with `npm test -- lib/__tests__/flight-rendering.test.ts`.

No change to physical trajectories, sourced mission events, controls, fuel, emissions, Explore, texture selection, reduced-motion preferences or camera up is intended.

Further findings are deferred: the ground cap's central 72 triangles wind inward; drawn attitude away from the pad uses a different radial frame from physics; world-space shader projection may lose precision near the surface. They are separate from the bounded depth/camera repair and are not claimed fixed.


## Pre-submit audit

| Item | Disposition |
|---|---|
| Query limits, API response types, queues, feature flags, backfills | Not applicable: no queries, APIs, queues, flags or data migrations changed. |
| Domain arrays `as const` | No production domain arrays added. |
| Pure logic + tests | Existing pure `launch-camera.ts` extended; 14 sentinel cases cite baseline `a1dfc3b` and the report date. No new parallel helper layer needed. |
| Dead code | Removed nose-projection threshold and redundant chase-side cross product; removed cloud shader world-position intermediate. |
| Behavior matrix + unchanged claims | Above and in PR body. |
| Metric/filter blast radius | No filters or persisted metrics changed; both flight modes share the affected scene. |
| Diff size | Eight files, including this report and two regression files; five runtime files form one shared renderer fix. Split alternative: land camera and depth separately, but that would leave one reported failure active. |
| Commit | One scoped commit; unrelated local preview and diagnostic artifacts excluded. |
| Broader reviews | Product/design expansion, production security scan and deployment skipped: bounded local rendering bugfix, no deployment requested. Targeted technical review and manual diff review performed. |
