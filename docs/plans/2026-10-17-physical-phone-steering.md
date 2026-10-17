# Physical phone steering repair

## Problem and evidence

The October 17 follow-up to PR #34 reproduced a visible 30 degree side lean with exactly the upright rocket's position and velocity. Phone gravity supplied two lean angles, but the command, state and dynamics stored only pitch. Vehicle added the other lean in camera space after drawing the physical nose. Existing tests explicitly allowed that mismatch.

Two independent control defects also reproduced: disconnected practice missions replaced accepted screen commands with reference autopilot commands, and recalibration retained the previous phone command while waiting for upright. Connected free-flight steering was unaffected by the autopilot condition.

## Approved behavior

| Scenario | Before | After |
| --- | --- | --- |
| Fore/aft phone lean | Physical pitch | Physical pitch with gentle input response |
| Side phone lean | Cosmetic rotation, no force | Physical crossrange attitude and thrust |
| Diagonal lean | Inconsistent simulator gravity/pose | Consistent two-axis command and physical nose |
| Camera moves | Side lean changes visual frame | Physical nose remains authoritative |
| Turn while moving | Existing velocity preserved | Existing velocity preserved; thrust curves path |
| Engines off | Attitude can turn | Attitude can turn; no steering impulse |
| Mission without phone | Reference overrides pilot | Pilot controls; reference only judges/advises |
| Recalibration | Old lean remains held | Steering neutral while awaiting upright |
| Time warp | Fast attitude response | Phone target changes limited in wall time |
| Map, trail, impact | Planar projection | Actual three-dimensional position |

## Architecture

Phone gravity -> calibrated two-axis lean -> radial deadzone/quadratic response -> wall-time slew -> existing owner mixer -> torque-limited physical attitude -> body-axis thrust -> velocity -> position -> scene and orbital prediction.

One pure nose-direction function serves dynamics and drawing. Physics retains fixed substeps, fuel debit/burn slicing, gravity and drag. Optional yaw, crossrange position and velocity default to zero for previous state shapes. The predictor projects the actual position/velocity into their orbital plane, reuses its conic math, then lifts points back into three dimensions. No second display-only phone attitude remains.

The phone response uses a 2 degree neutral band, a quadratic response through 60 degrees of lean, and a 12 degree/second wall-time command limit. These are interaction choices driven by the October 17 request for reduced sensitivity, covered by deterministic tests and subject to real handset feel testing.

## Review and verification

Independent ownership: dynamics and shared nose; phone calibration/mixer/response; drawing and map; integration/guidance and overall verification. Review the combined diff for coordinate signs, optional legacy defaults, resource lifecycles, ownership and no direct velocity writes from input.

Regression tests must fail first: four cardinal leans plus diagonal; displayed nose equals physical engine impulse; arbitrary camera; inertia and engines-off behavior; wall-time response at 1x/4x/8x; recalibration; local mission control; 3D orbital rotation invariance; crossrange trails/impact; pause/retry/reconnect. Run full unit suite, typecheck, lint, rendering checks and browser scenarios. Sync only intentional source changes into the existing temporary tunnel copy; the original `.env.local` remains untouched.

## Mechanism references

- https://github.com/pmndrs/cannon-es/blob/master/src/objects/Body.ts — body-local force transformed through physical orientation, then force integrated into velocity.
- https://github.com/RocketPy-Team/RocketPy/blob/master/rocketpy/simulation/flight.py — independent three-dimensional position, velocity and attitude, with body forces transformed to inertial coordinates.

## Limits and unchanged behavior

This remains a spherical-Earth educational simulator rather than a certified six-degree-of-freedom aerodynamic model. Phone side lean is not compass heading. Mission references and historical replay data remain as published. Fuel chemistry, stage masses, emissions factors, historical illustration clocks and provider routes are outside this repair. The previous rendering repair remains intact.

## Pre-submit audit

| Requirement | Result |
| --- | --- |
| List query limits, typed API responses | Not applicable: no API or database changes |
| Domain arrays `as const` | Applied to new direction/warp test tables; existing mode constants retained |
| Queues, retry/drop reporting | Not applicable: no queue changes |
| Kill switches gate work | Not applicable: no new flags |
| Shared runtime filter in backfills | Not applicable: no backfill |
| Pure helpers and contract tests | Shared attitude and phone-response helpers; deterministic sentinel regressions |
| Dead code | Removed cosmetic flight attitude, `withoutPitch`, Vehicle ownership helper, and reference autopilot |
| Behavior matrix and unchanged claims | Included above; no new PR requested |
| Filter/metric blast-radius query | Not applicable: no data filters or analytics changes |
| Diff size | Exceeds 8 files because the same omitted axis crossed input, physics, projection and prediction; coordinated scope explicitly approved |
| Attribution/identity | No tool attribution; retain existing user identity |
| Security surface | No dependencies, external destinations, permissions, credentials or server routes added |

## Verification outcome

The final combined suite passed 954 tests with one existing skipped test. All 58 real WebGL rendering checks and all three browser scenarios passed. TypeScript and production build passed; lint reports only the existing presentation image warnings. Independent review found no blocking defects. The original planar classroom profile matched all 22,921 substeps through the same orbit success. The new public preview was restarted from an isolated source copy with public tunnel settings; repository environment files were excluded throughout.

## Full-orientation follow-up

The handset test requested phone-only steering, the complete Explore orientation including twist, and an open sky. The prior two-angle response still discarded twist and restricted pointing to a cone. The approved behavior is full pointing and twist with physical thrust and momentum, while retaining the upright liftoff clamp.

| Scenario | Previous repair | Follow-up |
| --- | --- | --- |
| Phone pose | Gravity-derived pitch and side lean | Explore’s calibrated quaternion delta, with flight-neutral calibration |
| Twist or inverted pointing | Discarded or clipped | Complete physical orientation retained |
| Input response | Two-angle cone | One wall-time quaternion turn budget; fine control below 60 degrees, all larger orientations reachable |
| Steering controls | Phone/screen handoff and screen slider | Phone only; screen retains engine power, calibration, pause and retry |
| Disconnect/replay Play | Could fall back to local steering | Wait for phone, reclaim neutral phone control explicitly |
| Cloud crossing | Four patterned spherical sheets | Soft cloud puffs and brief fog; no surrounding sheets |

The runtime path is `Explore calibrated delta -> fixed phone/flight axis remap and complete rotation inversion -> gentle quaternion response -> owned input -> torque-limited physical quaternion -> drawing and thrust -> velocity and position`. Rendering reads the full quaternion, preserving twist rather than rebuilding rotation from the nose alone. A transported radial reference frame avoids a control-heading discontinuity at the crossrange poles. Old scalar inputs remain available to deterministic scenarios and profile recording, preserving their existing arithmetic.

The sky root cause was reproduced by drawing the actual cloud shaders with and without the four double-sided spherical meshes. Their high-frequency noise resembled a water surface overhead. Removing those sheets eliminated the apparent ceiling; the physical model independently climbed to 193.8 km at 120 simulated seconds under upright full thrust. The remaining cloud puffs and fog fade outside the crossing band. Automatic upside-down abort is retired because inverted orientation is now an intentional control input.

Verification includes independent raw quaternion/matrix mapping, complete orientation and engine impulse agreement, twist through the actual Vehicle callback, full inversion, sign-equivalent quaternions, pole crossing, shared torque and wall-time limits, phone-only launch/resume/keyboard behavior, and real before/after sky images. Browser scenarios replace the retired screen-steering path with phone-only controls and a no-phone launch guard.

## Handset direction and camera follow-up

The next handset report requested reversal of every mission steering axis. Flight now inverts the complete remapped quaternion, including twist and combined rotations. Explore’s display mapping stays unchanged. A held calibration pose now produces identity flight input: previously the accepted initial lean was restored into flight, allowing a 10-degree calibration lean to produce 92.13 metres of lateral travel in 20 seconds. Raw quaternion/gravity regressions cover both shell mounts, both lean signs and nonzero world heading, requiring exactly zero horizontal position and velocity throughout a neutral launch.

The camera investigation also separated apparent motion from actual drift. Upright powered flight has exactly zero horizontal velocity; returning upright after a turn retains physical momentum. The intro camera was eased twice, leaving it about 300 km from the stationary rocket at the declared 2.6-second endpoint and briefly overshooting its final distance. The intro now applies its existing smooth interpolation directly and reaches the chase shot at that endpoint. The camera target also differed from the rotated mesh midpoint: a 30-degree lean produced a 14.66 m mismatch. A shared vehicle-pose helper now supplies both the mesh origin and camera center, including the existing stage pivots, surface clearance and upper-stage geometry bounds. Actual camera/Vehicle callback regressions verify the endpoint, centered framing through tilt and staging, and continued tracking during horizontal motion without changing momentum.
