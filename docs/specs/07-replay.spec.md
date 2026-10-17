# 07 · Historical Replay + Orbital Mission — Implementation Spec

**Owner:** Neel · **Plan:** [07 build plan](../plans/07-replay.md) · **Depends on:** 01 shared state, 02 vehicle data, 03 viewer; 06 for historical data. Phone-controller support (10/11) is included in the build. Its use is optional for visitors, and it is not a prerequisite for completing a flight.

**Current scope — 2026-10-17.** This revision replaces the six-checkpoint guided mission, coach, participation stars and optional challenge mode in the previous version. “Your mission” is now a playable Earth launch-to-orbit challenge. This document also defines the migration of the affected 01/04/05/11/12/13 seams; those older checkpoint snippets must not be assembled into the new game. Unrelated shared types and messaging remain governed by 01. No new game code or runtime verification is claimed by this revision.

## 1. Approved experience and boundaries

| Area | Required behavior |
|---|---|
| Explore | Inspect the real Falcon 9 model; rotate, zoom, separate parts, read facts and take the tour. Camera movement works with mouse, touch and keyboard. |
| Flight replay | Watch a named historical mission using sourced event data. Play, pause, seek and restart; see sources, uncertainty and estimated emissions inside the flight view. |
| Your mission | Launch from a ground launchpad on a full 3D Earth. Control rocket pitch and throttle continuously, build sideways speed, and reach orbit or fail. |
| Setting | Earth, atmosphere, sunlight and a restrained space/star backdrop. An Earth overview and a rocket-follow view explain the same flight. |
| Launch location | A space centre/launchpad on Earth's surface. No launch from an orbital station. |
| Goal | Earth orbit only. No docking, station rendezvous, booster landing, solar-system travel or interplanetary missions. |
| Navigation | Exactly Explore, Flight replay, Your mission. Engine-out sandbox is deferred; emissions are embedded flight readouts. |
| Custom flights | Use the same launch-to-orbit rules with bounded preflight payload/fuel presets. No ship editor, arbitrary stage designer or separate physics engine. |

Kerbal Space Program is a reference for player agency and understandable consequences, not a requirement to reproduce its full simulator. A full 3D globe does not require six-degree-of-freedom aerodynamics: the first version uses a fixed orbital plane with continuous pitch and throttle. The renderer places this simulated path around the globe. Yaw, roll and orbital-plane changes are outside this build.

The two flight experiences have separate truth boundaries:

| Experience | Where its numbers come from | Meaning of interaction |
|---|---|---|
| Historical replay | Published mission events and, only when available, separately sourced telemetry samples | Seeking changes displayed historical time. It never changes the historical outcome. |
| Historical-reference flight | A named mission's sourced vehicle/payload inputs, with disclosed simplifications | The visitor flies a new simulation based on that reference. Deviations are simulated; they are not a replay of actual telemetry. |
| Custom flight | Validated scenario presets plus the same simulation | Pitch, throttle, fuel and staging change the computed trajectory and estimated emissions. |

“Live” in the interactive HUD means live computed state. The first version does not connect to a current SpaceX telemetry feed. “Real flight data” must never be used as a label for invented positions, velocities, attitude or emissions.

## 2. Flight replay: data and behavior

06 owns acquisition, provenance and validation. The public demo must select a real mission with verified outcomes; the practice fixture is an explicitly labelled practice choice or explicitly visitor-selected, clearly disclosed data-unavailable fallback.

**Initial reference:** Sentinel-6 Michael Freilich, 21 November 2020, Vandenberg. Its published postflight summary supports these approximate milestones:

| Elapsed time | Displayed milestone | Evidence |
|---|---|---|
| 0 | Liftoff | [ESA launch confirmation](https://www.esa.int/Newsroom/Press_Releases/New_Copernicus_satellite_to_monitor_sea-level_rise_launched) |
| ≈136 s | Main-engine cutoff, separation and upper-stage ignition, grouped | [ESA approximate launch milestones](https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-6/Launch) |
| ≈180 s | Fairing separation | ESA milestones |
| ≈480 s | Upper-stage cutoff and booster return, shown as approximate grouped milestones | ESA milestones; [NOAA monitoring report §4.3.1](https://www.fisheries.noaa.gov/s3/2024-01/Vandenberg-2019LOA-MonRep2020-OPR1.pdf) |

The replay covers this first-eight-minute segment. It does not claim that satellite deployment or the whole mission ended then. The original [SpaceX webcast](https://www.youtube.com/watch?v=aVFPzTDCihQ) is an additional viewing source, not proof that exact timestamps have already been extracted.

- Preserve source precision. Grouped events stay grouped in the UI; equal approximate event timestamps are valid. Do not invent individual exact times to satisfy a validator.
- A timeline is not a trajectory. This initial source set supplies no continuous position/speed/attitude series. Label the scene “Real mission · approximate milestones · illustrated motion.”
- Missing Max-Q, entry-burn or landing-burn times stay missing. Validation distinguishes malformed data from genuinely unavailable events. Unknown booster serial/flight count is omitted, not fabricated.
- Do not use the March 2020 practice schedule as evidence of a successful actual landing. Its sample status must remain explicit.
- Replay end, scrub range, current event and pose anchors derive from the selected mission. No fixed 532-second duration or sample-specific event constants.
- Pose is a pure function of mission and time; seeking backward must restore every transform, opacity and flame. Missing burn data cannot create a flame labelled as observed.
- Play speaks events reached by advancing the clock. Seeking resynchronizes silently; restart re-arms narration. No stale narration after exit/reset.
- Reduced motion uses event poses and camera cuts. Time, captions and controls remain fully functional.
- Emissions are the estimated historical calculation from 13, with assumptions visible. They are not measured mission telemetry.

## 3. Orbital mission loop

```text
Briefing → choose reference/custom preset → launchpad → player launch
  → steer and manage thrust → automatic stage separation → upper-stage ascent
  → cut thrust and establish a bound orbit → orbit achieved
  ↘ surface impact / escape / invalid simulation → clear failure reason → retry
```

The briefing explains in plain language: “Go up, then turn to build speed around Earth.” It shows the objective and controls before launch. It never pauses the physical flight at a scripted gesture checkpoint.

**Player controls**

| Input | Flight control | Camera control |
|---|---|---|
| Mouse | Drag a labelled pitch control; throttle slider; launch/pause/retry buttons | Drag scene to orbit, wheel to zoom |
| Touch | Hold pitch-left/right buttons or drag pitch control; throttle slider; all actions ≥48 px | Drag scene to orbit; pinch to zoom |
| Keyboard | A/D or left/right for pitch; W/S or up/down for throttle; Space launch/pause; R retry | Focused canvas keys use a documented camera modifier; Home restores view |
| Optional phone | Calibrated continuous pitch command; touch throttle on phone or screen | Phone pitch never also rotates the camera/model through the old orientation path |

Pitch input changes the thrust direction and the rocket mesh together. Camera dragging never steers the rocket. Focused text inputs, dialogs and sliders own their keys; global shortcuts must not steal them. Key-up, pointer-cancel, blur, tab hiding and disconnect clear held controls.

Ownership is per control axis: one source owns pitch at a time, while throttle may remain on the local screen when phone pitch is active. A single input mixer combines those validated commands for the current run; no second path writes physical state. Switching an axis owner clears its residual input and requires a neutral/calibrated sample. With no phone, the complete mission works locally. A phone disconnect pauses the simulation and offers local controls; reconnect requires explicit resume and never applies buffered sensor frames.

Steering responsiveness uses wall-clock input time. Time warp speeds the physical integration, not the rate at which a held input becomes uncontrollable. Offer 1×, 4× and 8×; start at 1× on the pad. Changing warp cannot bypass collision or win checks. Optional guidance displays a target direction or short hint; it does not supply hidden thrust, rotate the vehicle automatically or complete an objective.

## 4. Simulation contract

**Authority:** a pure deterministic helper owns the physical state. React/UI, the renderer, the guide and phone gestures cannot write position, velocity, fuel, success or failure directly.

| State | Required fields |
|---|---|
| Run | Unique run id; scenario id; ready/flying/paused/orbit/crashed/failed status; simulated time; pitch owner and throttle owner |
| Flight | Earth-centred position and velocity in a fixed two-dimensional orbital plane; pitch relative to the local radial direction; throttle; active stage |
| Vehicle | Dry mass, payload mass, per-stage remaining propellant, thrust/flow parameters and their source or tuning classification |
| Derived HUD | Altitude, radial speed, tangential speed, total speed, pitch, fuel, stage, osculating periapsis/apoapsis and estimated cumulative CO₂ |
| Outcome | One terminal result, plain-language reason and final readout snapshot; no checkpoint or reaction-time stars |

Future shared types live in `lib/types.ts`: `FlightScenario`, `FlightInput`, `FlightState`, `FlightReadout`, `FlightOutcome`. Pure functions live in sibling `lib/flight.helpers.ts`: `createFlight(scenario)`, `stepFlight(state,input,dt)`, `orbitFromState(state)`, `readFlight(state)`. Stage mass/flow and environmental inputs live in validated `data/flight/*.json`; product thresholds are tagged as gameplay tuning, not verified Falcon 9 specifications.

**Dynamics and units**

- SI internally: metres, seconds, kilograms, newtons and radians. Display km/km/s only at the HUD boundary. Earth radius and gravitational parameter have explicit sourced units.
- Earth-centred central gravity points toward Earth and varies with radius. Thrust follows pitch relative to the current local vertical/tangent. Radial climbing alone is not orbit.
- Propellant decreases with actual throttle and engine/stage operation; total mass follows it. Clamp consumption to available fuel. Do not treat total LOX/RP-1 propellant as kerosene burned.
- Automatic stage separation occurs once when the first-stage fuel is exhausted. Remove only the documented spent dry mass. Upper-stage ignition uses its own mass, thrust and flow. The old nine-engine failure toggles are not part of this feature.
- Use a documented simple atmosphere/drag approximation during ascent; identify coefficients as model assumptions. No claim of certified flight fidelity, heating simulation, real engine-control software or long-term orbit lifetime.
- Use a fixed numerical substep at most 1/60 simulated second. Cap accepted wall-clock frame delta at 0.1 second before 1×/4×/8× scaling, allowing at most 48 physical steps per visible frame. These are provisional responsiveness/budget choices from this scope revision; verify integration accuracy and responsiveness before accepting them.
- Process input, fuel/staging, forces/integration, surface intersection, orbit derivation and terminal checks in one defined order. Use segment-to-sphere impact detection so an accelerated step cannot tunnel through Earth.
- Pause/hidden-tab means no physical, fuel, emissions or success-clock advance. Resume discards catch-up time. Frame cadence must not alter the outcome beyond a documented numeric tolerance.
- Invalid/non-finite state stops in a recoverable “Simulation stopped” result. It cannot become an orbit, silently reset or display NaN/Infinity.

**Orbit calculation and success**

From current Earth-centred position `r` and velocity `v`, derive specific orbital energy `ε = |v|²/2 − μ/|r|` and angular momentum `h = |r × v|`. For valid bound states (`ε < 0`), derive semimajor axis `a = −μ/(2ε)`, eccentricity and periapsis/apoapsis radii. Subtract Earth radius for displayed altitudes. Guard zero radius, near-parabolic energy, floating-point roundoff and non-finite inputs. Radial/suborbital paths and escape trajectories cannot pass.

The provisional classroom target is a bound Earth orbit with **periapsis at least 200 km**, **apoapsis at most 2,000 km**, and **thrust off for ten consecutive simulated seconds** while those conditions hold. The HUD explains the lowest point as “the lowest part of your path around Earth.” These are game objective settings chosen in this revision, not an atmosphere cutoff, actual mission requirement or guarantee of long-term stability. Store them in the scenario configuration and tune only with corresponding objective text and regression updates.

Reaching a high altitude, pressing Space, finishing narration, matching a replay time or simply running out of fuel must never award success. Stopping thrust too early should produce an Earth-intersecting path and ultimately a crash. Fuel exhaustion with no valid orbit is not an instant explosion: show “Out of fuel — your path returns to Earth,” then allow coast/pause/retry. Surface impact is a terminal crash. Escape is a terminal failed Earth-orbit objective. No cinematic failure substitutes for the computed outcome.

Sources for the explanation/model boundary: [NASA orbit explanation](https://spaceplace.nasa.gov/orbits/en/), [NASA gravity and mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-4/), [NASA Earth fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html), [ESA orbit types](https://www.esa.int/Enabling_Support/Space_Transportation/Types_of_orbits). Low Earth orbit still experiences drag; a short simplified coast is not evidence of permanent stability.

## 5. Scene, HUD and feedback

- Full spherical Earth with recognizable geography, atmosphere and a restrained star backdrop. Start at a visibly marked ground launchpad. Clearly distinguish scale exaggeration for legibility from physical units.
- Maintain SI-scale physics independently of render units. Use a consistent conversion and camera-relative/floating-origin strategy for surface precision. Camera near/far planes must support both views without clipping, jitter, z-fighting or a disappearing rocket.
- Rocket-follow view shows orientation, thrust and horizon; Earth view shows the current position and predicted orbital path. A far-view marker identifies a rocket too small to see at true scale. Switching views does not change flight state.
- Predicted path is explicitly a current-state coast projection, not a guaranteed future path while thrusting. Its Earth intersection is visible. Avoid drawing a closed safe orbit for an unbound or ground-intersecting path.
- HUD: altitude, sideways speed, stage/fuel, throttle, pitch, objective progress and a small estimated CO₂ readout. Advanced telemetry is a disclosure, not a wall of tiny numbers. Periapsis/apoapsis include plain-language labels.
- Surface impact has a restrained crash cue, the cause and a prominent retry action. Orbit success explains what the player achieved and shows final flight/emissions values. No automatic win assist or fake performance score.
- All layout, mascot and authorship rules follow 00. The next builder must redesign the generic preview layout; this specification update does not perform that redesign.
- Ambient rotation and decorative camera motion are disabled during piloting. Reduced motion removes camera fly-throughs, shake and flashes while preserving the physically necessary attitude and path feedback.

## 6. Cross-stage migration contract

This table is the authoritative change list for the next implementation. Remove the superseded path rather than running both directors.

| Owner / stage | Required migration |
|---|---|
| 01 shared contract | Add separate `flight` state and actions listed below; keep historical `replay` independent. Remove `MissionState` checkpoint/results/stars and its progression actions once their consumers migrate. Keep unrelated relay/message types. |
| 03 viewer | Mount a dedicated `components/flight/FlightScene.tsx` during piloting. Explorer orbit controls and phone direct mesh orientation do not compete with flight attitude. Suspend the inactive render loop. |
| 04 agent | Keep public `start_mission` tool name, with optional validated `scenario_id` (default reference scenario); remove `mission_id` replay coupling. Route it to `startFlight`. `start_replay` still takes historical mission id. Remove `set_engines_out` tool and standalone engine fallback. |
| 04 readout/prompt | `get_state` returns mode, run id, scenario, flight status/readout/outcome and emissions estimate provenance. Remove `missionStars`/checkpoint coaching. Guide may explain or prepare a scenario; it never steers, advances physics or awards success. |
| 05 narration | Flight status transitions trigger short callouts once per run. Keep existing voice delivery/cancellation seams. Retire six-gesture prompt caches as required game assets. Speech failure cannot pause or finish flight. |
| 06 historical data | Preserve precision/provenance; validate available events without inventing Max-Q/burn times. A historical reference scenario needs separate validated physical inputs, not a fabricated trajectory from event times. |
| 08 engine sandbox | Deferred, with legacy build instructions commented out. Physical engine facts remain available for Explore and the flight model. No engine-out navigation or tool surface. |
| 10/11 phone | Existing secure pairing, motion permission and audio remain reusable. Replace checkpoint-to-`completeCheckpoint` bridge with optional calibrated continuous pitch input. No direct quaternion overwrite during flight. |
| 12 exhibit | M opens the briefing. Space launches or pauses/resumes, respecting focus. It cannot skip to success. Escape returns to the exhibit and cancels the run. Remove shortcut 2 and six-Space completion script. |
| 12 lifecycle | On exit/retry/reset, stop physics, clear held input, cancel speech/coaching, reset accumulated emissions and invalidate late run callbacks. Active player inputs count as activity. A simulator tick alone does not keep an abandoned exhibit alive. |
| 13 emissions | Embed in both flight surfaces; no Emissions tab/lens/standalone sheet. Use simulated consumed RP-1 for interactive runs; historical replay uses its independently disclosed estimate. No old star-driven landing end-card trigger. |

**Actions in `lib/store.ts`**

| Action | Contract |
|---|---|
| `startFlight(scenarioId)` | Validate preset, stop replay/tour, clear old result/input/emissions and create a fresh ready run. Returns the shared `ToolResult`. It opens briefing; it does not auto-launch. |
| `launchFlight()` | Only ready → flying, following a direct player action. |
| `setFlightInput(input, source, runId)` | Validate/clamp pitch and throttle; accept only the current owner for each submitted axis and the current run; merge phone pitch with local throttle through one input mixer; no state teleportation. |
| `advanceFlight(wallDelta)` | The sole fixed-step simulation authority while flying; derived state/outcome committed atomically. |
| `pauseFlight()` / `resumeFlight()` | Explicit lifecycle transition; clear held input and elapsed-frame accumulator. Resume requires a valid local/phone control source. |
| `retryFlight()` | Same validated scenario, fresh run id, pad state, fuel and zero emissions. |
| `stopFlight()` | Idle/clean state, no active input, physics or late callbacks. Terminal outcome stays visible only until exit/retry/reset. |

`FlightController` mounts inside the active Canvas and owns stepping. `FlightHud` is DOM and sends commands only. A compact `FlightTelemetry` adapter feeds 04/13; no component reads mutable Three.js transforms as physical truth. Proposed new paths: `components/flight/{FlightScene,FlightController,FlightHud,FlightResult}.tsx`, `lib/flight.helpers.ts`, `lib/__tests__/flight.test.ts`, `data/flight/*.json`. New assets require recorded source/licence. No credential is needed for local flight simulation.

## 7. Required tests and acceptance — not yet executed

Every new case has a sentinel id and cites this 2026-10-17 scope revision. Write failing behavior tests before implementing; do not port the old star tests and call them flight validation.

| Tests | Contract caught |
|---|---|
| R19–R23 historical replay | Alternate mission times/end; approximate grouped events; missing event allowed; scrub restores transforms/emissions; sample never silently appears as a real flight. |
| F1–F4 physics | Gravity points centrally; pitch changes acceleration direction; fuel/mass/thrust are coupled; identical fixed-step inputs give matching outcomes across frame schedules. |
| F5–F8 lifecycle | Pause/hidden tab do not advance; huge delta is bounded; retry clears all state; stale run/source inputs are rejected. |
| F9–F12 orbit | Known circular fixture passes; equally high radial fixture fails; Earth-intersecting ellipse fails; unbound path fails. Oracle fixtures derive from independently checked orbital values. |
| F13–F16 terminal behavior | Segment crossing Earth crashes; fuel exhaustion does not grant success; ten-second coast condition resets if broken; terminal outcome occurs once. |
| F17–F20 controls | Same input duration at different warp settings gives the same pitch command; camera drag does not steer; blur/pointer cancel releases turn; phone loss pauses and stale frames cannot resume; phone pitch and local throttle work together without ownership theft. |
| F21–F24 stages/data | Stage separation once; mass never negative; malformed/payload/fuel out-of-range presets rejected; no mixed historical/player state. |
| E1–E5 integrated emissions | Zero-throttle coast adds zero; partial fuel depletion adds only burned RP-1; crash freezes; retry resets; historical seek recomputes independently. |
| UI1–UI5 real browser | Mouse/touch/keyboard orbit and reset; independent steering; playable local controls; Earth/follow framing; no clipped controls/overlays at 375/720/1280/1920 px. |
| RUN1 | Complete an actual successful run through public controls with recorded inputs. No test-only state injection or forced win. |
| RUN2 | Fly a deliberately bad turn/throttle profile through public controls, observe the computed failure, then retry successfully. |

Before calling the game ready, record a reproducible successful input profile and at least two failing profiles, their terminal telemetry and browser evidence. Verify frame-rate tolerance, orbit coast accuracy, source links, asset credits and all three input methods. Rehearse the revised demo and publish its measured timing; the previous 70-second checkpoint segment is obsolete.

## 8. Build order and completion boundary

1. Settle shared state/scenario/provenance types and remove engine-out entry points.
2. Implement and test the pure simulator, orbital elements, stage/fuel model and integrated emissions ledger.
3. Build the globe/follow scene and local input/HUD; prove crash and successful orbit through controls.
4. Add optional phone pitch mapping and voice/guide adapters; verify disconnect/reset behavior.
5. Wire historical replay sources/uncertainty and separate reference/custom scenarios.
6. Apply 00's SpaceX/xAI layout, mascot and exact author/footer credits; perform browser/hardware checks and timed rehearsal.

This is a planning handoff. The current local MVP still demonstrates its saved preview behavior. The revised orbital game, integrated emissions, mascot and visual redesign are future implementation work, not completed features.
