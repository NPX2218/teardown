# Flight coordinates

The simulator flies in a plane through the centre of the Earth. There is no latitude, longitude, or launch site in the code. Replay without a kinematic reference is a drawing of the mission clock, not a path that was flown.

## State

`createFlight` in `lib/flight.helpers.ts` starts the rocket at `(x, y) = (0, EARTH_RADIUS_M)` with `EARTH_RADIUS_M = 6_378_137`. Pitch `0` points straight away from the centre. Positive pitch turns toward downrange, which is `+X` on the pad. The tangent used by the scene is `(y, -x)` normalised.

Altitude and downrange:

```
altitudeM = hypot(x, y) - EARTH_RADIUS_M
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

## Two flight modes

Free flight is the default. Phone or laptop pitch steers `stepFlight`. Nothing holds the rocket to a path. Outcomes come from the existing classroom judge plus `classifyAnomaly` in `lib/flight/anomalies.ts`, which `integrateSession` calls after each substep. Direct `stepFlight` tests still see the classroom judge, including escape as a failure.

Mission mode follows `missionTrackId` on the store. The field is not named `mission`. `lib/replay.ts` and `lib/flight/reference.ts` read `mission.reference`.

When any sample has a null altitude or a null velocity, mission mode tracks milestones and the clock only. `FlightGuide.corridor` stays false. The note is `Reference trajectory unavailable`. No ghost, no corridor edges, and no autopilot. A missing number is not replaced with the classroom profile. Sentinel-6 stays in that state. The practice mission is the exception that already has numbers: a PRACTICE corridor recorded by flying the classroom profile, labelled simulated practice reference, not historical.

When every sample has altitude and velocity, the ghost and the altitude ribbon are drawn by `GuidanceMarks` (a sibling of `Earth()`, not inside it). The player still steers. With no phone connected, `autopilotInput` follows the reference pitch and speed. The HUD shows altitude, speed, and pitch error, a target-pitch line, and the correction cue.

One configuration, `CORRIDOR` in `lib/flight/corridor.ts`:

| Band | Rule |
| --- | --- |
| Green | inside 50 km, 500 m/s, and 20° |
| Amber | past that limit, under 1.5× |
| Red | past 1.5×, countdown 5 s |
| Fail | countdown ends, or one sample past 3× |

Returning inside 0.85× of the green limit clears the warning. Amber shows `Drifting off track` and one soft beep. Red shows `Return to trajectory`, a repeating tone, a red vignette, and a short phone vibration. The store fields `warningLevel` and `failureReason` are what the mascot reads. This branch does not edit the mascot.

Milestones are the mission events whose time has been reached. At the last event or sample, a run that is still nominal ends `Mission complete.` The end screen shows the fraction of corridor time spent inside and the RMS of the largest normalised error. A timing-only mission has no score, because there is no corridor.

## Outcomes

`classifyAnomaly` is the list the loop consults. Thresholds live in `ANOMALY`.

| Detector | Result |
| --- | --- |
| Ground, including the physics string `The rocket hit the ground.` | crashed |
| Tower strike in the first 5 s, below 100 m, pitched past about 69° | crashed, `Tower strike.` |
| Tip-over below 1.5 km with a large pitch and pitch rate | crashed, `Loss of control.` |
| Dynamic pressure × angle of attack above 5e6 Pa·rad, or above 40 g | crashed, `The rocket broke apart.` |
| Descent faster than 800 m/s and faster than 3.5 km/s below 70 km after having been above 100 km | crashed, `Re-entry burn-up.` |
| Free flight, out of fuel, slower than 7.4 km/s | failed, `Suborbital: fell back` |
| Free flight leaving Earth (the classroom escape failure) | orbit, `Escape trajectory.` |
| Free flight, coasting, perigee at least 150 km, not intersecting Earth | orbit, `You are in a stable orbit.` |
| Mission countdown or one extreme deviation | failed, `Mission failed: off nominal` |

A crash stores `impact` at the rocket position and keeps the last 4 s in `guide.trail`. `GuidanceMarks` draws that trail and a small burst beside the globe. The tone is a generated oscillator in `lib/flight/cues.ts`. The phone gets a long `vibrate` pattern. `failureReason` is set so the mascot can look sad without this branch editing mascot files.

## Fuel

`integrateSession` writes `flight.fuel.rp1ConsumedKg` on every flying step and calls `publishInteractiveFuel`. The emissions counter that subscribes to the store, or to that publisher, sees the same kilograms. Oxygen stays out of the RP-1 total.
