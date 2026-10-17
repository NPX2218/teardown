# Teardown — speaker notes

**Bringing rocket science down to Earth.**

HackHarvard 2026, SpaceXAI challenge. Generated from `components/presentation/slides.ts`; edit the notes there, not here.

Made by Neel Bansal and Anders Haroldson.

Student project. Not affiliated with SpaceX or xAI.

Model credit: “Falcon 9 - SpaceX” by Stanley Creative, CC BY 4.0.

## How to run the deck

- With the app running: `/presentation`. Arrow keys or Space step through each line, `N` opens these notes, `F` is full screen.
- Offline: open `public/presentation/index.html`.
- Still backup: `docs/presentation/teardown.pdf`, one slide per page, every line shown.

Direct links: `#title` `#problem` `#motto` `#explore` `#replay` `#mission` `#hardware` `#sensors` `#gestures` `#physics` `#grok` `#how` `#challenge` `#close` `#numbers` `#open`.

## Before you go on stage

- Fly the phone rocket once on a real handset over HTTPS on the venue Wi-Fi. It has only run against the simulator so far.
- Check the xAI key answers (ask Grok one question) before demoing Voice or Imagine live.
- Have the laptop already paired and zeroed before you start talking.

## Slide 1 — Teardown

On screen:

- Bringing rocket science down to Earth.
- Neel Bansal · Anders Haroldson

Say:

- Open with the motto, not the stack: “Teardown. Bringing rocket science down to Earth.”
- Say your names. The background is the real Earth from our flight view, NASA Blue Marble imagery.

## Slide 2 — Millions watch Falcon 9 launch. Almost nobody can explain what they saw.

On screen:

- The facts are all public. They are scattered across spec sheets, webcast timestamps and launch databases.
- A webcast is something you watch. You can't pull it apart, ask it a question, or try to fly it yourself.
- So rocket science stays something other people understand.

Say:

- This is the hook. Slow down. The point is not that information is missing, it is that it is scattered and passive.
- If you want the audience line: if a 10-year-old can’t follow a screen, we rewrite the screen.

## Slide 3 — Bringing rocket science down to Earth

On screen:

- Teardown puts a real Falcon 9 in one place you can touch.
- Take it apart. Watch a real launch. Then slide a phone into a cardboard rocket and fly your own flight to orbit.
- Grok explains every moment, in words a 10-year-old understands.

Say:

- The motto has two meanings and both are the product: down to Earth as in plain words, and down to Earth as in a rocket you hold in your hands.
- The four numbers: 3 ways to play, 10 real parts, 3 reading levels, 1 phone for a rocket.

## Slide 4 — Take it apart

On screen:

- Drag to turn a Falcon 9. Slide Explode and it splits into its 10 real parts, from the fairing to the landing legs.
- Tap a part: the camera flies to it, and a card explains it with real specs and a source link.
- Kid, Curious, Engineer. Same facts, more depth.

Say:

- Every number on the card is read from data/parts/falcon9.json, which cites spacex.com. Grok is told never to make one up.
- The 3D model is “Falcon 9 - SpaceX” by Stanley Creative, CC BY 4.0.

## Slide 5 — Watch a real launch

On screen:

- Pick Sentinel-6 Michael Freilich, Falcon 9, 21 November 2020.
- The rocket flies around a NASA Blue Marble Earth and hits each milestone at its published time.
- It says plainly what it is: illustrated motion, not a recording, and which numbers the public sources leave out.

Say:

- Milestones come from the ESA timeline plus Launch Library 2 metadata, in data/missions/sentinel-6-michael-freilich.json.
- There is no public altitude or speed series for Sentinel-6, so the screen says “Reference trajectory unavailable” instead of inventing one. Judges like that we don’t fake data.

## Slide 6 — Fly it to orbit

On screen:

- You control tilt and engine power. Real physics does the rest, and nothing types in a win.
- Go straight up and you fall back. Turn too hard and you hit the ground. That is the lesson of orbit, learned by failing.
- Win: lowest point at least 200 km up, highest no more than 2,000 km, engines off for ten seconds.

Say:

- LIVE DEMO here if the build is up: fly once at 8×. Crash once on purpose if time allows, then press Try again.
- Altitude alone never wins. Orbit is going sideways fast enough that you keep missing the Earth. That’s the insight we want a kid to feel.
- The 200 km / 2,000 km / 10 s window is our classroom goal (lib/flight/classroom.ts), not a Falcon 9 rating.

## Slide 7 — Your phone is the rocket

On screen:

- A phone slides into a cardboard rocket and becomes its motion sensor and its speaker. No app to install, just a web page.
- Scan the QR on the laptop. Tap Start. Hold it upright to zero. Then lean the rocket to steer.
- It uses the phone’s accelerometer and gyroscope for motion, and its speaker and vibration motor for engine sound and rumble.
- We checked with the HackHarvard co-director: the phone’s accelerometer and speaker count as hardware for this track.

Say:

- Hardware for Good: every classroom already has phones and cardboard. No kit to buy, nothing to install.
- Say the co-director line clearly. We asked before we built it, and were told the accelerometer and speaker qualify as the hardware component.
- If the phone disconnects, the flight pauses. Mouse, touch and keyboard can fly the whole mission with no phone, so the exhibit never blocks on hardware.

## Slide 8 — From raw motion to a steering angle

On screen:

- The phone reads devicemotion and deviceorientation, and sends a frame at most every 50 ms, about 20 Hz.
- It splits acceleration into gravity and your movement. Gravity is low-passed, so a shaky hand doesn’t jerk the rocket.
- Zero: hold it still for 2 seconds. That averaged gravity becomes “straight up”, so any phone in any mount works.
- Tilt is gravity in the rocket’s frame: pitch = atan2(g_z, √(g_x² + g_y²)), clamped to ±90°.

Say:

- Files: lib/rocket/usePhoneSensors.ts (FRAME_MS = 50), lib/rocket/sensors.ts (GRAVITY_LOWPASS = 0.8), lib/rocket/mount.ts (UprightCalibrator, attitudeFromGravity).
- Zero needs 2,000 ms of stillness: movement under 0.6 m/s², gravity between 8 and 12 m/s², samples within 8° of each other. It builds a rocket basis where +y is the nose, so landscape, portrait or upside-down mounts all work.
- Why gravity and not the compass: the magnetometer drifts indoors near laptops. Gravity is always there and always points down.
- The phone only streams sensors. The laptop decides everything, so a phone can never cheat a win.
- If asked: there is a complementary filter (0.92 gyro, 0.08 gravity) in lib/rocket/useRocket.ts, but the phone frame doesn’t carry the gyro rate yet, so on a real phone it runs on gravity pitch alone.

## Slide 9 — The cardboard rocket is the controller

On screen:

- Every gesture is measured in the rocket’s own frame, along the calibrated nose, not the phone’s screen.
- Each one needs a sustained or shaped signal, so a table bump or one noisy sample never launches.
- If no frame arrives for 2 seconds, the phone gives up control and the flight pauses. Stale input is thrown out.

Say:

- Thresholds are in lib/rocket/shell-gestures.ts (SHELL_GESTURE).
- Lift: 2.5 m/s² up the nose for 180 ms, refused if already leaning past 35°. Flick to stage: a sideways jolt of at least 12 m/s² that lasts 40 to 220 ms; longer is a lean, not a flick. Abort: nose down past 150° for 2 s.
- Disconnect is DISCONNECT_MS = 2000 in lib/rocket/commands.ts, about 40 missed frames. Inputs carry a run id, and each control has one owner, so old wiggles from a previous run or the other device are rejected.
- Messages are validated on arrival: finite numbers, a unit quaternion, gravity between 5 and 15 m/s².

## Slide 10 — How we compute where the rocket is

On screen:

- Every 1/60 of a second we add up the forces: gravity toward Earth’s centre, engine thrust along your tilt, and air drag.
- Then update speed, then position. Mass drops as fuel burns, so the rocket speeds up as it gets lighter.
- From position and speed we compute the whole orbit live: its energy, its shape, its lowest and highest points.
- The win is checked on that orbit, never typed in. Time warp at 4× or 8× just runs more steps per frame.

Say:

- File: lib/flight.helpers.ts. Semi-implicit Euler: v += a·dt, then x += v·dt, with dt = 1/60 s, up to 48 steps per frame for 8× warp.
- Gravity is μ/r² with μ = 398,600 km³/s² from the NASA Earth fact sheet. Thrust direction is cos(tilt)·up + sin(tilt)·downrange. Drag is ½·Cd·A·ρ·v² with ρ = 1.225·e^(−h/8500), applied below 120 km.
- Orbit: energy ε = v²/2 − μ/r, angular momentum h = x·v_y − y·v_x, eccentricity e = √(1 + 2εh²/μ²), a = −μ/2ε. Lowest point a(1−e), highest a(1+e), minus Earth’s radius.
- The two-stage rocket is a classroom tune (lib/flight/classroom.ts), not Falcon 9 data: 7.6 MN booster, 0.9 MN upper stage, liftoff thrust about 2.3 times its weight. The real Falcon 9 numbers live in Explore.
- CO₂ estimate: kerosene actually burned × 3.15 kg CO₂ per kg, sourced in data/emissions/falcon9.json, labelled as an estimate.

## Slide 11 — Ask it anything

On screen:

- Grok can select parts, explode the rocket and fly the camera by calling the same actions the buttons use.
- Grok Voice speaks the guide and the mission callouts. Hold to talk and Grok transcribes your question.
- Grok can explain a flight. It can’t steer one or award a win.

Say:

- Nine tools in lib/agent/tools.ts. A test (lib/__tests__/tools.test.ts, A1) keeps the tool list and the store actions in sync.
- The xAI key stays on the server (app/api/*). Routes are rate-limited. If Grok can’t be reached, the exhibit keeps running and says so in a sentence.
- Imagine: “Show in action” turns the selected part into a Grok Imagine picture grounded in the part’s data. Voice and Imagine are on the home page; check the xAI key answers before you demo them live.

## Slide 12 — One store. Three ways in.

On screen:

- Nothing moves the scene except store actions. The phone, the mouse and Grok all call the same ones.
- Store actions are Grok’s tools. A test keeps the two lists in sync.
- Facts live in data files. Every number on screen or spoken aloud is read from data/.
- About 700 unit tests, plus a smoke run that pairs a real laptop page with a phone page and flies.

Say:

- Stack: Next.js 14, TypeScript strict, three.js with React Three Fiber, Zustand, Supabase Realtime for the phone link (a local WebSocket relay in development), xAI Grok.
- docs/SMOKE.md, 17 October: vitest 703 passed, 1 skipped. The Playwright smoke covers calibrate, lift to launch, tilt steering, flick to stage, nose-down abort, a crash, a mission drift warning, Sentinel-6 milestones and the mascot voice states.

## Slide 13 — Built for this track

On screen:

- Every requirement is met in the running app, not on a roadmap.

Say:

- Walk the table top to bottom, one breath each. End on Hardware for Good: the co-director confirmed the phone sensors count.

## Slide 14 — Take one apart. Watch one. Fly one.

On screen:

- Bringing rocket science down to Earth.
- Come fly the cardboard rocket. Thank you.

Say:

- Stop on the motto. Hand the cardboard rocket to a judge if you can.
- Invite questions. The appendix has where every number comes from and what is still open.

## Appendix — Where every number comes from

On screen:

- A published fact wears its source: spacex.com, ESA, NASA, Launch Library 2.
- A simulated readout comes from the physics and your inputs.
- An estimate wears that word and its assumptions, like the CO₂ factor.
- Missing data stays missing. We never fill a gap with a made-up flight.

Say:

- Use this if a judge asks what is real. Sources are in data/missions/SOURCES.md and inside each data file.

## Appendix — What is still open

On screen:

- As of 17 October 2026, Explore, Flight replay, Your mission and the phone link run on main.

Say:

- Only show this if asked. Same list as the README status section.
