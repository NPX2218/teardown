# Autonomous build lanes

This is the execution handoff for the approved scope in [07](../specs/07-replay.spec.md). It supersedes the old “implement one task, then stop” instruction when the user asks for an autonomous lane build. It does not itself start an implementation or authorize publishing/deployment.

## Ownership

| Lane | Owns | Must not edit concurrently |
|---|---|---|
| Neel | 00 design system; 03 explorer; 07 flight physics, globe/cameras, input/HUD and historical replay UI; 10 phone controller; 11 pairing/continuous phone steering; corner mascot launcher, shared Motion provider/presets and app animation | Anders's provider, data, voice or emissions modules |
| Anders | 02 parts; 06 historical mission evidence; validated `data/flight` scenario inputs; 04 guide/tools; 05 voice/audio; 09 Imagine if retained; 13 emissions calculations/sources and embedded readout component; polished README and animated hackathon presentation | Neel's physics, viewer, phone or main flight UI |
| Neel as integration owner | Initial 01 scaffold/shared contract and pinned Motion dependency, `lib/types.ts`, `lib/store.ts`, package/lockfile and shared page composition; final 12 integration | One writer only; Anders requests a contract delta rather than editing these at the same time |

Phone-controller support is included. Optional means visitors can choose local controls; the phone lane must still be implemented. Engine-out is excluded. Emissions are embedded in flights. No docking, station, booster-landing gameplay or interplanetary scope.

## Required presentation and documentation

Anders owns the README and complete animated browser slideshow, speaker notes, media and static PDF backup in [12](../specs/12-demo-submission.spec.md#required-readme-presentation-and-motion-deliverables). Neel owns shared design tokens, the Motion provider/presets and app animation, and reviews the README/deck for visual consistency. Anders owns `app/presentation/*`, `components/presentation/*`, `docs/presentation/*`, `public/presentation/*` and `docs/media/*`; this explicit ownership extends the file table in the build index. The deck route is separate from the three app navigation modes. Start story/structure early; capture and label actual implemented features before finalizing evidence. These are required completion deliverables, not optional polish.

## Initial contract gate

1. Neel creates the pinned scaffold and the new flight types/actions/input mixer from 07 §6, with contracts for historical data, scenario inputs, consumed-fuel telemetry and emissions readout.
2. Anders can research sources and prepare independently validated data while that is happening. He does not need to wait idle.
3. Neel lands the tested contract once. Both lanes start from that same commit and pin its interfaces. Use typed fixtures/placeholders for unfinished providers; record their limits.
4. A consumer can build against a fixture, but cannot mark live integration complete until the real provider and its acceptance checks pass. A required interface change goes through the integration owner with affected tests updated together.

## Task allocation inside 07

07's tasks describe the integrated feature; they do not transfer ownership of every listed file to Neel.

| 07 task | Neel | Anders |
|---|---|---|
| 1 shared contract/evidence | Shared types/store/scaffold and scenario validation interface | Historical/scenario evidence, data values and source validation |
| 2 physics | Pure simulator, staging/mass/fuel ledger, orbital elements and physics tests | Review supplied vehicle/mixture/combustion units; no duplicate physical ledger |
| 3 scene/controls | Globe, rocket, camera, local controls, outcomes and browser tests | Supply data/assets with provenance through agreed interfaces |
| 4 replay/emissions | Historical replay UI/clock, scenario UI, fuel/readout adapter and component placement | Mission records, emissions helper/embedded component and estimate provenance/tests |
| 5 integrations | Phone app/link/input, input ownership and exhibit lifecycle/shortcut composition | Agent/tools, voice, guide responses and their cancellation/run-id adapters |
| 6 design/review | Global layout/tokens, mascot launcher, visual polish and browser/device evidence | Guide content/provider state, source disclosures, credits and README contribution |

## Autonomous loop for each lane

- Read the spec index, lane ownership, current scope notices and the owning stage's acceptance requirements before editing. Current notices and 07 migration win over legacy snippets.
- Work on an isolated branch/worktree based on the agreed contract commit. Stay inside owned files; communicate interface needs instead of racing another writer.
- Implement one coherent task at a time: failing behavior test, minimal implementation, relevant checks, manual diff review, local commit. Then continue to the next ready task without requesting routine approval.
- Run the full lane/project checks at integration boundaries. Browser behavior needs browser evidence. Fixtures do not establish real phone/provider behavior; do not carry old checkpoint test counts forward.
- If another lane's provider is incomplete, use its agreed typed fixture and continue independent tasks. Mark the dependent acceptance gate pending; never invent a successful API response or silently replace historical data with practice.
- Do not expand scope. Do not force-push, deploy, submit or publish without the user's authorization. Missing credentials, physical-device access or an unresolved product decision are specific blockers; continue unaffected work and report exactly what remains.
- Finish with commits, tests actually run, remaining integration/device gates and the handoff interface version. No lane claims the assembled app is done on the strength of fixture tests alone.

## Ready-to-use lane prompts

**Neel lane**

> Read docs/specs/README.md, docs/plans/00-index.md, docs/plans/AUTONOMOUS-BUILD.md and the current specs for 00/01/03/07/10/11/12. Include the shared Motion dependency/provider/presets, polished app motion and visual review of the README/presentation. Implement Neel's lane autonomously within the approved Earth-orbit scope. Own the initial shared contract gate and integration files. Keep Anders's modules behind their agreed typed seams. Implement phone support as an included deliverable and preserve a full local-control path. Test, review and commit each coherent task, then continue to the next ready task. Do not start the retired checkpoint/stars mission, engine-out UI or standalone emissions mode. Report specific blocked acceptance gates without stopping independent work. Do not publish or deploy without separate authorization.

**Anders lane**

> Read docs/specs/README.md, docs/plans/00-index.md, docs/plans/AUTONOMOUS-BUILD.md and the current specs for 02/04/05/06/09/12/13 plus 07's shared migration contract. Implement Anders's lane autonomously within the approved Earth-orbit scope, including the polished README and animated browser presentation with speaker notes and static PDF backup. Prepare source-backed data immediately, then use the agreed shared contract commit. Own provider/data/voice/emissions modules; request shared-contract changes through Neel's integration owner. Drive interactive emissions from the simulator's consumed RP-1 ledger, and distinguish historical milestones from simulated telemetry. Test, review and commit each coherent task, then continue to the next ready task. Do not edit Neel's physics/viewer/phone modules or build retired engine/emissions destinations. Report specific blocked acceptance gates without stopping independent work. Do not publish or deploy without separate authorization.

## Final integration gate

Neel integrates both lane results after their checks pass. Both verify real provider behavior, a successful and a failing public-control flight, integrated emissions, the QR-connected phone controller, reset/disconnect behavior, the revised design/credits, polished README, animated presentation/static PDF and measured demo timing. Check 07 §7 and 12; no unverified gate becomes “done” because the lane finished its code. Hardware evidence still requires an accessible phone, and live-provider evidence requires configured services.
