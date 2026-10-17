# Flight coordinates

The simulator flies in three dimensions around a spherical Earth. Its Cartesian state is rotated onto the selected launch site for drawing. Replay without a kinematic reference is a drawing of the mission clock, not a path that was flown.

## State

`createFlight` in `lib/flight.helpers.ts` starts the rocket at `(x, y, z) = (0, EARTH_RADIUS_M, 0)` with `EARTH_RADIUS_M = 6_378_137`. Pitch and side lean (`yawRad`) are torque-limited physical angles. Positive pitch turns downrange, `+X` on the pad; positive side lean turns crossrange, `+Z` on the pad. Missing side lean, crossrange position and crossrange velocity default to zero for old state shapes.

Phone flight shares Explore’s calibrated quaternion delta, preserving full pointing and twist. The pose held during calibration is flight neutral; its initial physical lean is restored only in Explore. Flight maps screen-normal +Z to downrange +X and inverts the complete rotation, matching the October 17 request to reverse all mission steering axes. The input quaternion is relative to the flight's transported radial frame; `attitudeQuat` in physical state is fixed physics XYZ, with `angularVelocityRadS` carrying its actual turn rate. `controlFrameQuat` follows the radial direction by the shortest rotation, so crossing a pole cannot reverse a held steering target. Scalar pitch and side lean are readouts of that orientation. Older scenario/profile commands retain their scalar path.

`noseDirection` in `lib/flight/attitude.helpers.ts` is the source for both thrust and drawing. With radial `R`, downrange tangent `T = normalize(R × +Z)`, and crossrange tangent `B = T × R`, the physical nose is `sin(pitch) T + cos(pitch) cos(yaw) R + cos(pitch) sin(yaw) B`. The tangent has a finite fallback at the crossrange poles. Side lean is not compass heading.

`physicalNose` and `physicalAttitude` read the authoritative physical quaternion when present. The renderer maps that full rotation into its globe frame, preserving twist; it never applies a separate phone or camera rotation to the nose. Steering changes force and then velocity; it does not redirect existing velocity. Engines-off rotation therefore produces no steering impulse. Two-dimensional conic calculations project the actual position/velocity into their instantaneous orbital plane and lift the prediction back to three dimensions.

Altitude and downrange:

```
altitudeM = hypot(x, y, z) - EARTH_RADIUS_M
downrangeM = atan2(x, y) * EARTH_RADIUS_M
```

`atan2(x, y)` is `0` on the pad. Gravity uses `EARTH_MU = 398_600e9` from the same file. `stepFlight` advances in substeps of `1/60` s (`SUBSTEP_S`). `advanceFlight` refuses a wall step longer than `0.1` s and then takes at most 48 of those substeps (`integrateSession`).

## Scene

`toScene` in `lib/flight/scene-scale.ts` multiplies metres by `METRES_TO_SCENE = 1e-6`. The globe radius drawn in `components/flight/FlightScene.tsx` is `EARTH_R = EARTH_RADIUS_M * 1e-6`, declared outside `Earth()`. The rocket mesh is larger than that scale so it stays visible.

Worked example. Altitude 200 km, downrange 10°:

```
radius = 6_378_137 + 200_000 = 6_578_137
x = radius * sin(10°) = 1_142_281.502493408
y = radius * cos(10°) = 6_478_200.317976467
scene = [1.142281502493408, 6.478200317976467, 0]
```

`referencePoint` in `lib/flight/reference.ts` is that conversion. It returns null when downrange was not published.

## Replay

`replayPose` in `lib/replay.ts` reads `mission.reference` when every sample has a finite altitude and a finite velocity. Those samples become the drawn position. If any altitude or velocity is null, the function keeps the schematic drawing and does not fill the gap.

The schematic is a function of time, not an interpolation of a flight:

```
arc = t / duration
theta = arc * 0.85
schematicAltitudeM = sin(arc * π) * 350_000
radius = 6_378_137 + schematicAltitudeM
x = sin(theta) * radius
y = cos(theta) * radius
```

Halfway along a mission whose last event is the end (`arc = 0.5`):

```
theta = 0.425
schematicAltitudeM = 350_000
x = 2_774_150.7075168607
y = 6_129_593.407621154
```

The replay caption is `replayDataCaption`. A practice mission reads `Data: Practice sample`. Any other mission reads `Data: ` plus `mission.source`, for example `Data: ESA launch timeline`.

## One flight screen

Your mission offers Custom flight or a selected Mission. Both use the same phone steering, engine power, physics and physical outcomes. The former public Flight replay entry is removed; quiet exhibit playback keeps its internal illustration clock. A selected reference is an optional guide, never an autopilot or a scoring corridor.

Phone rotation passes through a neutral band, a fine-control response below 60 degrees and one shared wall-time angular budget before the owner mixer; the physical quaternion then follows through limited torque. Larger pointing angles remain reachable, including inversion. Recalibration clears held steering while awaiting upright, and disconnect pauses until the phone reconnects.

The mission selection lives in `missionTrackId`. `GuidanceMarks` draws a single reference line from available samples even before launch; no corridor edges, deviation warnings, countdown, score or off-path failure remain. The reference clock cannot award orbit or end the visitor's flight. Milestones are informational. A mission with missing altitude, velocity or downrange has no invented path. Sentinel-6 currently supplies published milestone times only; the practice path is recorded from the simulated classroom profile and labelled accordingly.

Presentation defaults to 8× simulated time; Realistic restores 1×. Phone steering keeps the same wall-time angular budget at either pace. At 70% engine power, an upright presentation climb reaches 200 km in about 20.35 wall seconds. Between 30 and 150 km the automatic chase camera reveals the true spherical horizon while keeping the rocket legible; dragging the view retains manual framing. After launch the right panel keeps engine power, Pause and Try again, while the left shows the estimated CO₂ total. Setup returns when paused.

The scene uses the existing black background with no surrounding sky shell or additive globe-atmosphere overlay. The camera and rendered vehicle share stage-specific origin and midpoint calculations. They consume the same committed stage so framing cannot switch ahead of the mesh. The intro uses its existing 2.6-second interpolation directly, without a second easing pass. Thrust follows the physical nose, while existing momentum persists after turns.

## Outcomes

`classifyAnomaly` is the list the loop consults. Thresholds live in `ANOMALY`.

| Detector | Result |
| --- | --- |
| Ground, including the physics string `The rocket hit the ground.` | crashed |
| Swept active-body contact with pad, tower, tanks or buildings | crashed, `The rocket hit a launch-site structure.` |
| Tip-over below 1.5 km with a large pitch and pitch rate | crashed, `Loss of control.` |
| Dynamic pressure × angle of attack above 5e6 Pa·rad, or above 40 g | crashed, `The rocket broke apart.` |
| Descent faster than 800 m/s and faster than 3.5 km/s below 70 km after having been above 100 km | crashed, `Re-entry burn-up.` |
| Free flight, out of fuel, slower than 7.4 km/s | failed, `Suborbital: fell back` |
| Free flight leaving Earth (the classroom escape failure) | orbit, `Escape trajectory.` |
| Free flight, coasting, perigee at least 150 km, not intersecting Earth | orbit, `You are in a stable orbit.` |

Interactive flight sweeps compound capsules matching the active rendered rocket through each physical substep against Earth and the shared launch-site primitives. The visible deck height is shared by the vehicle, camera and collision poses; an upright departure clears the mount and arms. Stage separation replaces shapes without sweeping the dropped stage into the new pivot. Body contact owns ground classification in this path; the standalone classroom integrator retains its original point check. A conservative launch-kit bounds check skips distant structures. Reference and predicted lines appear only in Earth view.

A crash hides the intact rocket and stores `impact` at the contact point and keeps the last 4 s in `guide.trail`. `GuidanceMarks` draws that trail and a small burst beside the globe. The tone is a generated oscillator in `lib/flight/cues.ts`. The phone gets a long `vibrate` pattern. `failureReason` is set so the mascot can look sad without this branch editing mascot files.

## Fuel

`integrateSession` writes `flight.fuel.rp1ConsumedKg` on every flying step and calls `publishInteractiveFuel`. The emissions counter that subscribes to the store, or to that publisher, sees the same kilograms. Oxygen stays out of the RP-1 total.
