# 12 · Demo + Submission Plan

> **For agentic workers (Cursor Agent):** Tasks 1–2 are code/docs; Tasks 3–5 are people tasks. Steps use `- [ ]` checkboxes.

**Goal:** A rehearsed 2-minute demo, a README that shows judges where Cursor, Grok and real data are used, and a Devpost submission in by 7:00 AM Sunday.
**Spec:** planning doc §2 "Demo script", §6 "Proving Cursor use".
**Owner:** Both. **Needs:** everything that survived the cut list. **Feature freeze:** Sat 12:00 AM. After that, only fixes.

## Global Constraints
See `00-index.md`.

---

### Task 1: Demo hardening (Sat 9 PM–12 AM)

- [ ] **Step 1:** `?demo=1` URL flag: skips loading spinners where possible, preselects the demo mission, prefers cached audio and cached Imagine images.
- [ ] **Step 2:** Keyboard shortcuts as a backup if voice or hardware fails: `L` launch replay, `T` tour, `E` toggle explode, `2` turn off two engines, `I` imagine selected part, `Esc` reset. List them in a small `?` overlay.
- [ ] **Step 3:** Run `npm test` and `npm run build`. Expected: all green, build succeeds.
- [ ] **Step 4:** Commit `feat: demo mode and keyboard fallbacks`.

### Task 2: README (Sun 12–4 AM)

**Files:** `README.md`, `docs/screenshots/*`

Sections, in this order:
- [ ] **What it is:** the one-liner + a GIF of the explode and replay.
- [ ] **Demo:** the 2-minute script.
- [ ] **How Grok is used:** voice agent with function calling (list the tools), Grok Voice narration, Grok Imagine; where the facts-only prompt lives.
- [ ] **Real space data:** `falcon9.json` specs and sources; the mission timeline source; Launch Library 2 for booster history; the engine-out math and its "liftoff only" caveat.
- [ ] **Built with Cursor:** `.cursor/rules/`, the `docs/plans/` workflow (one plan per stage, one task per agent run), 3–4 screenshots of Cursor Agent building features, usage screenshots.
- [ ] **Hardware:** wiring table and photo from 10.
- [ ] **Architecture:** the diagram from the planning doc.
- [ ] **Credits:** "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0 (link); NASA 3D Resources if used; "Student project, not affiliated with SpaceX."
- [ ] Commit `docs: readme`.

### Task 3: Rehearse (Sun 4–5 AM)

- [ ] **Step 1:** Run the demo script 3 times end to end on the demo laptop in Chrome, plugged in, with the prop. Time it: under 2:00.
- [ ] **Step 2:** Practice each failure: Wi-Fi off (cached audio and images), hardware unplugged (mouse + keys), agent misunderstands (keyboard shortcut).
- [ ] **Step 3:** Decide who talks and who drives.

### Task 4: Video + Devpost (Sun 5–7 AM)

- [ ] **Step 1:** Record the 2-minute demo video (screen + a phone shot of the prop). Upload unlisted to YouTube.
- [ ] **Step 2:** Devpost: title "Teardown", tagline, the README's "What it is" and "How Grok is used" sections, video link, repo link, screenshots, built-with tags (Cursor, Grok, Next.js, three.js, ESP32).
- [ ] **Step 3:** Select every prize we qualify for (SpaceXAI, Hardware for Good, Chalk if B11 shipped).
- [ ] **Step 4:** Submit by **7:00 AM**. Devpost closes at 8:00.

### Task 5: Proof screenshots (anytime Sun before submitting)

- [ ] Both teammates' Cursor usage pages for Oct 16–18.
- [ ] The Grok Bot planning thread.
- [ ] `git log --oneline | head -30` showing small commits with the Cursor trailer.
- [ ] Add them to the README and Devpost gallery.
