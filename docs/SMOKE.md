# Smoke

Throwaway merge of the guide order, then a paired laptop and phone. The app was not edited. Harness fixes stay in `e2e/smoke/` and `scripts/smoke/`.

Run on 17 October 2026 against the full stack, including the PRs that have since landed on `main` (`#8`, `#9`, `#10`, `#12`). Tips at the time: `#13` `7c0cfbc`, `#16` `39f1c99`, `#7` `20c5ae5`, plus the style follow-ups on `#1`, `#3`, and `#4`. `#18` opened after this run.

## merge-all

`scripts/smoke/merge-all.sh` in a throwaway worktree. No conflicts. `#11` was already inside `#13`. The voice glue was applied in `components/ui/GuideLauncher.tsx` (mount effect only).

| Check | Result |
| --- | --- |
| tsc | pass |
| lint | pass |
| vitest | 91 files, 695 passed, 1 skipped (696) |
| next build | pass |

The skip is in `lib/__tests__/missions.test.ts`. It waits on a Launch Library 2 RTLS file that is not in the repo.

## Scenarios

Laptop 1440×900, phone 780×360 (Galaxy S24 FE). Local relay, pair code `ABCD`, `scripts/sim-phone.ts --mount s24fe`. Pictures and short videos are under `/opt/cursor/artifacts/smoke/`.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Calibrate | pass | `calibrate-laptop.png`, `calibrate-phone.png`, `calibrate-*.webm` |
| Lift to launch | pass | `lift-laptop.png`, `lift-phone.png`, `lift-*.webm` |
| Tilt steering | pass | `tilt-laptop.png`, `tilt-phone.png`, `tilt-*.webm` |
| Flick to stage | pass | `flick-laptop.png`, `flick-phone.png`, `flick-*.webm` |
| Nose-down abort | pass | `abort-laptop.png`, `abort-phone.png`, `abort-*.webm` |
| Free-flight crash | pass | `crash-laptop.png`, `crash-phone.png`, `crash-*.webm`. Outcome: tower strike. |
| Mission drift | fail | `drift-laptop.png`, `drift-phone.png`, `drift-*.webm` |
| Sentinel-6 milestones | pass | `sentinel-laptop.png`, `sentinel-phone.png`, `sentinel-*.webm`. Milestones include liftoff, max-Q, staging, MECO, stage sep. The note "Reference trajectory unavailable" is on screen. |
| Mascot voice states | pass | `mascot-idle.png`, `mascot-listening.png`, `mascot-user-speaking.png`, `mascot-thinking.png`, `mascot-speaking.png`, `mascot-phone.png`, `mascot-*.webm` |

Free-flight phone lift, tilt, flick, and abort all ran from the simulator. The short-hop crash used the on-screen Launch button and the laptop throttle, then the phone tipped to 85°. A lift impulse alone takes throttle at about 12% and the short hop never leaves the pad, so a tilt-only replay cannot crash. Mission mode was started with the on-screen Launch button so the clock could run. Warp 8 was on.

## App bug

**Mission mode cannot warn or fail for drift.**

- Files: `data/missions/practice.json`, `data/missions/sentinel-6-michael-freilich.json` (every `altKm` / `velMs` / `pitchDeg` is null), `lib/flight/reference.ts` (`referenceHasKinematics`), `lib/flight/guidance.ts` (the corridor step runs only when that is true).
- Repro: pair, Your mission, Mission, Practice sample, Launch, warp 8×, hold a steep phone tilt. The HUD shows "Reference trajectory unavailable". It never shows "Drifting off track", "Return to trajectory", or "Mission failed: off nominal". Height stays 0.00 km in the screenshot because throttle was still 0; the missing banner does not depend on that. With no numeric reference, `guidance.ts` forces the warning level back to nominal.
- Suggested fix: check in one labelled practice corridor with numeric altitude and speed samples, or the drift banners never run in the demo. Do not invent a Sentinel-6 path. That record is published times only.

No other app bug showed up in this run. The flight HUD still says "Estimate unavailable" / "Combustion factor is not loaded" until the emissions import in the guide is swapped. That gap is already listed there.
