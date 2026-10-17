# Teardown: read this first

Nothing is merged to `main`. This is the overnight stack as of 17 October 2026. Review and merge it in the order below. Budget **about 21 minutes** (the per-PR checks add up to 21). Repo: https://github.com/NPX2218/hackharvard-teardown

Shared contract on `#8` is **2026-10-17.1**. The integration head (`#13`) is **2026-10-17.2** (`SHARED_CONTRACT_VERSION` in `lib/types.ts`).

## What it is now

Teardown is a two-screen exhibit. The laptop shows a Falcon 9 you can take apart, then a live flight around an Earth you can see, steered by pitch and throttle. A phone in the cardboard rocket is the controller: it pairs with a 4-character code, calibrates upright, and sends motion. Free flight can crash or orbit. Mission mode can follow Sentinel-6 Michael Freilich by its published milestone times. A corner Grok Bot (an unofficial MIT port, credited) watches the guide button. Anders's lane adds the Falcon 9 words, a CO₂ estimate from the RP-1 the flight actually burns, a Grok agent, "show in action" pictures, laptop speech, and the README plus deck. The store is the meeting point. Lanes do not import each other's components.

## Where the PRs sit

Current bases, not the order you click Merge. `#11` and `#12` are siblings. `#13` is already the merge of those two. `#14`, `#15`, and `#16` all use `neel/12-integration` as their GitHub base. `#16`'s branch also contains `#14` and `#15`, then the restyle. `#7` sits on `#3`, not on the integration branch. `#13` is at `7c0cfbc` (Grok speech stays on the laptop). `#7` is at `20c5ae5` (same rule, then a style pass on the voice panel). `#16` is at `39f1c99`. Style-only follow-ups also sit on `#1`, `#3`, and `#4`. They do not change behaviour.

```mermaid
flowchart TD
  main["main"] --> p8["#8 neel/01-setup-contract"]
  p8 --> p10["#10 neel/03-viewer-core"]
  p8 --> p9["#9 neel/10-phone-rocket"]
  p8 --> p2["#2 cursor/parts-data-18be"]
  p8 --> p1["#1 cursor/emissions-readout-1384"]
  p8 --> p3["#3 cursor/agent-grok-tools-dfdf"]
  p8 --> p4["#4 cursor/imagine-show-in-action-1384"]
  p8 --> p5["#5 cursor/mission-data-18be"]
  p8 --> p6["#6 cursor/presentation-readme-ecd4"]
  p10 --> p12["#12 neel/07-flight"]
  p9 --> p11["#11 neel/11-rocket-link"]
  p12 --> p13["#13 neel/12-integration"]
  p11 --> p13
  p13 --> p14["#14 neel/15-earth-skins"]
  p13 --> p15["#15 neel/14-grok-mascot"]
  p13 --> p16["#16 neel/16-spacexai-design"]
  p14 -.-> p16
  p15 -.-> p16
  p3 --> p7["#7 cursor/voice-realtime-dfdf"]
```

Solid arrows are the GitHub base. Dotted arrows mean `#16` already contains that branch.

## Merge order

Merge into `main` from the bottom. After each merge, **retarget the next PR's base to `main`** (GitHub: Edit, change base) before you merge it. If you merge a child into its old base branch, you dump that work onto a branch you are about to leave behind.

`#11` and `#12` both edit `lib/store.ts` and `lib/rocket/commands.ts`. Merging `#11` on top of `#12` conflicts. Do not hand-resolve it. `#13` already contains that merge. After `#12` is in `main`, retarget `#13` from `neel/07-flight` to `main` and merge `#13`. `#11` is then already inside `main`. Retarget `#11` to `main` and you should see no commits left. Close it. Do not merge it as a sibling.

`#14` and `#15` both use `neel/12-integration` and touch different files. Either order works. This list does Earth, then the mascot. `#16` merges cleanly after those two: the only new diff is the restyle (CSS, fonts, a few class names). `#7` must come after `#3`, then retarget `#7` from `cursor/agent-grok-tools-dfdf` to `main`.

`#17` is this guide. Merge it whenever. It does not change the app.

1. **#8 Scaffold and shared contract** (2 min). Next 14 app, theme, Motion, and the types and store everyone else imports. Read `lib/types.ts`, `lib/store.ts`, `app/page.tsx`. Check: `SHARED_CONTRACT_VERSION` is `2026-10-17.1`. `npm run dev` shows the shell with empty slots.
2. **#10 Viewer** (1.5 min). Explode, pick a part, part card, narrated tour. Read `lib/explode.ts`, `components/viewer/Rocket.tsx`, `components/viewer/PartCard.tsx`. Check: click a part, drag explode, the card names it.
3. **#9 Phone rocket** (1 min). `/rocket`, sensor math, sounds, the relay protocol. Read `app/rocket/page.tsx`, `lib/rocket/protocol.ts`, `lib/rocket/sensors.ts`. Check: open `/rocket?debug=1` on localhost. You get "Tap to start your rocket", not the https warning.
4. **#12 Flight, globe, replay** (2 min). Fixed-step flight, Earth, HUD, replay clock. Read `lib/flight.helpers.ts`, `lib/flight/integrate.ts`, `components/flight/FlightHud.tsx`. Check: Your mission, Launch. The HUD shows height, fuel, and tilt. Straight up with no turn does not become an orbit by itself.
5. **#13 Integration** (2 min). Phone pitch into the flight, disconnect pause, kiosk attract, help, guide button. This merge brings `#11` with it. Read `lib/flight/phone-pitch.ts`, `lib/viewer/exhibit.ts`, `components/ui/PairRocket.tsx`, `lib/rocket/useRocket.ts`. Check: `/?demo=1` keeps one pair code. Press `?` and the shortcut list opens. (`M` and Space only work in `?kiosk=1`.)
6. **#11 Rocket link** (0.5 min). QR pairing, gestures, sim phone, local relay. Already in `#13`. Read `lib/rocket/commands.ts`, `scripts/sim-phone.ts`, `docs/SIM-PHONE.md` only if you want the gesture table. Check: the PR's compare against `main` is empty. Close it.
7. **#14 Earth skins** (1 min). NASA day, night, clouds, ocean mask, atmosphere. Read `components/flight/Earth.tsx`, `components/flight/earthShaders.ts`, `public/textures/CREDITS.md`. Check: Your mission. The globe is a photograph, and a small caption credits NASA.
8. **#15 Grok mascot** (1 min). Corner bot, moods, bloub credit. Read `lib/mascot/mood.ts`, `lib/mascot/voice-bridge.ts`, `components/ui/GuideLauncher.tsx`. Check: the corner control is a face. Click it. The guide opens. Credits mention bloub.
9. **#16 SpaceXAI redesign** (1.5 min). Dark x.ai chrome on every surface, D-DIN only on the kiosk and the flight HUD. The branch already contains `#14` and `#15`. Layout and CSS only. Read `app/globals.css`, `app/layout.tsx`, `components/ui/Header.tsx`. Check: the header is one quiet bar, the HUD labels are the condensed face, the mascot sits in a small circle, and the phone status word stays white. On this branch alone, vitest reports 54 files and 415 tests. That count does not include Anders's suites.
10. **#2 Parts** (1 min). Falcon 9 copy: 10 groups and a 19-term glossary, checked against the contract types. Read `data/parts/falcon9.json`, `lib/parts.ts`. Check: a part card uses this wording (payload fairing, grid fins), not the placeholder file.
11. **#1 Emissions** (1 min). RP-1 × **3.15** kg CO₂ per kg kerosene, sourced file, readout. Read `data/emissions/falcon9.json`, `lib/emissions.ts`, `components/emissions/EmissionsReadout.tsx`. Check: the factor in the JSON is 3.15. The flight HUD still shows the seam fixture until the import in Known gaps is swapped.
12. **#3 Agent** (1.5 min). Grok client, tools, `/api/agent`, text box. Read `lib/agent/tools.ts`, `lib/agent/prompt.ts`, `app/api/agent/route.ts`. Check: with no `XAI_API_KEY`, a question fails closed (a sentence, not a stack trace). Tools must not pause or finish a flight.
13. **#4 Imagine** (1 min). Grounded prompt, `/api/imagine`, "Show in action". Read `lib/imagine/prompt.ts`, `app/api/imagine/route.ts`, `components/imagine/ImagineSlot.tsx`. Check: the component exists. The home page still mounts the fixture, so you will not see the button until the import swap.
14. **#7 Voice** (1.5 min). Laptop TTS and realtime mic, callouts, 9 CC0 sounds, `onVoiceState`. Read `lib/voice/speak.ts`, `lib/voice/activity.ts`, `components/voice/PushToTalk.tsx`. Check: `speak.ts` plays on the laptop (`20c5ae5`). `public/sounds/` has the 9 mp3s plus `CREDITS.md`. Hold `V` is implemented on `PushToTalk`, which is not mounted yet.
15. **#5 Missions** (1.5 min). Sentinel-6 record and flyable scenario presets. Read `data/missions/sentinel-6-michael-freilich.json`, `data/missions/index.ts`, `data/flight/index.ts`. Check: Mission mode shows Sentinel-6 Michael Freilich as a real button. Open **About this flight**. The note says "Reference trajectory unavailable", and the classroom line says a Sentinel-6 reference flight cannot start because propellant mass is not in the selected sources. Practice is a separate sample, not the silent default.
16. **#6 README and deck** (1 min). Launch-poster README, `/presentation`, speaker notes, PDF. Read `README.md`, `docs/presentation/story.md`, `components/presentation/slides.ts`. Check: the README still says the exhibit is **not built** and the pictures are labelled placeholders. Merge it last, or merge it knowing the poster is behind the app. The deck still imports `components/presentation/motion-fixture.ts` rather than `lib/ui/motion.ts`.

## After #7 and #15 are both in the same tree

The mascot already calls `connectVoiceActivity()`, which no-ops until `lib/voice/activity.ts` exists. Replace that with a direct subscription so the face follows the laptop mic and the laptop speaker. In `components/ui/GuideLauncher.tsx`, add the imports and call `bindVoiceActivity` from the mount effect (the one that now calls `connectVoiceActivity`). Do not call it at module scope. That file is a client component and the bus touches the browser.

```ts
import { onVoiceState } from "@/lib/voice/activity";
import { bindVoiceActivity } from "@/lib/mascot/voice-bridge";
bindVoiceActivity(onVoiceState);
```

The home page was not updated by those PRs. It still mounts the seam fixtures. Swap these three imports or Anders's UI never appears:

- `app/page.tsx`: `VoiceSlot` from `@/components/voice/VoiceSlot`, `ImagineSlot` from `@/components/imagine/ImagineSlot`
- `components/flight/EmissionsPlacement.tsx`: `EmissionsSlot` from `@/components/emissions/EmissionsSlot`

## Known gaps

- Sentinel-6 has published event times only. Every reference sample has null altitude and velocity. No public kinematic series was checked in. Mission mode tracks milestones and shows **Reference trajectory unavailable**. It does not draw a corridor, and it will not warn or fail for drift. Practice is the same shape, on purpose.
- A real phone on HTTPS was not run. Localhost is a secure context, so `/rocket` gets past the https gate there. Motion permission, wake lock, and the cardboard shell are untested on hardware.
- `public/audio/manifest.json` is `{}`. Narration audio is not cached. `scripts/cache-narration.ts` is the generator. It needs `XAI_API_KEY`.
- No Imagine JPEGs are in the repo (`public/imagine/` is absent). `scripts/save-imagine.mjs` is the cache script. Pictures need a key.
- Grok speech plays on the laptop only. `lib/rocket/commands.ts` drops `say` and `stopSay`, so the phone never speaks those lines. The phone still plays rocket sounds and vibration. `lib/voice/rocket-port.ts` is wired at `commands.ts`, and those two speech messages stop there.
- `#6` media are labelled placeholders, and the README status badge still says not built.
- `app/page.tsx` fixtures, called out above. Until that swap, hold-`V`, the agent box, and Show in action are not on the exhibit.
- Earth credit is in `public/textures/CREDITS.md` and the flight caption. The global footer credit for NASA is still a one-line follow-up. The mascot PR owns `components/ui/Credits.tsx`.

## Run the demo on one machine

No Supabase keys. Two processes plus the simulator:

```bash
npm ci
npm run relay:dev
```

In a second terminal:

```bash
NEXT_PUBLIC_ROCKET_RELAY=local npm run dev
```

Open `http://localhost:3000/?demo=1`. Read the 4-character code. In a third terminal, with the same relay (the simulator picks `local` when the Supabase keys are absent):

```bash
npm run sim:phone -- ABCD --mount s24fe
```

`ABCD` is whatever the laptop is showing. Keys: `l` lift to launch, arrows tilt, `f` flick to stage, `a` nose-down abort. The default mount is the Galaxy S24 FE, landscape, buttons toward the nose. Details are in `docs/SIM-PHONE.md`. The relay listens on `ws://127.0.0.1:8787`.

`/?kiosk=1` is the attract loop (60 seconds idle). `?` opens help.

## Smoke

`scripts/smoke/merge-all.sh` repeats this merge order in a throwaway worktree, applies the glue line, and runs `tsc`, lint, vitest, and `next build`. `npm run smoke` plays the paired laptop and phone. Results and app bugs are in `docs/SMOKE.md`.
