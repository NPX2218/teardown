# Teardown speaker notes

**Bringing rocket science down to Earth.**

HackHarvard 2026, SpaceXAI challenge. Generated from `components/presentation/slides.ts`; edit the notes there, not here.

Made by Neel Bansal and Anders Haroldson.

Student project. Not affiliated with SpaceX or xAI.

Model credit: “Falcon 9 - SpaceX” by Stanley Creative, CC BY 4.0.

## How to run the deck

- With the app running: `/presentation`. Arrow keys or Space step through each line, `N` opens these notes, `F` is full screen.
- Offline: open `public/presentation/index.html`.
- Still backup: `docs/presentation/teardown.pdf`, one slide per page, every line shown.
- After editing the deck: `ESBUILD=node_modules/.bin/esbuild node components/presentation/build-preview.mjs`, then reprint the PDF from the offline page.

Direct links: `#title` `#problem` `#team` `#hardware` `#demo` `#how` `#challenge` `#explore` `#mission`.

## Before you go on stage

- Run `npm run tunnel`, wait for READY, and pair the real phone on the venue Wi-Fi. Calibrate it once.
- Keep `npm run sim:phone` ready in a second terminal as the backup controller.
- Check the xAI key and the Imagine model answer (ask Grok one question, and fly one short hop to see a patch).
- One person talks, the other drives the demo.

## Slide 1: Teardown

On screen:

- Bringing rocket science down to Earth.
- Neel Bansal · Anders Haroldson

Say:

- 0:00 to 0:10. Say: “Hi, we’re Neel and Anders. This is Teardown: bringing rocket science down to Earth.”
- The whole pitch is 3 minutes: 50 s of slides, 85 s of live demo, then 45 s to close. Watch the clock on the demo, not the slides.

## Slide 2: Kids watch rockets launch. They never get to fly one.

On screen:

- The facts are public, but they are scattered, and a webcast only lets you watch.
- So kids never feel how one lean changes where a rocket ends up.

Say:

- 0:10 to 0:25. Say: “Millions of people watch Falcon 9 launch, and almost nobody can explain what they saw. Kids especially. They can watch, but they can’t pull the rocket apart or try to fly it. So we built Teardown for them.”

## Slide 3: Neel and Anders + Cursor and Grok

On screen:

- The two of us built every part of it together, side by side.
- We used Cursor and Grok as hard as we could. That is our real usage.

Say:

- 0:25 to 0:35. Say: “We’re Neel and Anders, and we built all of this together.” Then point at the usage screenshot: “We used Cursor and Grok as hard as we could. We used up the whole weekly Grok limit.”
- Our code meets in one shared store, which is how two people could work on it at the same time without stepping on each other.

## Slide 4: Your phone is the rocket

On screen:

- We planned to solder our own sensor board, but Micro Center and the other stores nearby didn’t have the parts. Every phone already has them.
- So a phone slides into a cardboard rocket and becomes its motion sensor, its speaker and its rumble. It runs in a web page, so there is no app to install.
- We checked with the HackHarvard co-director: the phone’s accelerometer and speaker count as hardware for this track.

Say:

- 0:35 to 0:50. Say: “We wanted to solder our own sensor board, but Micro Center didn’t have the parts. Then we realised every phone already has them. So the phone is the rocket.” Hold up the cardboard rocket while you say it. The demo shows the rest.
- Hardware for Good: every classroom already has phones and cardboard, so a teacher has no kit to buy and nothing to install.
- The demo phone (Galaxy S24 FE) sits landscape, so its +x edge points at the nose (S24FE_MOUNT in lib/rocket/mount.ts). Portrait and either landscape work too.
- Say the co-director line clearly. We asked before we built it, and were told the accelerometer and speaker qualify as the hardware component.
- Settings on the laptop (engine sound, master volume, vibration) are sent to the paired phone. The buzz pulses every 200 ms with a duty that follows engine power (lib/settings/vibrate.ts).
- If the phone disconnects mid-flight, the flight pauses until it is back.
- Sensors: lib/rocket/usePhoneSensors.ts (FRAME_MS = 50), lib/rocket/sensors.ts (GRAVITY_LOWPASS = 0.8), and the complementary filter in lib/rocket/mount.ts (0.92 gyro, 0.08 gravity). Without a gyro it falls back to gravity alone.
- Calibrate: lib/rocket/calibrate.ts (CALIBRATE_DELAY_S = 3). It snaps to upright within 20° (UPRIGHT_SNAP_DEG). Steering: PHONE_STEERING in lib/flight/phone-steering.helpers.ts, a 2° dead zone, a gentle response up to 60°, and a 12°/s turn limit.
- Gestures: lib/rocket/shell-gestures.ts. Lift is 2.5 m/s² up the nose for 180 ms, refused if already leaning past 35°. A flick is a sideways jolt of at least 12 m/s² lasting 40 to 220 ms; longer is a lean. Abort is nose down past 150° for 2 s.
- Disconnect: DISCONNECT_MS = 2000 in lib/rocket/commands.ts. Inputs carry a run id and each control has one owner, so old wiggles from a previous run are rejected.
- Why gravity and gyro, not the compass: the magnetometer drifts indoors near laptops. The phone only streams sensors and the laptop decides everything, so a phone can never cheat a win.

## Slide 5: One run, start to finish

On screen:

- Explode the rocket and push engine power. The cardboard rocket in your hands roars and shakes.
- Calibrate, launch, lean to steer. At 8× the Earth curves away in under a minute.
- Reach orbit, or crash. Either way Grok Imagine draws a postcard of your flight to download.

Say:

- 0:50 to 2:15. Switch to the app. One person talks, the other drives. Pair and calibrate the phone before the slot starts.
- Explore, 25 s: slide Explode to 100%, tap Merlin 1D engines (real specs on the card), then push Engine power and hand a judge the cardboard rocket so they feel it roar and buzz. Mention that Grok Voice narrates every part on the tour, but don’t play the tour. It takes too long.
- Fly, 40 s: Your mission, Custom flight, Presentation 8×, Calibrate phone, Launch, push power up, lean gently. While it climbs, say: “You steer, real physics does the rest. Go straight up and you fall back.”
- Postcard, 20 s: don’t wait for orbit. If time is short, lean hard and crash on purpose; the postcard still appears. Talk over it while Grok Imagine draws, then press Download PNG.
- If the phone won’t pair, run npm run sim:phone with the code on screen. If the app itself fails, use the demo backup slides at the end of the deck.

## Slide 6: One store, three ways in

On screen:

- The phone, the mouse and Grok all drive one store, so Grok uses the same actions as the buttons.
- Real orbital physics, 60 steps a second. 1,103 unit tests, plus a flight test with a simulated phone.

Say:

- 2:15 to 2:35. Say: “Everything goes through one store. The phone, the mouse and Grok call the same actions, so Grok can’t do anything a button can’t. The flight is real orbital physics, and we have over a thousand tests.”
- If asked: semi-implicit Euler at 1/60 s, gyro plus gravity steering, swept collisions against the Earth and the launch tower. The phone slide’s notes have the sensor constants.

## Slide 7: Built for this track

On screen:

- The running app meets every requirement, and you just saw each one in the demo.

Say:

- 2:35 to 3:00. Read only the left column: real space data, Grok Voice and Imagine, built in Cursor, and a phone as the hardware. Then: “The HackHarvard co-director confirmed the phone’s sensors and speaker count as hardware.” Finish on the motto, “Bringing rocket science down to Earth. Thank you.”

## Appendix: Take it apart

On screen:

- Slide Explode and the Falcon 9 splits into its 10 real parts. Tap one for a card with real specs and a source link.
- Push Engine power and nine Merlin plumes grow. The phone inside the cardboard rocket roars and vibrates with them, so a kid feels every burn in the rocket they are holding.
- Press Start tour and Grok Voice flies to each part and explains it out loud, at Kid, Curious or Engineer level. Press Voice to talk back live.
- Or type or tap a question chip: Grok selects parts, explodes the rocket and flies the camera with the same actions the buttons use.

Say:

- Backup: show this only if the live demo fails.
- Every number on the card is read from data/parts/falcon9.json, which cites spacex.com. Grok is told never to make one up.
- The tour lines are each part’s say line in the data file, spoken with Grok text-to-speech and cached in public/audio (scripts/cache-narration.ts, components/viewer/TourDirector.tsx).
- The rumble is synthesized on the phone (lib/rocket/engine-rumble.ts); the laptop only sends a power value between 0 and 1. At 0 both the plume and the rumble are silent, and reduced motion holds the plume still.
- The 3D model is “Falcon 9 - SpaceX” by Stanley Creative, CC BY 4.0.
- Grok can explain a flight, but it can’t launch, steer or award one.
- Text agent: nine tools in lib/agent/tools.ts. A test (lib/__tests__/tools.test.ts, A1) keeps the tool list and the store actions in sync.
- Voice: the browser gets an ephemeral token from /api/voice/session and opens the Grok realtime voice socket with only two tools, start_tour and set_level (lib/voice/realtime-guide.ts).
- The xAI key stays on the server (app/api/*), and routes are rate-limited. If Grok can’t be reached, the exhibit keeps running and says so in a sentence.

## Appendix: Fly it to orbit

On screen:

- You steer and set engine power. Real physics does the rest, and the game never hands you a win.
- Go straight up and you fall back. Turn too hard and you hit the ground. Kids work out what orbit is by getting it wrong a few times.
- Orbit or crash, Grok Imagine draws a postcard of your flight, with your numbers on it, to download and keep.

Say:

- Backup: show this only if the live demo fails.
- Fly free, or follow an optional guide: Sentinel-6’s published milestones or a practice route. The guide never steers or scores.
- Postcard: one Imagine image per flight plus highest point, how it ended, flight number and CO₂; Download PNG makes a 1080×1350 card (lib/imagine/patch-png.ts). The app calls it the mission patch.
- The postcard is one Imagine call per flight, cached so See mission patch reopens it for free.
- Win: lowest point at least 200 km up, highest no more than 2,000 km, engines off for ten seconds. That window is our classroom goal (lib/flight/classroom.ts), not a Falcon 9 rating.
- Only physical outcomes end a flight: hitting the ground or the launch tower, breaking up, running out of fuel, escaping, or a stable orbit. Leaving the guide path never warns or fails you.
- Presentation 8× is the default so a judge sees the Earth curve inside a minute; Realistic 1× is one tap away. It only changes the clock, not the physics steps.
- CO₂ so far = kerosene the simulation actually burned × 3.15 kg CO₂ per kg (data/emissions/falcon9.json), labelled as an estimate.
