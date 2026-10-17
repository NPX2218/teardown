# Smoke

Run on 17 October 2026 against current `main`. Checks ran in the app tree. Playwright used laptop 1440×900 and phone 780×360 (Galaxy S24 FE), the local relay, pair code `ABCD`, and `scripts/sim-phone.ts --mount s24fe`. Pictures and short videos are under `/opt/cursor/artifacts/smoke-main/`.

`scripts/smoke/merge-all.sh` is for unmerged stacks. This run did not use it.

## Checks

| Check | Result |
| --- | --- |
| tsc --noEmit | pass |
| lint | pass |
| vitest | 92 files, 703 passed, 1 skipped (704) |
| next build | pass |
| Playwright `e2e/smoke/` | 9 passed |

The skip is in `lib/__tests__/missions.test.ts`. It waits on a Launch Library 2 RTLS file that is not in the repo.

## Scenarios

| Scenario | Result | Evidence |
| --- | --- | --- |
| Calibrate | pass | `calibrate-laptop.png`, `calibrate-phone.png`, `calibrate-*.webm` |
| Lift to launch | pass | `lift-laptop.png`, `lift-phone.png`, `lift-*.webm` |
| Tilt steering | pass | `tilt-laptop.png`, `tilt-phone.png`, `tilt-*.webm` |
| Flick to stage | pass | `flick-laptop.png`, `flick-phone.png`, `flick-*.webm` |
| Nose-down abort | pass | `abort-laptop.png`, `abort-phone.png`, `abort-*.webm` |
| Free-flight crash | pass | `crash-laptop.png`, `crash-phone.png`, `crash-*.webm`. Crashed outcome on screen. |
| Mission drift | pass | `drift-warning-laptop.png`, `drift-warning-hud.png` ("Drifting off track"), `drift-return-laptop.png`, `drift-return-hud.png` ("Return to trajectory"), `drift-failed-hud.png`, `drift-laptop.png` ("Mission failed: off nominal") |
| Sentinel-6 milestones | pass | `sentinel-laptop.png`, `sentinel-phone.png`, `sentinel-*.webm`. Milestones include liftoff, max-Q, staging, MECO, stage sep. The note "Reference trajectory unavailable" is on screen. |
| Mascot voice states | pass | `mascot-idle.png`, `mascot-listening.png`, `mascot-user-speaking.png`, `mascot-thinking.png`, `mascot-speaking.png`, `mascot-phone.png`, `mascot-*.webm` |

Free-flight phone lift, tilt, flick, and abort ran from the simulator. The short-hop crash used the on-screen Launch button and the laptop throttle, then the phone tipped to 85°. Mission drift launched from the screen with the phone held upright and time at 4×. The PRACTICE corridor climbs while the rocket stays on the pad, so the HUD shows "Drifting off track", then "Return to trajectory", then "Mission failed: off nominal" about 5 simulated seconds after the red warning. Sentinel-6 was also launched from the screen, with warp 8×.

## Fixes in this run

The practice mission now has a PRACTICE corridor: altitude, downrange, speed, and pitch recorded by flying `CLASSROOM_ORBIT_PROFILE` through `stepFlight`. The label is simulated practice reference, not historical. Sentinel-6 is still published milestone times only, and mission mode still shows "Reference trajectory unavailable" for that flight.

The flight HUD mounts `components/emissions/EmissionsSlot`. During the practice flight the page does not say "Estimate unavailable". The readout is Anders's carbon-dioxide line.

`GuideLauncher` calls `bindVoiceActivity(onVoiceState)` from its mount effect. Grok speech stays on the laptop. `lib/rocket/commands.ts` still drops `say` and `stopSay`. The phone plays rocket sounds and vibration only.
