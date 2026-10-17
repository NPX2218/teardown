# Presentation flight, clear controls and physical collisions

## Requested behavior

Default to a presentation pace that reveals Earth curvature within 40 wall-clock seconds of a powered upright launch. A Realistic toggle restores 1× time. Keep gentle phone steering measured in wall time. Move desktop controls to the right, animate setup/calibration away after launch, and retain engine power with Pause and Try again. The left panel reduces to CO₂ so far during flight. Remove stray view-crossing lines and improve nearby launch-site buildings.

Physical contact between the active rocket body and Earth, the pad or structures causes the existing crash/explosion outcome. Waiting on the pad and a normal upright ascent remain safe. Exhaust, guide paths and separated decorative debris are not solid obstacles.

## Evidence and decisions

Existing 1× flight reaches 100 km only after about 96 seconds at full power. At 8×, unchanged classroom physics reaches 200 km in 15.20 wall seconds at full power and 20.35 seconds at 70% power. Presentation therefore defaults to 8×; 1× remains available. No artificial thrust or forced trajectory is added. Cutting engine power or steering back toward Earth can prevent ascent; the 40-second target describes a powered climb.

Current collisions sweep only the physical position against Earth. The 70 m visible body can intersect structures while its position is clear; the tower check is an angle/time heuristic. Pad geometry also intersects the initial body: Starbase's mount top is 13.2 m, whereas the rendered bells start at 0.6 m. Raise the displayed body to the actual deck plus the existing bell clearance, shared by drawing, camera and collision. Widen the Starbase arm gap to clear the fairing, so collision cannot punish a normal launch.

Use shared kit primitives for solid structures, with rounded tank caps and visible steel details. Sweep compound active-body capsules through each physical substep against the Earth sphere, oriented boxes, cylinders and tank-cap spheres. Use the same pose offsets as Vehicle and camera. Record the contact point through the existing impact/explosion path. The contact test must include translation and rotation so acceleration cannot tunnel through a structure. Keep the old scalar classroom profile arithmetic unchanged.

## Behavior matrix

| Case | Result |
| --- | --- |
| New flight / retry | Presentation 8× default |
| Realistic selected | 1× physical time |
| Powered upright climb | Curvature visible and rocket legible within 40 s |
| Phone movement at either pace | Same wall-time command response |
| Flying | Right: power, Pause, Try again; left: CO₂ amount |
| Ready / paused | Setup and calibration available |
| Resting on launch deck | Safe; no broad launch grace period |
| Upright ascent past mount and arms | Safe clearance |
| Body clips Earth / pad / tank / tower | Crash and explosion at contact |
| High-speed crossing / rotation-only contact | Swept collision catches contact |
| Clear near-miss | Continue flight |

## Verification and scope

Subtasks own pacing/HUD, camera/line rendering, and pure collision math separately. Integration and shared rendered geometry are reviewed together. Pin failures first, then run targeted contracts, full unit suite, typecheck, lint, WebGL checks, browser scenarios and a production build. Run application/build tests only from credential-free temporary copies; never run a repository build or inspect repository environment files. Reuse the public preview and sync intentional source changes only.

This is a coordinated follow-up across controls, framing, shared geometry, physics classification and tests. No database, API, queue, credential, dependency or data-source changes are required. Source and physics provenance remain as documented; launch-site objects are educational illustrations rather than surveyed models.

## Final integration review

Removed the synthetic early tower-angle detector. Interactive flight uses one authoritative body-contact path, including guidance's ground classification; standalone point physics remains unchanged. Stage separation checks each shape separately. The intact body and marker hide on impact and return on retry. Cached launch-kit bounds avoid testing distant structures; a 160-second Starbase climb fell from about 4.6 CPU seconds to 0.23–0.35 seconds in the independent sweep.

Browser QA reproduced Launch being blocked by the connection overlay, including its empty fixed-width wrapper. Pairing surfaces receive their own layout and transparent wrapper gaps. Setup text and preset choices move behind disclosures; Orbit flight is the long-fuel simulated preset, while Short hop intentionally returns to Earth. Emissions detail remains available behind a disclosure with footer padding.

The coordinated geometry/physics/camera/HUD repair exceeds the normal eight-file split target. It stays together because all consumers must agree on the launch deck, active body and contact authority; the user explicitly approved the coordinated scope. No external PR is being published in this follow-up.

Pre-submit audit: domain pacing choices use `as const`; new collision/pacing logic has sibling helpers and incident-named regression tests; obsolete tower constants, reason and detector are removed. No list query, queue, kill switch, backfill, new API response or changed data metric applies. Environment files stay untouched. Single local follow-up commit after verification; no push or merge.

## Verification results

- Full suite: 1,074 passed, one existing skipped, across 142 files. Final UI subset: 18 passed. Independent final collision sweep: 57 passed.
- Real WebGL shader/depth checks: 54/54 passed.
- Browser scenarios passed: phone custom/mission steering, pause/resume/retry and crash; powered presentation ascent above 150 km within 40 wall seconds plus Realistic toggle; no-phone launch guard/map; repeated mode transitions, About and black-sky checks. The phone scenario was rerun against frozen sources after a development source sync interrupted the initial run.
- Pairing layout passed at seven desktop/mobile sizes, including normal pointer targeting and a scannable QR. Emissions detail/footer spacing passed desktop and mobile.
- TypeScript passed. Lint passed with the two pre-existing presentation image warnings. Production compilation passed in a credential-free copy. Public preview returned HTTP 200.
