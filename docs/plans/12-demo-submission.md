# 12 · Demo + Submission Plan

> **For agentic workers (Cursor Agent):** Tasks 1–2 are code/docs; Tasks 3–5 are people tasks. Steps use `- [ ]` checkboxes.

**Goal:** A rehearsed 2-minute demo, a README that shows judges where Cursor, Grok and real data are used, and a Devpost submission in by 7:00 AM Sunday.
**Spec:** planning doc §2 "Demo script", §6 "Proving Cursor use".
**Owner:** Both. **Needs:** everything that survived the cut list. **Feature freeze:** Sat 12:00 AM. After that, only fixes.

## Global Constraints
See `00-index.md`.

---

### Task 1: Demo hardening (Sat 9 PM–12 AM)

- [ ] **Step 1:** `?demo=1` URL flag: skips loading spinners where possible, preselects the demo mission, prefers cached audio and cached Imagine images, and keeps the pairing code fixed so the phone rocket can stay paired between judges.
- [ ] **Step 2:** Keyboard shortcuts as a backup if voice or the phone rocket fails. **Each person wires their own keys inside their own slot**, so this needs no cross-lane edits:
  - **Neel** (`MissionSlot` / `ViewerSlot`): `M` start the guided mission, `Space` complete the current checkpoint (simulates the move, so the mission works with no phone), `L` hands-free replay, `T` tour, `E` toggle explode, `2` turn off two engines, `Esc` reset, and the `?` overlay listing all keys.
  - **Anders** (`VoiceSlot` / `ImagineSlot`): hold `V` to talk, `I` imagine the selected part.
- [ ] **Step 3: Museum exhibit mode** (`?kiosk=1`), so the pitch "this could be a museum exhibit" is something judges can see:
  - when `performance.now() - lastActivityAt > IDLE_MS` (touch, push-to-talk and rocket motion all call `markActivity`): reset everything (`selectPart(null)`, explode 0, `stopTour()`, `endMission()`, `stopReplay()`, stop phone sounds, level back to Kid, `setLens("rocket")`) and show an attract screen: the hands-free replay (07 Tasks 1–4) looping silently, the motto, and big text "Pick up the rocket to fly" / "Touch to explore";
  - any touch, or the rocket moving (11 Task 5 Step 2), wakes it; picking up the rocket offers "Fly the mission";
  - hide anything that needs a keyboard; each person handles their own: Neel hides the `?` overlay, Anders hides the text box (both read the `?kiosk=1` flag); push-to-talk, touch and the rocket are the inputs;
  - the idle reset and attract screen are Neel's (in `MissionSlot`); Anders's slots just react to the store being reset;
  - `user-select: none`, no right-click menu, no accidental pinch-zoom of the page.
  ```ts
  // 60 s without interaction = the visitor walked away. Arbitrary; museums often use 30–120 s.
  // Tune by watching other hackers use it on Saturday.
  export const IDLE_MS = 60_000;
  ```
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: all green, build succeeds.
- [ ] **Step 5:** Commit `feat: demo mode, exhibit mode, keyboard fallbacks`.

### Task 2: README (Sun 12–4 AM)

**Files:** `README.md`, `docs/screenshots/*`

Sections, in this order:
- [ ] **What it is:** the motto "Bringing rocket science down to Earth", the one-liner, and a GIF of the explode and replay.
- [ ] **The problem:** "Rockets are one of the most-watched technologies in the world and one of the least understood," plus the three bullets and the audience (down to a young kid) from planning doc §0.
- [ ] **Museum exhibit:** how `?kiosk=1` works (attract screen, idle reset, rocket and touch only) and why it's built that way.
- [ ] **The guided mission:** the six checkpoints table from 07, with a GIF of someone flying it.
- [ ] **What people learned:** results from the hallway tests (Task 3 Step 4). Real observations only.
- [ ] **Demo:** the 2-minute script.
- [ ] **How Grok is used:** voice agent with function calling (list the tools), Grok Voice narration, Grok Imagine; where the facts-only prompt lives.
- [ ] **Real space data:** `falcon9.json` specs and sources; the mission timeline source; Launch Library 2 for booster history; the engine-out math and its "liftoff only" caveat.
- [ ] **Built with Cursor:** `.cursor/rules/`, the `docs/plans/` workflow (one plan per stage, one task per agent run), 3–4 screenshots of Cursor Agent building features, usage screenshots.
- [ ] **Phone rocket:** how the phone becomes the rocket's sensor and speaker, the QR pairing, a photo of the shell (10 Task 5), and `public/sounds/CREDITS.md`.
- [ ] **Architecture:** the diagram from the planning doc.
- [ ] **Credits:** "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0 (link); every sound file's source and license; NASA 3D Resources if used; "Student project, not affiliated with SpaceX."
- [ ] Commit `docs: readme`.

### Task 3: Rehearse (Sun 4–5 AM)

- [ ] **Step 1:** Run the demo script 3 times end to end on the demo laptop in Chrome, plugged in, with the phone rocket charged and paired. Time it: under 2:00.
- [ ] **Step 2:** Practice each failure: hackathon Wi-Fi down (switch both devices to the phone hotspot; cached audio and images), phone disconnects (keep going with touch + `Space` for checkpoints), agent misunderstands (keyboard shortcut).
- [ ] **Step 2b:** Demo phone prep: charged to 100%, Do Not Disturb on, auto-lock off, volume max, `/rocket` opened and tapped once before judges arrive.
- [ ] **Step 3:** Decide who talks and who drives. Open with the problem line and the motto, not the tech.
- [ ] **Step 4: Hallway test** (do this Saturday, not Sunday): hand the phone rocket to 3–5 people, ideally someone with no space background, in `?kiosk=1` at the Kid level, and don't explain anything. Afterwards ask: "What does the booster do after it separates?" and "Why does it have legs?" Write down what they said and how long they used it. Also note: could they understand the rocket's voice, and did the phone mic or the laptop mic understand their questions better (sets `MIC_SOURCE` in 05)? Fix the biggest confusion before freeze.

### Task 4: Video + Devpost (Sun 5–7 AM)

- [ ] **Step 1:** Record the 2-minute demo video (screen + a second camera on someone flying the rocket). Upload unlisted to YouTube.
- [ ] **Step 2:** Devpost: title "Teardown", tagline "Bringing rocket science down to Earth", the README's "What it is", "The problem", "Museum exhibit" and "How Grok is used" sections, video link, repo link, screenshots, built-with tags (Cursor, Grok, Next.js, three.js, Web Audio, device motion sensors).
- [ ] **Step 3:** Select every prize we qualify for (SpaceXAI, Hardware for Good; Chalk only if there was time to add an eval report checking Grok's answers against the data).
- [ ] **Step 4:** Submit by **7:00 AM**. Devpost closes at 8:00.

### Task 5: Proof screenshots (anytime Sun before submitting)

- [ ] Both teammates' Cursor usage pages for Oct 16–18.
- [ ] The Grok Bot planning thread.
- [ ] `git log --oneline | head -30` showing small commits with the Cursor trailer.
- [ ] Add them to the README and Devpost gallery.
