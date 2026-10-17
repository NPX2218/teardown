# 05 · Voice Implementation Plan

**Scope revision — 2026-10-17:** the [current stage spec](../specs/05-voice.spec.md) and [07 migration contract](../specs/07-replay.spec.md#6-cross-stage-migration-contract) supersede conflicting instructions below for flight narration and retired checkpoint caches. The former checkpoint/stars mission and standalone Engines/Emissions surfaces are retired. Follow the revised [07 execution plan](07-replay.md); do not build legacy snippets verbatim.

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Every spoken line uses Grok Voice, with cached audio as a fallback. Short mission callouts come **out of the rocket** (the phone inside it); explanations come out of the laptop. Visitors ask questions out loud, through the phone mic or the laptop mic.
**Architecture:** `/api/voice` turns text into audio with Grok Voice. `speakLine` (the 01 placeholder, replaced here) plays it, falling back to pre-generated files, then to the browser voice. Push-to-talk turns speech into text and hands it to `askAgent` (04).
**Tech Stack:** Grok Voice API (format per `docs/xai-notes.md`), Web Audio / `<audio>`, Chrome speech recognition, vitest.
**Spec:** planning doc §2 feature 1, risks "Grok Voice slow live".
**Owner:** Anders. **Needs:** 01 (placeholders for `speakLine`, `sendToRocket`/`onRocketMessage`/`isRocketConnected`, `LINES`) and 04 Task 0 notes. The rocket routes work against 01's placeholder (`isRocketConnected()` is false, so `via: "rocket"` plays on the laptop) until Neel's real link lands; no waiting.

## Global Constraints
See `00-index.md`.

---

### Task 1: `/api/voice` + `speakLine`

**Files:**
- Create: `app/api/voice/route.ts`, `lib/voice/hash.ts`
- Modify: `lib/voice/speak.ts` (replace the 01 Task 5 placeholder body; keep the signature `speakLine(text, opts?: { via?, queue? })`)
- Test: `lib/__tests__/hash.test.ts`

**Interfaces — Produces:** `hashLine(text: string): string` — stable 12-char hex of the trimmed text (used for cache filenames).

`speakLine` always plays on the laptop, including `via: "rocket"`. Order: (1) `public/audio/<hash>.<ext>` if it exists (fast, works offline); (2) `POST /api/voice { text }` with `TEXT_TIMEOUT_MS`; (3) browser `speechSynthesis`. Cached files and Grok TTS play through the laptop audio element from `getOutputNode()`, so the mascot lip-sync follows the real audio. The phone does not speak these lines. Resolves when playback ends. Only one line plays at a time: a new call stops the previous one, unless it passes `queue: true`, which waits for the current line to finish (13 uses this to add an emissions sentence after a checkpoint line).

Which lines use which `via` (both play on the laptop):
| Speech | `via` | Why |
|---|---|---|
| Mission callouts and checkpoint prompts ("Liftoff! We're entering the first phase of flight", "Hold it steady!") | `rocket` | Short callouts. Still the laptop speaker, next to the mic |
| The short cheer at the end ("Touchdown! You did it!") | `rocket` | |
| Tour narration, answers to questions, Grok's end-of-mission comment | `screen` | Longer answers, same laptop output |

- [ ] **Step 1: Failing tests:** `H1` same text → same hash; `H2` `"  hi "` and `"hi"` → same hash; `H3` different text → different hash.
- [ ] **Step 2:** fail → **Step 3:** implement hash, route (calls Grok Voice per the notes; returns the audio bytes with the right `Content-Type`), and `speakLine` → **Step 4:** pass.
- [ ] **Step 5: Verify:** start the tour. Expected: the Grok voice reads each line on the laptop, including `speakLine("Liftoff!", { via: "rocket" })`. The paired phone stays quiet for speech. Stop the network (or unset the key) → it falls back without hanging.
- [ ] **Step 6:** Commit `feat: grok voice with fallbacks`.

### Task 2: Pre-generate narration

**Files:**
- Create: `scripts/cache-narration.ts`, `public/audio/manifest.json`
- Modify: `lib/voice/lines.ts` (created in 01 Task 5; add lines here as needed)

**Interfaces — Produces:** `LINES` in `lib/voice/lines.ts`: `{ reset: "Reset! Stand the rocket up and lift off when you're ready.", touchdown: "Touchdown! You did it!", goodQuestion: "Good question!", cantReachGrok: "I couldn't reach Grok. Try again." }`. 07 and 11 import these instead of writing the strings themselves.

- [ ] **Step 1:** Script collects every `say` from `data/parts/*.json` and `data/missions/*.json`, every checkpoint `prompt` and coach hint **if Neel's `lib/mission.ts` / `lib/coach.ts` exist yet** (dynamic import; skip them otherwise and rerun after the next merge; lines not yet cached simply play live), and the fixed lines in `lib/voice/lines.ts` ("Touchdown! You did it!", "Good question!", the reset line, "I couldn't reach Grok…"), skips lines already in `public/audio/`, calls Grok Voice for the rest, saves `public/audio/<hash>.<ext>`, writes `manifest.json` (`{ [hash]: ext }`) that `speakLine` reads to know which files exist.
- [ ] **Step 2:** `npx tsx scripts/cache-narration.ts`. Expected: one file per line; rerun skips them all.
- [ ] **Step 3:** Commit audio + script `feat: cached narration audio`. Rerun after any `say` line changes.

### Task 3: Push-to-talk

**Files:**
- Create: `components/voice/PushToTalk.tsx`, `lib/voice/listen.ts`, `app/api/listen/route.ts`

**Interfaces — Produces:** `listenOnce(source: "rocket" | "screen"): Promise<string>` — resolves with the final transcript, rejects `"no-speech"`, `"denied"` or `"unsupported"`. `"rocket"` sends `{ k: "listen" }` and waits for `heard` / `listenError` (10 s timeout); `"screen"` uses the laptop mic.
```ts
// Where questions are heard from. The phone mic is inside a tube in a loud hall, so it may lose.
// Decide from Saturday's hallway test (12 Task 3 Step 4) and record the result here.
export const MIC_SOURCE: "rocket" | "screen" = "rocket";
```

Speech-to-text: record with `MediaRecorder` and `POST` the audio to `/api/listen`, which calls xAI's speech-to-text (endpoint and format in `docs/xai-notes.md`; ~$0.10 per hour of audio) with the server-side key and returns `{ text }`. The phone rocket (10 Task 6) uses the same route, so Android, iPhone and the laptop all share one path. Fallback only if xAI speech-to-text fails during testing: Chrome's built-in `webkitSpeechRecognition` on the laptop.

- [ ] **Step 1:** Big **"Ask the rocket"** button on the laptop screen (also hold `V` on the keyboard; `Space` is taken by the mission backup in 12). Tap → `listenOnce(MIC_SOURCE)` (falls back to `"screen"` when the rocket isn't connected or answers `listenError`). Show "Listening…", then the transcript.
- [ ] **Step 2:** Transcript → `askAgent` → `speakLine(reply, { via: "screen" })`; show the reply as a caption. While answering, the rocket says a short "Good question!" (`via: "rocket"`) so the kid knows it heard them.
- [ ] **Step 3:** Microphone denied or unsupported on both → hide the mic button and keep the text box from 04.
- [ ] **Step 4: Verify** with both sources, in the noisiest spot you can find: tap, say "let's fly", check the mission starts; ask "why nine engines?", check the answer. Count how many of 10 questions each mic gets right; set `MIC_SOURCE` to the winner.
- [ ] **Step 5:** Commit `feat: push-to-talk`.

### Task 4: Rocket sound files

**Files:**
- Create: `public/sounds/<SoundId>.mp3` (one per `SoundId` in 01), `public/sounds/CREDITS.md`

Neel's phone page (10 Task 3) plays `/sounds/<SoundId>.mp3` and stays silent if a file is missing, so this never blocks Neel.
- [ ] **Step 1:** Find one file per `SoundId`: countdown, liftoff rumble (loopable), max-Q rumble (loopable), separation clunk, fairing pop, entry burn, landing thud, success chime, launch music. **Only CC0 / public-domain** audio or sounds you make; NASA launch recordings are generally public domain (check each page). **No copyrighted songs, no SpaceX webcast audio.**
- [ ] **Step 2:** Trim effects to ≤ 4 s, normalize loudness, export mp3 named exactly by `SoundId`.
- [ ] **Step 3:** `CREDITS.md`: file, source URL, license, one line each.
- [ ] **Step 4:** Commit `feat: rocket sounds (CC0, credited)`.

