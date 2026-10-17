# Flight modes and rendering repair

Baseline: main `42d7df0` plus PR #34 `f59f650`. Preserve Explore, interactive replay, and both free/mission flight.

## Root causes and repair plan

| Boundary | Failure | Repair and regression |
|---|---|---|
| Navigation → scene store | Opening Mission clears the flight, then checks a stale snapshot and skips creating the replacement. | Read state after resets; preserve an existing mission when reselected; clear held controls on navigation. |
| Replay → player session | Player physics shares the replay screen, but pause/play rejects or ignores the player session, and live controls/results are absent. | Synchronize pause/play, expose live controls/results, and return to illustration on seek/restart. Preserve terminal pose until explicitly dismissed. |
| Launch → axis ownership | Button/keyboard/gesture launch disagree; launch overrides an explicit screen choice. | Shared launch path and per-run explicit screen preference. |
| Sensor stream → calibration | New run clears a valid mount; gyro data is computed but dropped before transmission. | Retain mount across runs, clear stale display attitude, and transmit gyro samples. |
| Phone push → throttle mixer | Ownership transfer disarms the axis; the nonzero push never arms it, and resting sends null. | Neutral-arm on deliberate push and restore laptop ownership at rest while preserving power. |
| Physics → drawn pose | Drawn pitch uses launch vertical even after downrange travel. | Derive nose and pivot from current radial, matching physical thrust. |
| Phone attitude → rendering | Live phone attitude affects paused, local-owned, and historical playback poses. | Gate fresh phone attitude on live ownership; freeze paused/terminal attitude. |
| Browser test → UI | Test clicks mode selectors hidden during flight; dependency and output paths require another machine's setup. | Pin browser runner, add a local command, exercise real retry/pause/handoff flows. |
| Orbit markers → follow view | OrbitPath mounts map spheres and labels in follow view; distance-scaled labels become enormous near the rocket. | Omit marker meshes outside overview and keep label text at a fixed pixel size. |
| Cloud geometry → globe | All coarse cloud-sphere faces intersect Earth; overview inherits local clouds/fog. | Keep shell faces outside Earth and gate local weather by camera altitude. |
| Vehicle bodies → depth | Full GLB and procedural rocket draw simultaneously. | Render one body per stage and the matching engine exhaust. |
| Ground geometry → shader | Centre triangles face inward; world-coordinate projection loses metre detail. | Correct winding and use camera-space projection; numerical regressions bound error below 0.1 pixel. |
| Metre effects → scene coordinates | Smoke, contrails, and point particles bypass the model scale in camera space, filling the screen at globe scale. Smoke also ignores opaque depth. | Scale camera-facing offsets and point attenuation consistently; enable smoke depth tests. GPU tests compare occupied pixels at scale 1 and 0.000001. |
| Fuel burn → force integration | The final fuel slice is removed before forces inspect the tank, losing the paid-for thrust impulse. | Carry the powered-slice flag through acceleration and coast classification; recorded profiles remain valid. |

## Verification

Write failing regressions before each runtime fix. Run the unit suite, TypeScript, lint, browser mode flows, and shared-renderer checks. Browser/build verification uses a temporary source copy excluding credential files. Do not merge or deploy as part of this repair.

## Review draft

Summary: Repair mode transitions, shared controls, phone input, and flight presentation across Mission and interactive replay.

Mechanism: State snapshots, independent clock guards, and input ownership disagreed at the boundaries between screens. Geometry and effects must use one render/depth convention and avoid overlapping or intersecting surfaces.

| Scenario | Before | After |
|---|---|---|
| Reselect Mission / leave steered replay | Idle mission with no Launch | Ready run or preserved current mission |
| Pause/Play during steered replay | Player keeps moving / Play blocked | Both clocks pause and resume |
| Explicit screen choice with phone paired | Launch takes phone pitch | Same-run screen choice retained |
| Phone push then rest | Disabled throttle stuck with phone | Push works; laptop regains current power |
| Downrange attitude | Mesh nose diverges from thrust | Nose follows local vertical and pitch |
| Terminal replay flight | Snaps into historical animation | Final player pose and outcome stay visible |

Unchanged: sourced historical event data, external APIs, credential files, pairing transport, and deployment state.

Trade-off: interactive replay remains supported, so its live player session needs visible controls and an explicit return to the illustration. Shared state and rendering fixes span multiple modules; splitting navigation, input, and rendering into separate review commits is possible, but none alone resolves the full reported flow.

Pre-submit applicability: domain arrays use `as const`; typed inputs retained; helper and real-frame regressions cover changed contracts. Database list limits, queues, backfills, and production metric queries do not apply. Removed the obsolete browser type shim, overlapping rocket body, unused world-position intermediates, and obsolete per-stage GLB hide effect. No production security surface or deployment changes. Scope exceeds eight files because the user requested both mode integration and shared-renderer defects; navigation, phone controls, and rendering could be reviewed separately, while verification covers their combined behavior.

## Commands

`npm test` runs unit regressions. After `npm run test:e2e:install` installs Chromium once, `npm run test:e2e` runs phone, keyboard, and mode-switch browser flows, and `npm run test:rendering` checks actual WebGL shader compilation and occlusion. Browser artifacts use `test-results/kerbal` by default.

## Verification results

- Full unit suite: 126 files passed, 907 tests passed, one existing skipped test. Relay/socket cases were run with localhost access.
- WebGL: 58/58 actual GPU checks passed, including shader compilation with logarithmic depth on/off, front/behind occlusion, and five particle shaders with identical occupied pixel areas at normal and globe scales.
- Browser: three scenarios passed: paired phone and screen ownership across modes; desktop climb/pause/resume/crash/retry; repeated normal mode transitions with map markers hidden in follow. Browser error checks reported no uncaught page errors or shader failures. The crash and normal-transition flows were also rerun with image and voice endpoints stubbed, so these mode tests use local media fallbacks without spending provider credits.
- TypeScript and diff whitespace checks passed. Lint passed with the two existing presentation image-optimization warnings.
- Production build passed after the final physics and rendering changes; all ten pages generated successfully.
- Visual review confirmed the Falcon and terrain are visible in the settled ascent image; oversized Impact text and marker spheres are absent. Evidence is kept locally under ignored `test-results/kerbal`.
- No reference mission data, external API, credential, deploy, or author identity changes. Product expansion and deployment reviews were skipped because this is a repair of existing behavior; security review found no changed API or credential boundary.
