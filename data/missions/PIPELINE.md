# How the data becomes coordinates

The historical samples never become a latitude, a longitude, or a scene position. They are times. The playable rocket and the illustrated replay use other code, and that code does not read these samples yet.

## 1. Raw fields and units

File: `data/missions/sentinel-6-michael-freilich.json`, object `reference.samples`.

Each sample has:

- `t` in seconds after liftoff
- `altKm`, `downrangeKm`, `velMs` — null. No source gave a number, so none is stored.
- `pitchDeg` — null for the same reason
- `event` — a short name such as `liftoff` or `MECO`
- `source` — an id from `SOURCES.md`
- `quality` — `published` or `derived`. No sample is marked derived unless the time itself is a sum of published phrases.

The mission events beside that object are the four ESA rows the replay clock uses. Their `t` is the same second scale. Their `say` strings are the spoken lines. They are not positions.

## 2. Time base

`t = 0` is liftoff as an elapsed origin. It is not tied to an exact UTC second.

ESA's press line is "17:17 GMT" and the file sets `liftoffClock.exactSecondClaimed` to false. Launch Library 2's `net` of `2020-11-21T17:17:08Z` stays under `providers.launchLibrary2`. It is not added to any event time. No function converts `t` into a UTC timestamp.

Clock conversions that are stored:

- `2×60+16 = 136` for ESA's "2 minutes and 16 seconds"
- `3×60 = 180`
- `8×60 = 480`
- `1×60+1 = 61` for the NASASpaceFlight max-Q line
- `53×60+15 = 3195` for the insertion sample

That last sum is the only derived time. The function is the JSON note itself. There is no converter function in code, because the arithmetic is already applied and written down.

## 3. Downrange, altitude, and lat/lon

There is no lat/lon in the file. There is no altitude or downrange number. No function turns those fields into ECEF or ECI. Leaving them null is the whole step.

## 4. Earth model

Two different Earth figures exist, and they are not applied to the samples.

Published pair, in `data/flight/earth.json`: equatorial radius 6378.137 km and polar radius 6356.752 km, from the NASA fact sheet. Nothing in Anders's mission code builds a WGS84 ellipsoid from that pair.

Playable simulator, Neel's `lib/flight.helpers.ts` on `neel/12-integration` (not edited here):

- `EARTH_RADIUS_M = 6_378_137` (equatorial radius, metres)
- `createFlight` starts the rocket at `x = 0`, `y = EARTH_RADIUS_M`, `vx = 0`, `vy = 0`
- altitude is `hypot(x, y) - EARTH_RADIUS_M`
- gravity uses `EARTH_MU_M3_S2 = 398600 × 10^9`
- the state is a plane. No Earth-rotation term is added.

The sphere is a simplification. The polar radius is kept in the Earth file so it is not thrown away, and it is not the radius of the integrator.

## 5. Scene units and axis

Neel's `lib/flight/scene-scale.ts`:

```
METRES_TO_SCENE = 1e-6
toScene(x, y, z) = (x, y, z) each multiplied by METRES_TO_SCENE
```

`components/flight/FlightScene.tsx` sets `EARTH_R = EARTH_RADIUS_M * METRES_TO_SCENE`, which is 6.378137 scene units. The globe is a sphere at the origin. The pad marker sits at `(0, EARTH_R + 0.012, 0)` and is rotated by `-π/2` about X so the disc lies flat. Scene +Y is up. Physics +Y is away from Earth's center when `x = 0`.

`replayPose` in `lib/replay.ts` does not read `reference`. It draws a schematic:

```
arc = t / lastEventTime
schematicAltitudeM = sin(arc × π) × 350000
radius = 6378137 + schematicAltitudeM
theta = arc × 0.85
x = sin(theta) × radius
y = cos(theta) × radius
pitchRad = min(π/2, arc × 1.4)
```

That drawing is labelled illustrated motion. It is not the reference corridor.

## 6. Interpolation and resampling

None. `reference.interpolated` is false. Samples are the seven milestone times only. They are not spaced every 1–2 seconds.

A dense path would have needed a measured speed and altitude series, then:

- `downrangeKm` from integrating the horizontal part of speed
- `pitchDeg` from the flight-path angle, `atan2` of the vertical and horizontal parts

That step did not run. On 2026-10-17 the Shahar603 Telemetry-Data tree (Unlicense) had no Sentinel-6 folder, the archived Launch Dashboard catalog did not list this flight, the live API did not answer, and the FlightClub page for this mission no longer had a simulation. There is no raw file in `data/missions/raw/` and no worked kinematic example, because there is no input row to convert. The liftoff sample below stays the worked example: every kinematic field is null.

## 7. Smoothing and gap filling

None. Null stays null. The flyable preset's fuel masses are a separate classroom knob. They are not written back into the evidence file, and they are not a trajectory.

## Worked example: the liftoff sample

Stored row:

```
t = 0
altKm = null
downrangeKm = null
velMs = null
pitchDeg = null
event = "liftoff"
source = "esa-press"
quality = "published"
```

What runs:

1. Time base. `t` stays 0. It is not converted to `2020-11-21T17:17:08Z`.
2. Position. All three kinematic fields are null, so no ECEF, no ECI, and no call to `toScene`.
3. Pitch. Null. `replayPose` may still draw its own schematic pitch later, and that number is not written into this row.

What a scene conversion would look like for the simulator pad, which is not this sample:

```
physics (x, y) = (0, 6378137) metres
toScene = (0 × 1e-6, 6378137 × 1e-6, 0) = (0, 6.378137, 0)
```

`createFlight` in `lib/flight.helpers.ts` is the function that builds that pad state, and only after someone starts the flyable preset. It does not read the liftoff sample.

## 8. PRACTICE corridor

Sentinel-6 stays the seven milestone times above. The practice mission is a different file, `data/missions/practice.json`, and its `reference` is a PRACTICE corridor.

Method, in `scripts/record-practice-corridor.ts`:

1. Start `CLASSROOM_LAUNCH` with `createFlight`.
2. Fly `CLASSROOM_ORBIT_PROFILE` through `stepFlight` at 1/60 s. That is the same integrator the exhibit uses. It is not a second physics model and not a historical trace.
3. Every 2 seconds, store altitude (`hypot(x, y) - EARTH_RADIUS_M`), downrange (`atan2(x, y) * EARTH_RADIUS_M`), speed (`hypot(vx, vy)`), and commanded pitch (`pitchRad`).
4. Keep the row where the classroom profile reaches orbit.
5. Set `reference.interpolated` to true so mission mode can read between those rows. The label is `PRACTICE corridor. Simulated practice reference, not historical.`

That corridor is a simulated practice reference, not historical. It is not pasted onto Sentinel-6. Re-record with `npx tsx scripts/record-practice-corridor.ts --write`.
