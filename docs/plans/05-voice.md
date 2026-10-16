# 05 · Voice Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Every spoken line uses Grok Voice, with cached audio as a fallback, and judges can hold a button and ask a question out loud.
**Architecture:** `/api/voice` turns text into audio with Grok Voice. `speakLine` (the function 03 stubbed) plays it, falling back to pre-generated files, then to the browser voice. Push-to-talk turns speech into text and hands it to `askAgent` (04).
**Tech Stack:** Grok Voice API (format per `docs/xai-notes.md`), Web Audio / `<audio>`, Chrome speech recognition, vitest.
**Spec:** planning doc §2 feature 1, risks "Grok Voice slow live".
**Owner:** B. **Needs:** 04 (Task 0 notes, `askAgent`).

## Global Constraints
See `00-index.md`.

---

### Task 1: `/api/voice` + `speakLine`

**Files:**
- Create: `app/api/voice/route.ts`, `lib/voice/hash.ts`
- Modify: `lib/voice/speak.ts` (replace A's stub body; keep the signature `speakLine(text: string): Promise<void>`)
- Test: `lib/__tests__/hash.test.ts`

**Interfaces — Produces:** `hashLine(text: string): string` — stable 12-char hex of the trimmed text (used for cache filenames).

`speakLine` order: (1) `public/audio/<hash>.<ext>` if it exists (fast, works offline); (2) `POST /api/voice { text }` with `TEXT_TIMEOUT_MS`; (3) browser `speechSynthesis`. Resolves when playback ends. Only one line plays at a time: a new call stops the previous one.

- [ ] **Step 1: Failing tests:** `H1` same text → same hash; `H2` `"  hi "` and `"hi"` → same hash; `H3` different text → different hash.
- [ ] **Step 2:** fail → **Step 3:** implement hash, route (calls Grok Voice per the notes; returns the audio bytes with the right `Content-Type`), and `speakLine` → **Step 4:** pass.
- [ ] **Step 5: Verify:** start the tour. Expected: the Grok voice reads each line; stop the dev server's network (or unset the key) → it falls back without hanging.
- [ ] **Step 6:** Commit `feat: grok voice with fallbacks`.

### Task 2: Pre-generate narration

**Files:**
- Create: `scripts/cache-narration.ts`, `public/audio/manifest.json`

- [ ] **Step 1:** Script collects every `say` from `data/parts/*.json` and `data/missions/*.json`, skips lines already in `public/audio/`, calls Grok Voice for the rest, saves `public/audio/<hash>.<ext>`, writes `manifest.json` (`{ [hash]: ext }`) that `speakLine` reads to know which files exist.
- [ ] **Step 2:** `npx tsx scripts/cache-narration.ts`. Expected: one file per line; rerun skips them all.
- [ ] **Step 3:** Commit audio + script `feat: cached narration audio`. Rerun after any `say` line changes.

### Task 3: Push-to-talk

**Files:**
- Create: `components/voice/PushToTalk.tsx`, `lib/voice/listen.ts`

**Interfaces — Produces:** `listenOnce(): Promise<string>` — resolves with the final transcript, rejects `"no-speech"` or `"unsupported"`.

Speech-to-text: if `docs/xai-notes.md` shows Grok Voice accepts audio input, record with `MediaRecorder` and send it; otherwise use Chrome's built-in `webkitSpeechRecognition` for input and keep Grok Voice for output. Write which one you chose in the notes.

- [ ] **Step 1:** Hold the mic button (or the Space bar) to listen; release to stop. Show "Listening…", then the transcript.
- [ ] **Step 2:** Transcript → `askAgent` → `speakLine(reply)`; show the reply as a caption.
- [ ] **Step 3:** Microphone denied or unsupported → hide the mic button and keep the text box from 04.
- [ ] **Step 4: Verify:** hold, say "launch it", release. Expected: replay starts and Grok narrates.
- [ ] **Step 5:** Commit `feat: push-to-talk`.
