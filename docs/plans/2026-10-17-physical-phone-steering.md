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
