# One flight screen with an optional guide

## Approved behavior

The October 17 handset feedback requested one combined Your mission / Flight replay surface. Choose Custom flight or Mission, steer with the paired phone, and optionally follow the selected mission's path. Leaving the path never warns, counts down, scores, or ends the flight. The published timeline ending also cannot claim the visitor achieved orbit.

| Scenario | Before | After |
| --- | --- | --- |
| Enter flight | Separate mission and replay screens | One Your mission screen |
| Custom flight | Free flight mode | Custom flight, same physical controls |
| Select a mission | Replay controls or scored corridor | Optional reference line and mission source |
| Leave the reference | Warnings and off-nominal failure | Continue flying; no penalty |
| Timeline ends | Mission complete / orbit | Continue until an actual physical outcome |
| Published trajectory missing | Schematic illustration available separately | No invented historical guide; explain missing trajectory |
| Practice path | Simulated classroom profile | Explicitly labelled simulated practice |
| About | General data provenance | Explain altitude/downrange, spherical-Earth conversion and launch-site rotation |

## Implementation boundaries

Reuse the existing mission registry, selection state, physical integrator and reference path. Remove the public replay entry and duplicate replay controls. Preserve the quiet exhibit's internal illustration clock. Draw only supported reference samples from the pad onward, without corridor edges. Retain physical impact, structural failure, fuel, escape and stable-orbit outcomes identically for Custom and Mission. Keep mission milestones informational. About distinguishes published milestone times, unavailable measured trajectories and the simulated practice path.

The latest visual requests are part of the same reviewable repair: remove the sky shell and globe-atmosphere overlays so the existing black clear color remains visible, and place powered smoke behind the engine bells rather than across the textured body. Do not change rocket materials or thrust to conceal the smoke defect.

## Verification

Regression guards cover far-off-path flight, stale warning reset, timeline completion without a false orbit, genuine crashes, the guide visible before launch and no fabricated historical path. UI checks cover the single entry, both choices, phone-only launch, mode transitions and accurate About copy. Run the complete unit suite, typecheck, lint, WebGL checks and browser scenarios against an environment-free source copy. Reuse the existing public tunnel, preserving the original repository environment files.

## Scope and trade-offs

This is an educational spherical-Earth projection, not reconstructed historical 3D telemetry. The current historical Sentinel-6 record supplies published event times, not altitude/downrange trajectory samples. Its timeline is real data; its measured path is unavailable. The practice line is a simulation. No database/API/dependency/credential changes are needed. The coordinated input/rendering scope was approved earlier; this plan adds the requested UI consolidation and deletion of enforcement behavior.

## Pre-submit audit

- Applied: existing domain arrays remain `as const`; pure quaternion/vehicle-pose helpers have sentinel regression tests; actual phone frames, engine impulse and rendered pose contracts are pinned.
- Removed dead behavior: screen steering/handoff, limited phone cone, four spherical cloud sheets and shaders, duplicate pad steam meshes/shaders/budget helpers, corridor enforcement/ribbon generation, reference-clock completion, duplicate public replay entry and panel, and warning/countdown UI.
- Not applicable: list queries/limits, API responses, queues/retries, new flags, backfills and data-filter blast-radius queries. No database, network destination, dependency or credential changes were introduced.
- The behavior matrix and unchanged physics/data claims are in this plan. The coordinated scope exceeds the usual file/line limit and was explicitly approved; final edits receive one local follow-up commit after verification. No push or new PR is requested.

## Visual root cause evidence

Powered smoke did not change the Falcon GLB materials. Engine-attached billboards were emitted up the body, and a second pad steam bank/column could cover the skin in front of the depth buffer. The engine particles now sit at least their half-diagonal behind the bells, so any camera-facing corner remains behind the engine plane. Duplicate pad steam is removed; engine exhaust, local cloud puffs and brief cloud-crossing fog remain. All 76 material configurations remain unchanged across engine power. Actual GLB body pixels at full power match their engines-off colors; new real-GPU assertions guard against foreground exhaust washing out the body.

The final browser pixel check also caught the globe's independent additive atmosphere layer painting blue over the black clear color. Both textured and fallback atmosphere overlays and their unused globe shader are removed. The canvas regression measured a mean sky-channel value of 199.35 before the removal and requires under 3 afterward, allowing sparse stars. This checks actual pixels rather than only the background property.

## Final verification

The combined suite passes 1,027 tests with one existing skipped test. All 54 remaining real-WebGL checks pass, including the exhaust/body occlusion regression. The three browser scenarios pass for phone steering, phone-required launch, unified choices, About and repeated mode transitions. The transition scenario was rerun after the last globe-overlay removal and passes the actual black-sky pixel assertion. TypeScript, lint and an isolated production build pass; lint retains only the two pre-existing presentation image warnings. Independent reviews checked complete phone rotations, neutral launch, camera framing, optional-guide outcomes, source accuracy and quiet exhibit playback.

The final diff spans 78 files (including contract tests) because the phone pose crossed input, dynamics, drawing and camera, followed by the requested mode consolidation and effect deletions. The repair remains one local follow-up commit; it is not pushed or merged. The final build uses the isolated source copy. Public preview sources are synced separately from repository environment files.
