# 12 · Demo + Submission — Implementation Spec

**Plan:** `docs/plans/12-demo-submission.md` · **Owner:** Both · **Needs:** everything that survived the cut list · **Feature freeze:** Sat 12:00 AM. After that, only fixes.
**Contract:** `docs/specs/01-setup-contract.spec.md` wins over the plan (store, types, seams). **Theme:** every UI piece below uses the tokens and classes of `docs/specs/00-theme.spec.md` (`.kiosk`, `.display--sentence`, `.reveal`, `.attract`, `.btn`, `.btn-accent`, `.btn-lg`, `.btn-icon`, `.card`, `.caption`, `.overlay`, `.dock--bottom`, `.scrim-bottom`, `--z-overlay`, `--target`). No hard-coded colours.
Footer line (already in 01 and 03, repeated in the README): **"Student project. Not affiliated with SpaceX or xAI."**

## Compile status

The Task 1 and Task 2 code, including the three TSX components, was type-checked under `strict` (with React types) and the tests run green against the 01 contract, with stubs for the 05, 07, 09 and 11 exports this spec calls (`checkpointsFor`, `poseAt`, `defaultMissionId`, `decideMove`, `isPairCode`, `newPairCode`, `readKiosk`, 09's `IMAGINE_RESET_EVENT`, 08's `useEnginesUi`). Result: `npx tsc --noEmit` clean; `npx vitest run` → 55 passed, 1 skipped (README R3, gated) including the 01 tests that live in the same project. Test ids added here: X1–X24 (X5b included), D1–D2, R1–R6.

## Decisions

| # | Decision |
|---|---|
| D1 | Exhibit state that is not scene state lives in a small zustand store `useExhibit` inside `lib/viewer/exhibit.ts`. The 01 store is not changed. |
| D2 | Everything of Neel's for 12 mounts through one component, `ExhibitRuntime`, rendered inside `MissionSlot`. The shortcuts, the idle timer and the attract screen need no other mount point. The overlays use `position: absolute; inset: 0` and rely on the page stage (`app/page.tsx`, `position: relative`) as the positioned ancestor, because the slot `div`s are not positioned. |
| D3 | Neel reads the URL flags with `parseFlags` and publishes the result as `<body class="kiosk">` (set before any sibling slot's effect runs). Anders's code reads that class (04's `AgentBox` does: `body.kiosk` or the query string), so the lanes share one signal and import nothing from each other. |
| D4 | The idle reset tells Anders's slots through a `window` event, `teardown:exhibit-reset` (`RESET_EVENT`), because the store has no field for "the visitor changed" and Anders's captions, transcript, agent history and any speech are local state. Each lane keeps its own copy of the string (Neel `RESET_EVENT`, Anders `lib/voice/flags.ts`, and 09's own `IMAGINE_RESET_EVENT`); `exhibit-drift.test.ts` pins Neel's to Anders's, 05's FL1 and 09's I13 pin theirs. |
| D5 | "Busy" is a running replay, tour or guided mission. Busy time counts as activity (`lastBusyAt`), so the reset waits a full `IDLE_MS` after a replay ends. Hard cap: once the last real touch, voice or rocket movement is `BUSY_MAX_MS` old (3 minutes) the exhibit resets whatever looks busy, so an abandoned mission or a stuck tour cannot hold it forever (X22 ticks once a second to prove it). |
| D6 | The attract loop is **silent** (plan). Words come as captions. Theme 6.1 says narration still plays under reduced motion; the plan's "silently" wins, see "Plan deltas". |
| D7 | `?demo=1` keeps the pairing code the same on every reload by remembering one random code in browser storage. A fixed public string in the repo would let a second laptop or a stranger join the channel. |
| D8 | **One clock.** Every `markActivity` caller passes `performance.now()` (the 01 comment; 05 and 11 already do). If a wrong-clock value ever gets in, `idleTick` re-anchors it to "now" (X5), so it can neither lock the idle reset nor wake the screen. |
| D9 | Neel's exhibit code imports no Anders component, hook or runtime function. (`lib/mission.ts`, which 07 owns, has its own existing seam imports; 12 adds none.) The laptop voice, an answer in flight, the caption and the agent history are handled by Anders's own `RESET_EVENT` listeners. |
| D10 | The decisions that carry the race risk (`idleTick`, `handlePointer`, `handleKey`, `handleWheel`) live in `lib/viewer/exhibit.ts`, not in the component, and are tested as sequences (X20–X23). The component only wires events and timers to them. |

## Task 1: Demo hardening (Sat 9 PM–12 AM)

### Files

| File | Owner | Kind |
|---|---|---|
| `lib/viewer/exhibit.ts` | Neel | flags, demo code, idle logic, reset, shortcut logic, `useExhibit`, `idleTick`, `handlePointer`, `handleKey` |
| `components/replay/ExhibitRuntime.tsx` | Neel | mount point: boot, key and pointer listeners, idle timer |
| `components/replay/AttractScreen.tsx` | Neel | attract + "Fly the mission" offer |
| `components/replay/HelpOverlay.tsx` | Neel | the `?` key list (not in kiosk) |
| `components/replay/MissionSlot.tsx` | Neel | modify: render `<ExhibitRuntime />`; hide the replay readout and start buttons while attract shows |
| `components/viewer/Stage.tsx` | Neel | modify: pass `silent` to `ReplayClock` |
| `components/ui/PairRocket.tsx` | Neel | modify: demo pairing code (inside its mount effect) |
| `app/globals.css` | Neel | add two rules: kiosk touch zoom, and hide the docks and nav behind the attract screen |
| `components/engines/enginesUi.ts` | Neel | consumed only (08's `useEnginesUi.setOpen(false)` in the reset) |
| `lib/__tests__/exhibit.test.ts` | Neel | X1–X24 |
| `lib/voice/flags.ts` | Anders | `RESET_EVENT`; created by 05 Task 3, 12 only checks it (code below) |
| `components/voice/PushToTalk.tsx`, `components/voice/AgentBox.tsx` | Anders | `RESET_EVENT` listeners that also call 04's `cancelAgent()` (edits table) |
| `lib/__tests__/exhibit-drift.test.ts` | Both | D1–D2 |

### Step 1: `?demo=1`

Plan: skip loading spinners where possible, preselect the demo mission, prefer cached audio and cached Imagine images, keep the pairing code fixed.

| Piece | Lane | What |
|---|---|---|
| Same pairing code | Neel | `PairRocket` builds its code inside its mount effect (11 Task 2). Change that line to `demoPairCode(parseFlags(window.location.search), safeStorage()) ?? newPairCode()` with `safeStorage = () => { try { return window.localStorage; } catch { return null; } }`. Demo mode: random once, saved, reused on every reload; the phone that scanned once stays paired for every judge. A second demo laptop gets its own code (scan again). |
| Demo mission preselected | Neel | M, L and the attract loop use `defaultMissionId(MISSIONS)` from 07 `lib/replay.ts`: the first real mission, else `practice`. The same function drives 07's "Fly the mission" button, so M and the button always pick the same mission. |
| Cached audio, cached Imagine images | Anders | **No new code.** 05's speaker already looks in the audio manifest first, then Grok Voice, then the browser voice (05 SV4); 09's `requestImagine` already checks `public/imagine/<partId>.jpg` first. Acceptance only: with Wi-Fi off the tour still talks and "Show in action" still works for the four cached parts. |
| Loading spinners | Neel | Deliberately minimal. The cache-first rules above mean a spinner rarely shows in demo mode, and hiding the only loading feedback would leave a kid staring at nothing for up to 30 s when a picture is generated live. No CSS hook, no `data-spinner`. |

### Step 2: Keyboard shortcuts

Each lane wires its own keys inside its own slot. Neel's keys come from `shortcutFor` / `runShortcut` (below); `ExhibitRuntime` listens once on `window`.

| Key | Lane | Action |
|---|---|---|
| `M` | Neel | `startMission(defaultMissionId)` |
| `Space` | Neel | finish the checkpoint the mission is **waiting** at (simulates the move; the mission works with no phone). Does nothing when the mission is not waiting. It works even when a button has focus (after a mouse click the button keeps focus) as long as the mission is waiting. |
| `L` | Neel | hands-free replay (`startReplay`) |
| `T` | Neel | start or stop the tour |
| `E` | Neel | explode toggle (0 ↔ 1) |
| `2` | Neel | two engines off (indexes 1 and 2, so T/W 1.10) or back on |
| `Esc` | Neel | reset (same as the idle reset; in kiosk it returns to attract). Ignored while a `<dialog>` is open: Escape closes the dialog. |
| `?` | Neel | toggle the key list; hidden in kiosk. While it is open only `?` and `Esc` work. |
| hold `V` | Anders | push-to-talk (05 `PushToTalk`; already built there) |
| `I` | Anders | `requestImagine("Show this part in action", selectedId)` (09 `ImagineSlot`; already built there) |

Rules: ignore auto-repeat and ctrl/meta/alt combos; ignore typing in a text box, `textarea`, `select` or `contenteditable` (a range slider or checkbox is **not** typing: after dragging the Explode slider the shortcuts must still work); every handled key calls `preventDefault` (Space must not scroll).

### Step 3: Museum exhibit mode (`?kiosk=1`)

```text
page load (kiosk) → attract screen ── touch ──► explore (phase "off")
        ▲                │
        │                └─ rocket moves ──► offer "Fly the mission" ── tap ──► guided mission
        └──── IDLE_MS with no touch, voice or rocket motion (a running replay, tour or mission counts as use) ────┘
              resetExhibit() then attract
```

| Behavior | Rule |
|---|---|
| Boot | `parseFlags`, `body.kiosk`; in kiosk: `markActivity(now)` then `enterAttract(now)` |
| Activity | window capture `pointerdown` and `keydown` → `markActivity(performance.now())` (`handlePointer`, `handleKey`); wheel and trackpad pinch on the model count too (at most once a second), so a visitor zooming for a minute is not reset. Touch and keys wake the screen, except a press or key inside the offer card and a bare Shift/Ctrl/Alt/Meta. Rocket motion calls `markActivity` itself (11 Task 5 Step 2). Anders's push-to-talk and example-question taps call it too (05 already does, with `performance.now()`). |
| Idle | every 1000 ms: `idleTick(now)` = `nextBusyAt`, then `idleAction`; `"reset"` → `resetExhibit()` + `enterAttract(now)`; `"reanchor"` (a wrong-clock time) → `markActivity(now)` |
| Reset | `resetExhibit()` (below). It does not call `markActivity`, so it never wakes the screen it just put to sleep. |
| Attract screen | the real mission replays silently (loop), captions of each event, motto, "Pick up the rocket to fly" (plan: always shown, big text), "Touch to explore". While the attract screen or the offer shows, `MissionSlot` hides the replay readout and start buttons (no duplicate "Fly the mission"). |
| Wake by touch | `wake("touch")` stops the attract replay (no narration, no moved parts, no blocked idle timer) and sets `phase = "off"` and `guardUntil = now + WAKE_GUARD_MS` in the same update; until then a transparent overlay keeps eating pointer events so the waking tap cannot press a button underneath |
| Wake by rocket | `shouldWakeByRocket` → `wake("rocket")` → phase `offer`: the replay stops and a card offers "Fly the mission" / "Just explore". Presses inside the card do not wake it, so its buttons get their click. It closes itself after `OFFER_MS`. |
| Hidden without a keyboard | Neel: `?` overlay and its key. Anders: 04's `AgentBox` hides the text form when `body.kiosk` and shows the example question buttons (04's `AGENT_STARTERS`) instead; 12 defines no list. Backup keys (M, L, T, E, 2, Esc, Space) stay live in kiosk on purpose: they are for the operator, and nothing on screen asks a visitor to use them. |
| Dismissing the offer | pressing anywhere outside the offer card wakes the screen into explore mode; that press may also reach whatever is under it (the offer is a card, not a full-screen blocker). Accepted. `Fly the mission` has focus when the offer opens, so Enter works; Esc and M are ignored while focus is in the card. |
| First paint | `body.kiosk` and the attract screen appear when React hydrates (a fraction of a second after load); until then the explore UI is visible. Accepted: nobody walks up in that moment. (If it matters, a tiny inline script in `app/layout.tsx` that adds `kiosk` to `body` when the query string has `kiosk=1` closes the gap; not specified here because the theme owns that file.) |
| Reduced motion | not implemented by 12 (see Plan deltas): the attract loop is the same silent replay; theme 6.1's "static pose per event" is a camera and `Rocket` behavior owned by 03/07. |
| No selection, menu or page zoom | `.kiosk` on `body` (theme: no select, no overscroll, no callout); `contextmenu` blocked; `ctrl`+wheel and Safari `gesturestart`/`gesturechange` blocked; `body.kiosk { touch-action: pan-x pan-y; }` stops two-finger page zoom on touch screens while the canvas keeps its own `touch-action: none` pinch handling. The viewport meta is left alone (theme section 6: do not disable pinch-zoom in the viewport). Ctrl and plus/minus browser zoom is left alone on purpose: the operator may need it. |

**The shake requirement.** After the reset, `mission.active === false` and `mission.results.length === 0`. 11 Task 5's `decideMove` restarts a mission on a shake only when `mission.missionId !== null && (mission.active || mission.results.length > 0)`, so a shake on the attract screen does nothing. The attract loop uses `startReplay`, which keeps the mission idle (01 S14). Test X15 calls 11's own `decideMove`, not a copy of its rule, so it fails if 11 changes.

### Code: `lib/viewer/exhibit.ts` (Neel)

```ts
// lib/viewer/exhibit.ts: demo flag, exhibit (kiosk) mode, idle reset, keyboard fallbacks (12 Task 1). Owner: Neel.
// Pure helpers first, then the store-touching ones. No React here, so everything is testable in node.
import { create } from "zustand";
import type { ToolResult } from "@/lib/types";
import { useScene } from "@/lib/store";
import { MISSIONS } from "@/data/missions/index";
import { checkpointsFor } from "@/lib/mission";
import { defaultMissionId } from "@/lib/replay";
import { isPairCode, newPairCode } from "@/lib/rocket/protocol";
import { sendToRocket } from "@/lib/rocket/commands";
import { useEnginesUi } from "@/components/engines/enginesUi";

// Clock rule: every markActivity caller passes performance.now() (01 comment; 05 and 11 already do). A time from
// the future (someone passed Date.now()) is re-anchored to "now" by idleTick, so it can never lock the idle reset.

// 60 s without interaction = the visitor walked away. Arbitrary; museums often use 30-120 s.
// Tune by watching other hackers use it on Saturday. (12 Task 1 Step 3)
export const IDLE_MS = 60_000;

// A running replay, tour or guided mission counts as "busy" (not idle). Hard cap: once the last real touch, voice or
// rocket movement is older than this, the exhibit resets even if something still looks busy (a stuck tour, an
// abandoned mission). 3 x IDLE_MS covers a 64 s replay plus the visitor reading the end screen. Arbitrary: tune Saturday.
export const BUSY_MAX_MS = 3 * IDLE_MS;

// How long the "Fly the mission" offer stays after someone picks up the rocket. Arbitrary: tune Saturday.
export const OFFER_MS = 15_000;

// Pause on the landed pose before the attract replay starts over. Arbitrary: tune Saturday.
export const ATTRACT_RESTART_MS = 3_000;

// The attract overlay keeps eating pointer events this long after a wake, so the touch that woke
// the screen cannot also press a button underneath it. Arbitrary: tune Saturday.
export const WAKE_GUARD_MS = 250;

// Browser storage entry that keeps the ?demo=1 pairing code the same across reloads (12 Task 1 Step 1).
export const DEMO_CODE_STORAGE = "teardown.demoPairCode";

// DOM event the idle reset dispatches on `window`. Anders's slots listen (stop speaking, clear caption,
// transcript and agent history, close the picture). The literal is copied in lib/voice/flags.ts (lanes never
// import each other); exhibit-drift.test.ts pins both copies.
export const RESET_EVENT = "teardown:exhibit-reset";

export interface ExhibitFlags { demo: boolean; kiosk: boolean }

/** `?demo=1&kiosk=1`. A flag is on only when its value is exactly "1". Never throws. */
export function parseFlags(search: string): ExhibitFlags {
  const p = new URLSearchParams(search);
  return { demo: p.get("demo") === "1", kiosk: p.get("kiosk") === "1" };
}

export interface CodeStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

/**
 * ?demo=1 keeps the pairing code the same on every reload, so a phone that scanned once stays paired between
 * judges. The code is random once per laptop and remembered in browser storage (not a public string in the repo).
 * null = not demo mode, or storage unusable: the caller then uses a fresh newPairCode() as usual.
 */
export function demoPairCode(f: ExhibitFlags, storage: CodeStorage | null, rand?: () => number): string | null {
  if (!f.demo || storage === null) return null;
  try {
    const saved = storage.getItem(DEMO_CODE_STORAGE);
    if (isPairCode(saved)) return saved;
    const code = newPairCode(rand);
    storage.setItem(DEMO_CODE_STORAGE, code);
    return code;
  } catch {
    return null; // private window or blocked storage: fall back to a fresh code
  }
}

export type Phase = "off" | "attract" | "offer";

/** Update the "last busy" time: busy counts only while the last real activity is at most BUSY_MAX_MS old. */
export function nextBusyAt(i: { now: number; lastActivityAt: number; lastBusyAt: number; busy: boolean }): number {
  return i.busy && i.now - i.lastActivityAt <= BUSY_MAX_MS ? i.now : i.lastBusyAt;
}

/** Tolerated skew between a markActivity time and "now" (a frame or two), ms. */
export const CLOCK_SKEW_MS = 1000;

/** What should the 1 s idle tick do? "reanchor" = lastActivityAt is from the future (wrong clock): set it to now so
 *  the timer starts over instead of waiting forever. Never "reset" while attract shows. */
export function idleAction(i: {
  now: number; lastActivityAt: number; lastBusyAt: number; idleMs?: number; phase: Phase;
}): "reset" | "reanchor" | "none" {
  if (i.lastActivityAt > i.now + CLOCK_SKEW_MS) return "reanchor";
  if (i.phase === "attract") return "none";
  if (i.now - i.lastActivityAt > BUSY_MAX_MS) return "reset"; // hard cap, whatever looks busy
  const last = Math.max(i.lastActivityAt, i.lastBusyAt);
  return i.now - last > (i.idleMs ?? IDLE_MS) ? "reset" : "none";
}

/** Rocket motion woke the attract screen? (11 Task 5 Step 2 calls markActivity when the phone moves.) */
export function shouldWakeByRocket(i: {
  phase: Phase; lastActivityAt: number; prevLastActivityAt: number; attractSince: number; now: number;
}): boolean {
  return i.phase === "attract" && i.lastActivityAt !== i.prevLastActivityAt
    && i.lastActivityAt > i.attractSince && i.lastActivityAt <= i.now + CLOCK_SKEW_MS;
}

/** A pointer press wakes the screen, except a press inside the offer card (its buttons must get their click). */
export function wakesOnPointer(phase: Phase, insideOffer: boolean): boolean {
  return phase !== "off" && !(phase === "offer" && insideOffer);
}

/** The attract loop needs (re)starting: attract is showing and nothing is playing. */
export function attractNeedsStart(s: {
  phase: Phase; replay: { playing: boolean }; mission: { active: boolean };
}): boolean {
  return s.phase === "attract" && !s.replay.playing && !s.mission.active;
}

// Exhibit state that is not scene state (kept out of the 01 store on purpose: the contract stays unchanged).
interface ExhibitState {
  flags: ExhibitFlags;
  phase: Phase;
  attractSince: number;   // performance.now() when attract began; rocket motion after this wakes it
  lastBusyAt: number;     // performance.now() of the last tick that saw a running replay, tour or mission
  guardUntil: number;     // until this performance.now() the (gone) attract overlay still eats pointer events
  helpOpen: boolean;      // the "?" overlay (never opened in kiosk)
  setFlags(f: ExhibitFlags): void;
  enterAttract(now: number): void;
  noteBusy(now: number): void;
  wake(how: "touch" | "rocket"): void;
  toggleHelp(): void;
}

export const useExhibit = create<ExhibitState>()((set, get) => ({
  flags: { demo: false, kiosk: false },
  phase: "off",
  attractSince: 0,
  lastBusyAt: 0,
  guardUntil: 0,
  helpOpen: false,
  setFlags: (flags) => set({ flags }),
  enterAttract: (now) => set({ phase: "attract", attractSince: now, lastBusyAt: 0, guardUntil: 0, helpOpen: false }),
  noteBusy: (now) => set({ lastBusyAt: now }),
  wake: (how) => {
    const { phase } = get();
    if (how === "touch") {
      if (phase === "off") return;
      // Leaving attract: stop the silent loop so it cannot narrate, move parts or block the idle timer.
      // (Leaving the offer needs no stop: the offer already stopped it, and "Fly the mission" has started a mission.)
      if (phase === "attract") useScene.getState().stopReplay();
      // Set in the same update as phase, so there is no frame without the guard (WAKE_GUARD_MS).
      set({ phase: "off", guardUntil: performance.now() + WAKE_GUARD_MS });
      return;
    }
    if (phase === "attract") {
      useScene.getState().stopReplay(); // calm scene behind the "Fly the mission" offer
      set({ phase: "offer" });
    }
  },
  toggleHelp: () => set({ helpOpen: !get().helpOpen }),
}));

/**
 * Puts everything back the way the next visitor expects. Does NOT call markActivity (that would wake the screen).
 *
 * Why a shake on the attract screen cannot start a mission: 11 Task 5 (decideMove) restarts only when
 * `mission.active || mission.results.length > 0`. stopReplay()/resetMission() leave both false, and the attract
 * loop uses startReplay, which keeps the mission idle (01 S14). Test X15 runs 11's own decideMove.
 *
 * The laptop's voice, caption and agent history are Anders's: he listens for RESET_EVENT (this file never
 * imports his code).
 */
export function resetExhibit(): void {
  const s = useScene.getState();
  s.stopTour();
  s.stopReplay();      // also resets the mission (01 contract change)
  s.resetMission();    // explicit, so this stays correct even if stopReplay changes
  s.setExplode(0);
  s.selectPart(null);
  s.flyTo("home");
  s.setEnginesOut([]);
  s.setLevel("kid");
  s.setLens("rocket");
  s.setImageUrl(null);
  useEnginesUi.getState().setOpen(false); // 08's panel auto-opens on engine changes; the next visitor starts closed
  if (typeof document !== "undefined") {
    document.querySelectorAll("dialog[open]").forEach((d) => (d as HTMLDialogElement).close());
  }
  // The phone: stop sounds, speech, the mic and any vibration (Android only; iPhone has no vibration).
  sendToRocket({ k: "stop" });
  sendToRocket({ k: "stopSay" });
  sendToRocket({ k: "stopListen" });
  sendToRocket({ k: "vibrate", pattern: [0] });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

// ---- What ExhibitRuntime wires to timers and events, kept here so it is testable ----

/** One idle-timer tick (every 1000 ms in kiosk). Returns what it did. */
export function idleTick(now: number): "reset" | "reanchor" | "none" {
  const ex = useExhibit.getState();
  const sc = useScene.getState();
  const busy = sc.replay.playing || sc.tour.active || sc.mission.active; // a visitor watching or flying is not "away"
  const lastBusyAt = nextBusyAt({ now, lastActivityAt: sc.lastActivityAt, lastBusyAt: ex.lastBusyAt, busy });
  if (lastBusyAt !== ex.lastBusyAt) ex.noteBusy(lastBusyAt);
  const a = idleAction({ now, lastActivityAt: sc.lastActivityAt, lastBusyAt, phase: ex.phase });
  if (a === "reanchor") {
    // Start the attract clock over too, so the re-anchored time is not "after attract began" (that would wake it).
    if (ex.phase === "attract") useExhibit.setState({ attractSince: now });
    sc.markActivity(now);
  }
  if (a === "reset") { resetExhibit(); useExhibit.getState().enterAttract(now); }
  return a;
}

/** A pointer press (window capture phase). */
export function handlePointer(insideOffer: boolean, now: number): void {
  const ex = useExhibit.getState();
  if (wakesOnPointer(ex.phase, insideOffer)) ex.wake("touch");
  useScene.getState().markActivity(now);
}

/** Scrolling or pinching the model counts as use, but never wakes the attract screen (only touch, keys or the rocket do). */
export function handleWheel(now: number): void {
  if (useExhibit.getState().phase === "attract") return;
  useScene.getState().markActivity(now);
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock"]);

/** A key press (window capture phase). Returns true when a shortcut handled it (the caller then calls preventDefault).
 *  `env.insideOffer`: focus is inside the offer card, so Enter and Space must reach its button. */
export function handleKey(
  e: KeyLike,
  env: { typing: boolean; dialogOpen: boolean; interactiveFocused: boolean; insideOffer: boolean },
  now: number,
): boolean {
  const ex = useExhibit.getState();
  const sc = useScene.getState();
  if (typeof e.key !== "string") return false;   // some autofill events have no key
  if (MODIFIER_KEYS.has(e.key)) return false; // a bare Shift or Ctrl is neither use nor a wake-up
  if (!env.insideOffer) ex.wake("touch");
  sc.markActivity(now);
  const id = shortcutFor(e, {
    typing: env.typing, kiosk: ex.flags.kiosk, dialogOpen: env.dialogOpen,
    interactiveFocused: env.interactiveFocused, waiting: sc.mission.waiting, helpOpen: ex.helpOpen,
  });
  if (!id || env.insideOffer) return false;
  if (id === "help") useExhibit.getState().toggleHelp(); else runShortcut(id, now);
  return true;
}

// ---- Keyboard fallbacks (Neel's keys; Anders wires V and I in his own slots) ----

export type ShortcutId =
  "mission" | "checkpoint" | "replay" | "tour" | "explode" | "engines" | "reset" | "help";

export interface KeyLike { key: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }
export interface ShortcutCtx {
  typing: boolean;             // focus is in a text box, textarea, select or contenteditable (NOT a slider or button)
  kiosk: boolean;
  dialogOpen: boolean;         // a dialog or popover is open (<dialog open>, .popover, aria-expanded): Escape closes it, not us
  interactiveFocused: boolean; // focus is on a button/link: Space already clicks it...
  waiting: boolean;            // ...unless the mission is waiting at a checkpoint: then Space finishes the move
  helpOpen: boolean;           // the "?" list is open: only "?" and Escape work behind it
}

const SHORTCUT_BY_KEY: Record<string, ShortcutId> = {
  m: "mission", " ": "checkpoint", l: "replay", t: "tour", e: "explode", "2": "engines", Escape: "reset", "?": "help",
};

export function shortcutFor(e: KeyLike, ctx: ShortcutCtx): ShortcutId | null {
  if (typeof e.key !== "string" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || ctx.typing) return null;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const id = Object.prototype.hasOwnProperty.call(SHORTCUT_BY_KEY, k) ? SHORTCUT_BY_KEY[k] : undefined;
  if (!id) return null;
  if (ctx.helpOpen && id !== "help") return null;
  if (id === "help" && ctx.kiosk) return null;
  if (id === "reset" && ctx.dialogOpen) return null;
  if (id === "checkpoint" && ctx.interactiveFocused && !ctx.waiting) return null;
  return id;
}

/** Rows for the "?" overlay. Includes Anders's V and I as plain text only. */
export const SHORTCUT_HELP: readonly { keys: string; text: string }[] = [
  { keys: "M", text: "Start the mission" },
  { keys: "Space", text: "Do the move for me" },
  { keys: "L", text: "Watch the launch" },
  { keys: "T", text: "Start or stop the tour" },
  { keys: "E", text: "Pull the rocket apart, or put it back" },
  { keys: "2", text: "Turn two engines off, or back on" },
  { keys: "Esc", text: "Start over" },
  { keys: "V", text: "Hold V, then talk" },
  { keys: "I", text: "Show the picked part in action" },
  { keys: "?", text: "Show this list" },
];

/** Space: finish the checkpoint the mission is waiting at (simulates the move, so the mission works with no phone). */
export function completeCurrentCheckpoint(now: number): ToolResult {
  const { mission, completeCheckpoint } = useScene.getState();
  if (!mission.active || !mission.waiting || mission.missionId === null) {
    return { ok: false, error: "not waiting at a checkpoint" };
  }
  const m = Object.prototype.hasOwnProperty.call(MISSIONS, mission.missionId) ? MISSIONS[mission.missionId] : null;
  const cp = m ? checkpointsFor(m)[mission.step] : undefined;
  if (!cp) return { ok: false, error: "no checkpoint at this step" };
  completeCheckpoint(now, cp.id);
  return { ok: true };
}

/** Runs one shortcut against the store. "help" is UI-only (the component toggles the overlay). */
export function runShortcut(id: ShortcutId, now: number): ToolResult {
  const s = useScene.getState();
  switch (id) {
    case "mission": return s.startMission(defaultMissionId(MISSIONS)); // same pick as 07's "Fly the mission" button
    case "checkpoint": return completeCurrentCheckpoint(now);
    case "replay": return s.startReplay(defaultMissionId(MISSIONS));
    case "tour":
      if (s.tour.active) { s.stopTour(); return { ok: true }; }
      return s.startTour();
    case "explode": return s.setExplode(s.explode > 0.5 ? 0 : 1);
    // Indexes 1 and 2: seven engines run, T/W 1.10 "barely" (same as 01 test T1).
    case "engines": return s.setEnginesOut(s.enginesOut.length > 0 ? [] : [1, 2]);
    case "reset": {
      resetExhibit();
      if (useExhibit.getState().flags.kiosk) useExhibit.getState().enterAttract(now);
      return { ok: true };
    }
    case "help": return { ok: true };
  }
}
```

### Code: `lib/voice/flags.ts` (Anders; created by 05 Task 3, shown so 12's contract is explicit)

```ts
// lib/voice/flags.ts: the exhibit reset event for Anders's slots (12 Task 1). Owner: Anders.
// Kiosk mode reaches Anders's code as <body class="kiosk"> (set by 12's ExhibitRuntime). ?demo=1 needs nothing here: 05's speaker and
// 09's requestImagine already use the cached audio and pictures first.
// The literal is a copy of RESET_EVENT in lib/viewer/exhibit.ts (lanes never import each other);
// exhibit-drift.test.ts pins both copies. 09 keeps its own copy, IMAGINE_RESET_EVENT.

/** Dispatched on `window` by Neel's resetExhibit(). Listeners: PushToTalk (stopSpeaking, abort any listen or
 *  answer in flight and call cancelAgent(), clear question, reply and history, ignore a late reply) and 04's AgentBox (same). */
export const RESET_EVENT = "teardown:exhibit-reset";
```

### Components (Neel). Skeletons: theme tokens and classes only

`components/replay/ExhibitRuntime.tsx`

```tsx
"use client";
// 12 Task 1: boots exhibit/demo mode and owns every window listener. Rendered by MissionSlot (D2).
// All decisions live in lib/viewer/exhibit.ts (idleTick, handlePointer, handleKey), where they are tested.
import { useEffect, useLayoutEffect } from "react";
import { useScene } from "@/lib/store";
import { AttractScreen } from "@/components/replay/AttractScreen";
import { HelpOverlay } from "@/components/replay/HelpOverlay";
import {
  handleKey, handlePointer, handleWheel, idleTick, parseFlags, shouldWakeByRocket, useExhibit,
} from "@/lib/viewer/exhibit";

// Layout effect where there is a DOM, plain effect while rendering on the server (avoids the SSR warning).
const useBootEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const IDLE_CHECK_MS = 1000;     // how often the idle timer looks; the idle limit itself is IDLE_MS
const WHEEL_ACTIVITY_MS = 1000; // scrolling or pinching the model counts as use, at most once a second
const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

// Typing = a place where letters go. A range slider, checkbox or button is NOT typing.
function isTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable;
}
const isInteractive = (el: Element | null) => !!el?.closest("button, a, summary, [role='button']");
const inOffer = (el: Element | null) => !!el?.closest("[data-exhibit-offer]");

export function ExhibitRuntime() {
  const kiosk = useExhibit((s) => s.flags.kiosk);

  // 1. Boot: flags, body class, first attract screen. Runs before any passive effect of a sibling slot, so
  //    `body.kiosk` is set when 04's AgentBox reads it after mount.
  useBootEffect(() => {
    const flags = parseFlags(window.location.search);
    useExhibit.getState().setFlags(flags);
    document.body.classList.toggle("kiosk", flags.kiosk);
    if (flags.kiosk) {
      const now = performance.now();
      useScene.getState().markActivity(now);        // strict ">" in shouldWakeByRocket: equal times do not wake
      useExhibit.getState().enterAttract(now);
    }
    // Lets globals.css hide the nav and docks behind the attract screen (theme: "the motto plus one button").
    document.body.dataset.exhibitPhase = useExhibit.getState().phase;
    const unsub = useExhibit.subscribe((s) => { document.body.dataset.exhibitPhase = s.phase; });
    return () => {
      unsub();
      document.body.classList.remove("kiosk");
      delete document.body.dataset.exhibitPhase;
    };
  }, []);

  // 2. Input: touch, keys and wheel count as activity; touch and keys wake the screen; keys run the shortcuts.
  useEffect(() => {
    let lastWheel = 0;
    const onPointer = (e: PointerEvent) => handlePointer(inOffer(e.target as Element | null), performance.now());
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const handled = handleKey(e, {
        typing: isTyping(el), dialogOpen: !!document.querySelector("dialog[open], .popover:not([hidden])"),
        interactiveFocused: isInteractive(el), insideOffer: inOffer(el),
      }, performance.now());
      if (handled) e.preventDefault();               // Space must not scroll the page
    };
    const onWheelActivity = () => {
      const now = performance.now();
      if (now - lastWheel < WHEEL_ACTIVITY_MS) return;
      lastWheel = now;
      handleWheel(now);
    };
    const stop = (e: Event) => e.preventDefault();
    const onWheelKiosk = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); }; // trackpad pinch = page zoom
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheelActivity, { passive: true });
    if (kiosk) {
      window.addEventListener("contextmenu", stop);
      window.addEventListener("wheel", onWheelKiosk, { passive: false });
      window.addEventListener("gesturestart", stop);   // Safari page pinch
      window.addEventListener("gesturechange", stop);
    }
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheelActivity);
      window.removeEventListener("contextmenu", stop);
      window.removeEventListener("wheel", onWheelKiosk);
      window.removeEventListener("gesturestart", stop);
      window.removeEventListener("gesturechange", stop);
    };
  }, [kiosk]);

  // 3. Idle timer and rocket wake (kiosk only).
  useEffect(() => {
    if (!kiosk) return;
    const timer = setInterval(() => { idleTick(performance.now()); }, IDLE_CHECK_MS);
    // Rocket motion (11 Task 5 Step 2) calls markActivity; while attracting, that offers the mission.
    const unsub = useScene.subscribe((s, prev) => {
      const ex = useExhibit.getState();
      if (shouldWakeByRocket({
        phase: ex.phase, lastActivityAt: s.lastActivityAt, prevLastActivityAt: prev.lastActivityAt,
        attractSince: ex.attractSince, now: performance.now(),
      })) ex.wake("rocket");
    });
    return () => { clearInterval(timer); unsub(); };
  }, [kiosk]);

  return (
    <>
      <AttractScreen />
      {!kiosk && <HelpOverlay />}
    </>
  );
}
```

Behavior notes: a key during attract wakes it **before** the shortcut runs, so `M` on the attract screen wakes and starts the mission. A press inside the `<dialog>` is still activity. After a laptop sleep `performance.now()` may pause or jump: the worst case is one early or late reset.

`components/replay/AttractScreen.tsx`

```tsx
"use client";
// 12 Task 1 Step 3: attract screen + the "Fly the mission" offer. Silent loop: captions carry the words (D6).
import { useEffect, useState } from "react";
import { useScene } from "@/lib/store";
import { MISSIONS } from "@/data/missions/index";
import { defaultMissionId, poseAt } from "@/lib/replay";
import { ATTRACT_RESTART_MS, OFFER_MS, attractNeedsStart, useExhibit } from "@/lib/viewer/exhibit";

const OVERLAY = { position: "absolute", inset: 0, zIndex: "var(--z-overlay)" } as const;

export function AttractScreen() {
  const phase = useExhibit((s) => s.phase);
  const guardUntil = useExhibit((s) => s.guardUntil);
  // Primitive selectors only: the replay clock changes `t` every frame and must not re-render this component.
  const playing = useScene((s) => s.replay.playing);
  const missionActive = useScene((s) => s.mission.active);
  const started = useScene((s) => s.replay.missionId !== null);
  const caption = useScene((s) => {
    const id = s.replay.missionId;
    return id !== null && Object.prototype.hasOwnProperty.call(MISSIONS, id)
      ? poseAt(MISSIONS[id], s.replay.t).lastEvent?.say ?? null : null;
  });
  const [expiredFor, setExpiredFor] = useState(0);

  // After a wake, keep swallowing pointer events until guardUntil (WAKE_GUARD_MS). guardUntil is set in the same
  // store update as phase "off", so there is no render without the guard. The timer records which guard has ended
  // (not a clock comparison), so a timer that fires a hair early can never leave the overlay stuck on.
  useEffect(() => {
    const left = guardUntil - performance.now();
    if (left <= 0) return;
    const t = setTimeout(() => setExpiredFor(guardUntil), left + 20);
    return () => clearTimeout(t);
  }, [guardUntil]);

  // Loop the replay while attracting: start now, and again ATTRACT_RESTART_MS after it ends (ReplayClock pauses at the end).
  const needsStart = attractNeedsStart({ phase, replay: { playing }, mission: { active: missionActive } });
  useEffect(() => {
    if (!needsStart) return;
    const t = setTimeout(() => useScene.getState().startReplay(defaultMissionId(MISSIONS)), started ? ATTRACT_RESTART_MS : 0);
    return () => clearTimeout(t);
  }, [needsStart, started]);

  // The offer closes itself after OFFER_MS. (wake("rocket") already stopped the replay.)
  useEffect(() => {
    if (phase !== "offer") return;
    const t = setTimeout(() => useExhibit.getState().wake("touch"), OFFER_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "off") return guardUntil !== expiredFor && performance.now() < guardUntil ? <div style={OVERLAY} aria-hidden /> : null;

  if (phase === "offer") {
    return (
      <div className="dock dock--bottom card" data-exhibit-offer role="group" aria-label="Fly the mission"
           style={{ zIndex: "var(--z-overlay)" }}>
        <p className="lead">Ready to fly?</p>
        <div className="row">
          <button className="btn btn-accent btn-lg" autoFocus onClick={() => {
            useScene.getState().startMission(defaultMissionId(MISSIONS));
            useExhibit.getState().wake("touch");        // from the offer: does not stop the new mission
          }}>Fly the mission</button>
          <button className="btn" onClick={() => useExhibit.getState().wake("touch")}>Just explore</button>
        </div>
      </div>
    );
  }

  // phase === "attract"
  return (
    <div style={OVERLAY}>
      <div className="scrim-bottom" style={{ position: "absolute", inset: "auto 0 0 0", height: "55%" }} />
      <div className="stack" style={{ position: "absolute", left: "var(--gutter)", right: "var(--gutter)", bottom: "var(--sp-6)" }}>
        <p className="display display--sentence reveal">Bringing rocket science down to Earth.</p>
        <p className="display display--sentence reveal reveal--2">Pick up the rocket to fly</p>
        {caption && <p className="caption" aria-live="polite">{caption}</p>}
        <button className="btn btn-accent btn-lg attract reveal reveal--3"
                onClick={() => useExhibit.getState().wake("touch")}>Touch to explore</button>
      </div>
    </div>
  );
}
```

Edge cases: no real mission registered → `defaultMissionId` returns `practice`; `startReplay` returning `ok: false` is ignored. The overlay sits above everything (`--z-overlay`), so the Ask button and cards underneath cannot be pressed until it wakes. The "Touch to explore" `onClick` is a fallback for keyboard focus; the real wake is the window `pointerdown`. After the offer self-closes the screen is plain explore mode; the idle timer resets it `IDLE_MS` after the last activity. Reduced motion: `.reveal` and `.attract` are neutralised by the theme CSS; the rocket holds a still pose (theme 6.1); captions still change per event. Offer buttons are 48 px or more (`.btn`, `.btn-lg`).

`components/replay/HelpOverlay.tsx`

```tsx
"use client";
// 12 Task 1 Step 2: the "?" key list. Native <dialog> per theme 6.2. Not rendered in kiosk.
import { useEffect, useRef } from "react";
import { SHORTCUT_HELP, useExhibit } from "@/lib/viewer/exhibit";

export function HelpOverlay() {
  const open = useExhibit((s) => s.helpOpen);
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      d.querySelector<HTMLElement>("[data-close]")?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="overlay" aria-labelledby="help-title"
            onClose={() => { useExhibit.setState({ helpOpen: false }); (opener.current as HTMLElement | null)?.focus?.(); }}
            onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <div className="overlay__panel stack">
        <h2 id="help-title" className="eyebrow">Keyboard keys</h2>
        <dl className="stack">
          {SHORTCUT_HELP.map((r) => (
            <div className="hud__row" key={r.keys}><dt className="hud__v">{r.keys}</dt><dd>{r.text}</dd></div>
          ))}
        </dl>
        <button data-close className="btn btn-icon overlay__close" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
      </div>
    </dialog>
  );
}
```

### Edits to other files (each owner, in files they already own)

| File | Change |
|---|---|
| `components/replay/MissionSlot.tsx` (Neel, 07 Task 4) | render `<ExhibitRuntime />` as a child. Read `const quiet = useExhibit((s) => s.phase !== "off")` and render the `ReplayHud` / start buttons only when `!quiet`, so the replay readout does not show through the attract screen and the offer card has no duplicate button. The guided-mission HUD and end screen are unaffected (the idle reset puts the mission back to idle before attract). |
| `components/viewer/Stage.tsx` (Neel, 07 Task 3) | pass `silent={phase === "attract"}` to 07's `ReplayClock` (`phase` from `useExhibit`). `AttractScreen` restarts the replay itself so the pause on the landed pose and the captions work. |
| `components/ui/PairRocket.tsx` (Neel, 11 Task 2) | the code line described in Step 1, inside the mount effect (never during server render). |
| `app/globals.css` (Neel) | append two rules (rules, not tokens): `body.kiosk { touch-action: pan-x pan-y; }` and `body[data-exhibit-phase="attract"] .dock, body[data-exhibit-phase="attract"] .nav { visibility: hidden; }`. `ExhibitRuntime` mirrors the phase onto `body[data-exhibit-phase]`. Theme 7 wants the attract screen to be the motto plus one button; the offer card is a `.dock` but shows in phase `offer`, not `attract`. |
| `components/voice/PushToTalk.tsx` (Anders, 05) | 05 already listens for `RESET_EVENT` and uses `performance.now()`. Make sure the listener also: calls `stopSpeaking()`, aborts a listen in flight, calls 04's `cancelAgent()` (an answer still in flight must not speak to the next visitor or run `start_mission` / `select_part` on the fresh scene), and that `answerQuestion` checks the reset epoch **before** `speakLine(reply)` as well as before showing the reply. |
| `components/voice/AgentBox.tsx` (Anders, 04) | add a `RESET_EVENT` listener that calls `cancelAgent()` and clears the reply, tool log and history now (04 only clears them on its own quiet-spell timer, so after Esc in kiosk the last visitor's answer would stay on screen). |
| `lib/voice/flags.ts` (Anders, 05 Task 3) | exists after 05 Task 3 with the one export below; 12 only checks it. |
| `components/imagine/ImagineSlot.tsx` (Anders, 09) | no change: 09 already has the `I` key and its own `IMAGINE_RESET_EVENT` (same literal; 09's test I13 pins it). |
| `lib/voice/speak.ts` (Anders, 05) | no change for `?demo=1` (cache-first already). |

### Tests: `lib/__tests__/exhibit.test.ts` (Neel)

```ts
// 12 Task 1: demo flag, exhibit mode, idle reset, keyboard fallbacks. Owner: Neel.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useScene } from "@/lib/store";
import { MISSIONS } from "@/data/missions/index";
import { checkpointsFor } from "@/lib/mission";
import { defaultMissionId } from "@/lib/replay";
import { decideMove } from "@/lib/rocket/moves";
import { isPairCode } from "@/lib/rocket/protocol";
import { useEnginesUi } from "@/components/engines/enginesUi";
import type { Mission } from "@/lib/types";
import {
  ATTRACT_RESTART_MS, BUSY_MAX_MS, DEMO_CODE_STORAGE, IDLE_MS, RESET_EVENT, SHORTCUT_HELP,
  WAKE_GUARD_MS, attractNeedsStart, demoPairCode, handleKey, handlePointer, handleWheel, idleAction, idleTick,
  nextBusyAt, parseFlags, resetExhibit, runShortcut, shortcutFor, shouldWakeByRocket, useExhibit, wakesOnPointer,
} from "@/lib/viewer/exhibit";
import type { CodeStorage, KeyLike, ShortcutCtx } from "@/lib/viewer/exhibit";

const sent: unknown[] = [];
vi.mock("@/lib/rocket/commands", () => ({
  sendToRocket: (m: unknown) => { sent.push(m); },
  onRocketMessage: () => () => {},
  isRocketConnected: () => false,
}));

const initial = useScene.getState();
const initialExhibit = useExhibit.getState();
const s = () => useScene.getState();
const x = () => useExhibit.getState();

const FIXTURE_ID = "exhibit-fixture";
const FIXTURE: Mission = {
  id: FIXTURE_ID, name: "Fixture", date: "2020-01-01",
  booster: { serial: "B0000", flight: 1 }, landing: "droneship", source: "https://example.com",
  events: [
    { t: 0, id: "liftoff", say: "Liftoff!" }, { t: 72, id: "maxq", say: "Max-Q!" },
    { t: 154, id: "stage_sep", say: "Separation!" }, { t: 400, id: "entry_burn", say: "Burn!" },
    { t: 510, id: "landing", say: "Landing!" },
  ],
};

beforeAll(() => { MISSIONS[FIXTURE_ID] = FIXTURE; });
afterAll(() => { delete MISSIONS[FIXTURE_ID]; });
beforeEach(() => {
  useScene.setState(initial, true);
  useExhibit.setState(initialExhibit, true);
  sent.length = 0;
});
afterEach(() => { vi.unstubAllGlobals(); });

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike =>
  ({ key: k, repeat: false, ctrlKey: false, metaKey: false, altKey: false, ...over });
const ctx = (over: Partial<ShortcutCtx> = {}): ShortcutCtx =>
  ({ typing: false, kiosk: false, dialogOpen: false, interactiveFocused: false, waiting: false, helpOpen: false, ...over });
const memStorage = (initialValue?: string): CodeStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  if (initialValue !== undefined) data.set(DEMO_CODE_STORAGE, initialValue);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
};

describe("exhibit flags and demo code (12 Task 1 Step 1)", () => {
  it("X1 parseFlags: only an exact 1 turns a flag on", () => {
    expect(parseFlags("?demo=1&kiosk=1")).toEqual({ demo: true, kiosk: true });
    expect(parseFlags("kiosk=1")).toEqual({ demo: false, kiosk: true });
    expect(parseFlags("?kiosk=true")).toEqual({ demo: false, kiosk: false });
    expect(parseFlags("")).toEqual({ demo: false, kiosk: false });
    expect(parseFlags("%%%&&==")).toEqual({ demo: false, kiosk: false });
  });

  it("X2 demoPairCode: valid, remembered across reloads, never outside demo, survives bad storage", () => {
    const demo = { demo: true, kiosk: false };
    const st = memStorage();
    const first = demoPairCode(demo, st);
    expect(isPairCode(first)).toBe(true);            // 11 Task 1 alphabet and length
    expect(demoPairCode(demo, st)).toBe(first);       // "reload": same code, so the phone stays paired
    expect(demoPairCode({ demo: false, kiosk: true }, st)).toBeNull();
    expect(demoPairCode(demo, null)).toBeNull();
    const junk = memStorage("not a code");
    const fixed = demoPairCode(demo, junk, () => 0);   // junk entry is replaced
    expect(fixed).toBe("AAAA");
    expect(junk.data.get(DEMO_CODE_STORAGE)).toBe("AAAA");
    const throwing: CodeStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(demoPairCode(demo, throwing)).toBeNull();  // caller falls back to newPairCode()
  });
});

describe("idle reset decision (12 Task 1 Step 3)", () => {
  const base = { now: 100_000, lastActivityAt: 0, lastBusyAt: 0, phase: "off" as const };
  it("X3 resets only after IDLE_MS and never while attract is showing", () => {
    expect(idleAction({ ...base, now: IDLE_MS })).toBe("none");          // exactly IDLE_MS: not yet
    expect(idleAction({ ...base, now: IDLE_MS + 1 })).toBe("reset");
    expect(idleAction({ ...base, lastActivityAt: 90_000 })).toBe("none");
    expect(idleAction({ ...base, phase: "attract" })).toBe("none");       // already idle: do not loop
    expect(idleAction({ ...base, phase: "offer" })).toBe("reset");        // nobody took the offer
    expect(idleAction({ ...base, idleMs: 5_000, now: 6_000 })).toBe("reset");
  });

  it("X4 busy time counts as activity, but only for BUSY_MAX_MS after the last real touch", () => {
    // The replay (about 64 s) ends right after the last touch: the reset waits a further IDLE_MS, not zero.
    let busyAt = 0;
    for (const now of [10_000, 40_000, 70_000]) busyAt = nextBusyAt({ now, lastActivityAt: 5_000, lastBusyAt: busyAt, busy: true });
    expect(busyAt).toBe(70_000);
    expect(idleAction({ now: 71_000, lastActivityAt: 5_000, lastBusyAt: busyAt, phase: "off" })).toBe("none");
    expect(idleAction({ now: 70_000 + IDLE_MS + 1, lastActivityAt: 5_000, lastBusyAt: busyAt, phase: "off" })).toBe("reset");
    // A stuck tour: busy forever, but no touch for BUSY_MAX_MS, so it stops counting and the reset happens.
    const stuck = nextBusyAt({ now: 5_000 + BUSY_MAX_MS + 1, lastActivityAt: 5_000, lastBusyAt: 100, busy: true });
    expect(stuck).toBe(100);
    expect(idleAction({ now: 5_000 + BUSY_MAX_MS + 1, lastActivityAt: 5_000, lastBusyAt: stuck, phase: "off" })).toBe("reset");
    expect(nextBusyAt({ now: 9, lastActivityAt: 0, lastBusyAt: 3, busy: false })).toBe(3);
  });

  it("X5 a markActivity time from the wrong clock is re-anchored, so the reset still comes", () => {
    // REGRESSION GUARD (review): a stray Date.now() (about 1.7e12) used to make lastActivityAt "the future" for ever,
    // so the idle reset never fired and the next screen wake fired at once.
    const future = 1_700_000_000_000;
    expect(idleAction({ now: 500_000, lastActivityAt: future, lastBusyAt: 0, phase: "off" })).toBe("reanchor");
    expect(shouldWakeByRocket({ phase: "attract", lastActivityAt: future, prevLastActivityAt: 0, attractSince: 10, now: 500_000 })).toBe(false);
    useScene.setState({ lastActivityAt: future });
    expect(idleTick(500_000)).toBe("reanchor");
    expect(s().lastActivityAt).toBe(500_000);                       // started over
    expect(idleTick(500_000 + IDLE_MS)).toBe("none");
    expect(idleTick(500_000 + IDLE_MS + 1)).toBe("reset");          // and the reset fires one IDLE_MS later
    expect(x().phase).toBe("attract");
  });

  it("X5b a wrong-clock time while attracting does not open the offer", () => {
    x().enterAttract(1_000);
    useScene.setState({ lastActivityAt: 1_700_000_000_000 });
    expect(idleTick(2_000)).toBe("reanchor");
    expect(s().lastActivityAt).toBe(2_000);
    expect(shouldWakeByRocket({
      phase: x().phase, lastActivityAt: s().lastActivityAt, prevLastActivityAt: 1_700_000_000_000,
      attractSince: x().attractSince, now: 2_000,
    })).toBe(false);                                                // attractSince was moved to now
    expect(x().phase).toBe("attract");
  });

  it("X6 shouldWakeByRocket: only a new, later timestamp while attracting", () => {
    const b = { phase: "attract" as const, lastActivityAt: 2_000, prevLastActivityAt: 0, attractSince: 1_000, now: 2_100 };
    expect(shouldWakeByRocket(b)).toBe(true);
    expect(shouldWakeByRocket({ ...b, lastActivityAt: 1_000 })).toBe(false);          // not after attract began
    expect(shouldWakeByRocket({ ...b, prevLastActivityAt: 2_000 })).toBe(false);      // unchanged
    expect(shouldWakeByRocket({ ...b, phase: "offer" })).toBe(false);
    expect(shouldWakeByRocket({ ...b, phase: "off" })).toBe(false);
  });

  it("X7 a press inside the offer card must not wake it (its buttons need their click)", () => {
    // REGRESSION GUARD (review): waking on pointerdown unmounted the card before the click landed.
    expect(wakesOnPointer("attract", false)).toBe(true);
    expect(wakesOnPointer("offer", false)).toBe(true);
    expect(wakesOnPointer("offer", true)).toBe(false);
    expect(wakesOnPointer("off", false)).toBe(false);
  });

  it("X8 attractNeedsStart", () => {
    const idle = { replay: { playing: false }, mission: { active: false } };
    expect(attractNeedsStart({ phase: "attract", ...idle })).toBe(true);
    expect(attractNeedsStart({ phase: "attract", replay: { playing: true }, mission: { active: false } })).toBe(false);
    expect(attractNeedsStart({ phase: "attract", replay: { playing: false }, mission: { active: true } })).toBe(false);
    expect(attractNeedsStart({ phase: "off", ...idle })).toBe(false);
    expect(ATTRACT_RESTART_MS).toBeGreaterThan(0);
  });
});

describe("keyboard fallbacks (12 Task 1 Step 2)", () => {
  it("X9 key map, case, repeat, modifiers, typing, dialogs, kiosk, the open help list", () => {
    const expected: Record<string, string> = {
      m: "mission", " ": "checkpoint", l: "replay", t: "tour", e: "explode", "2": "engines", Escape: "reset", "?": "help",
    };
    for (const [k, id] of Object.entries(expected)) expect(shortcutFor(key(k), ctx())).toBe(id);
    expect(shortcutFor(key("M"), ctx())).toBe("mission");
    expect(shortcutFor(key("m", { repeat: true }), ctx())).toBeNull();
    expect(shortcutFor(key("m", { ctrlKey: true }), ctx())).toBeNull();
    expect(shortcutFor(key("t", { metaKey: true }), ctx())).toBeNull();
    expect(shortcutFor(key("m"), ctx({ typing: true }))).toBeNull();
    expect(shortcutFor(key("Escape"), ctx({ dialogOpen: true }))).toBeNull();
    expect(shortcutFor(key("?"), ctx({ kiosk: true }))).toBeNull();
    expect(shortcutFor(key("m"), ctx({ kiosk: true }))).toBe("mission"); // backup keys still work in kiosk
    expect(shortcutFor(key("m"), ctx({ helpOpen: true }))).toBeNull();     // nothing fires behind the "?" list
    expect(shortcutFor(key("?"), ctx({ helpOpen: true }))).toBe("help");
    for (const k of ["v", "V", "i", "I", "x", "Enter", "toString", "constructor"]) {
      expect(shortcutFor(key(k), ctx())).toBeNull(); // V and I belong to Anders's slots
    }
  });

  it("X10 Space on a focused button: native click, except while the mission waits", () => {
    // REGRESSION GUARD (review): after a mouse click on "Fly the mission" the button keeps focus; Space must still
    // finish the checkpoint instead of re-clicking that button.
    expect(shortcutFor(key(" "), ctx({ interactiveFocused: true }))).toBeNull();
    expect(shortcutFor(key(" "), ctx({ interactiveFocused: true, waiting: true }))).toBe("checkpoint");
  });

  it("X11 Space completes the current checkpoint, and only while the mission waits", () => {
    // REGRESSION GUARD (00-index Review Focus 6, 01 S7): a stray Space must never skip a step.
    expect(runShortcut("checkpoint", 100).ok).toBe(false); // no mission
    expect(runShortcut("mission", 0).ok).toBe(true);
    expect(s().mission.active).toBe(true);
    expect(runShortcut("checkpoint", 100).ok).toBe(false); // clock running, not waiting
    expect(s().mission.step).toBe(0);
    s().waitAtCheckpoint(1000);
    expect(runShortcut("checkpoint", 2500)).toEqual({ ok: true });
    expect(s().mission.step).toBe(1);
    expect(s().mission.results[0]).toEqual({ id: "liftoff", reactionMs: 1500 });
    expect(runShortcut("checkpoint", 2600).ok).toBe(false); // not waiting again
    expect(s().mission.step).toBe(1);
    // A fixture mission with all six checkpoints: six Spaces at six pauses finish it.
    expect(checkpointsFor(FIXTURE)).toHaveLength(6);
  });

  it("X12 key 2, E, T, L, M act on the store; M and L use 07's default mission", () => {
    runShortcut("engines", 0);
    expect(s().enginesOut).toEqual([1, 2]);
    runShortcut("engines", 0);
    expect(s().enginesOut).toEqual([]);
    runShortcut("explode", 0);
    expect(s().explode).toBe(1);
    runShortcut("explode", 0);
    expect(s().explode).toBe(0);
    runShortcut("tour", 0);
    expect(s().tour.active).toBe(true);
    runShortcut("tour", 0);
    expect(s().tour.active).toBe(false);
    expect(runShortcut("replay", 0).ok).toBe(true);
    expect(s().replay.missionId).toBe(defaultMissionId(MISSIONS)); // not a literal: survives 06's real mission
    expect(runShortcut("mission", 0).ok).toBe(true);
    expect(s().mission.missionId).toBe(defaultMissionId(MISSIONS));
    expect(runShortcut("help", 0)).toEqual({ ok: true }); // UI-only
  });

  it("X13 the help list names every key, in kid-level words", () => {
    expect(SHORTCUT_HELP.map((r) => r.keys)).toEqual(["M", "Space", "L", "T", "E", "2", "Esc", "V", "I", "?"]);
    for (const r of SHORTCUT_HELP) expect(r.text.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

function messyState() {
  s().selectPart("legs");
  s().setExplode(1);
  s().startTour();
  s().setEnginesOut([1, 2]);
  s().setLevel("engineer");
  s().setLens("emissions");
  s().setImageUrl("/imagine/legs.jpg");
  s().startMission(FIXTURE_ID);
  s().waitAtCheckpoint(0);
  s().completeCheckpoint(500, "liftoff");
  s().endMission({ stars: 3, reasons: ["x"] });
}

describe("idle reset (12 Task 1 Step 3)", () => {
  it("X14 resetExhibit puts every field back to idle", () => {
    useEnginesUi.getState().setOpen(true);
    messyState();
    resetExhibit();
    expect(s().selectedId).toBeNull();
    expect(s().explode).toBe(0);
    expect(s().camera.focus).toBe("home");
    expect(s().tour).toEqual({ active: false, step: 0 });
    expect(s().replay).toEqual({ missionId: null, t: 0, playing: false });
    expect(s().enginesOut).toEqual([]);
    expect(s().level).toBe("kid");
    expect(s().lens).toBe("rocket");
    expect(s().imageUrl).toBeNull();
    expect(useEnginesUi.getState().open).toBe(false);                 // 08's panel does not stay open for the next visitor
    expect(s().mission).toMatchObject({
      active: false, missionId: null, step: 0, results: [], stars: null, softness: null, narratedStep: null,
    });
  });

  it("X15 shake on the attract screen cannot start a mission (runs 11's own decideMove)", () => {
    // REGRESSION GUARD (12 contract note): 11 Task 5 decides what a shake does. Using its function, not a copy of its
    // rule, means this fails if 11 changes the rule.
    const cps = () => checkpointsFor(FIXTURE);
    const shake = () => decideMove("shake", s().mission, cps(), null);
    messyState();
    expect(shake()).toEqual({ kind: "reset", missionId: FIXTURE_ID }); // right after a finish a shake does restart it
    resetExhibit();
    expect(shake()).toEqual({ kind: "ignore" });                       // after the idle reset it does not
    x().enterAttract(1);
    expect(s().startReplay(FIXTURE_ID).ok).toBe(true);                 // the attract loop
    expect(shake()).toEqual({ kind: "ignore" });
    s().pauseReplay();                                                 // replay ends and loops again
    s().startReplay(FIXTURE_ID);
    expect(shake()).toEqual({ kind: "ignore" });
  });

  it("X16 resetExhibit silences the phone and announces the reset", () => {
    const dispatched: string[] = [];
    vi.stubGlobal("window", { dispatchEvent: (e: { type: string }) => { dispatched.push(e.type); return true; } });
    vi.stubGlobal("CustomEvent", class { type: string; constructor(t: string) { this.type = t; } });
    resetExhibit();
    expect(sent).toEqual([
      { k: "stop" }, { k: "stopSay" }, { k: "stopListen" }, { k: "vibrate", pattern: [0] },
    ]);
    expect(dispatched).toEqual([RESET_EVENT]);
  });

  it("X17 phases: touch leaves attract and stops the silent loop; the rocket only moves attract to the offer", () => {
    x().wake("rocket");
    expect(x().phase).toBe("off");                // ignored when not in attract
    x().enterAttract(5);
    expect(x()).toMatchObject({ phase: "attract", attractSince: 5 });
    s().startReplay(FIXTURE_ID);                  // the attract loop is running
    x().wake("touch");
    expect(x().phase).toBe("off");
    expect(x().guardUntil).toBeGreaterThan(0);    // the guard is set in the same update as the phase (no gap)
    expect(WAKE_GUARD_MS).toBeGreaterThan(0);
    expect(s().replay).toEqual({ missionId: null, t: 0, playing: false }); // loop stopped: no narration, no parts moved
    x().enterAttract(9);
    s().startReplay(FIXTURE_ID);
    x().wake("rocket");
    expect(x().phase).toBe("offer");
    expect(s().replay.playing).toBe(false);       // calm scene behind the offer
    x().wake("rocket");
    expect(x().phase).toBe("offer");
  });

  it("X18 Fly the mission from the offer keeps the mission it just started", () => {
    // REGRESSION GUARD: wake("touch") from the offer must not call stopReplay (which resets the mission).
    x().enterAttract(1);
    x().wake("rocket");
    s().startMission(FIXTURE_ID);
    x().wake("touch");
    expect(x().phase).toBe("off");
    expect(s().mission).toMatchObject({ active: true, missionId: FIXTURE_ID });
  });

  it("X19 Esc in kiosk resets and returns to attract; outside kiosk it only resets", () => {
    messyState();
    runShortcut("reset", 10);
    expect(x().phase).toBe("off");
    expect(s().explode).toBe(0);
    x().setFlags({ demo: false, kiosk: true });
    runShortcut("reset", 20);
    expect(x()).toMatchObject({ phase: "attract", attractSince: 20, lastBusyAt: 0 });
  });

  it("X20 sequence: attract, rocket wake, offer, then no activity for IDLE_MS resets to attract", () => {
    useScene.getState().markActivity(1_000);
    x().setFlags({ demo: false, kiosk: true });
    x().enterAttract(1_000);
    expect(idleTick(5_000)).toBe("none");                            // attract never resets itself
    s().markActivity(6_000);                                          // the rocket moves (11 Task 5 Step 2)
    expect(shouldWakeByRocket({
      phase: x().phase, lastActivityAt: s().lastActivityAt, prevLastActivityAt: 1_000, attractSince: x().attractSince, now: 6_000,
    })).toBe(true);
    x().wake("rocket");
    expect(x().phase).toBe("offer");
    expect(idleTick(6_000 + IDLE_MS)).toBe("none");
    x().wake("touch");                                                // the offer closes itself after OFFER_MS
    expect(idleTick(6_000 + IDLE_MS + 1)).toBe("reset");
    expect(x().phase).toBe("attract");
    expect(s().mission.results).toEqual([]);
  });

  it("X21 sequence: a visitor-started replay is not cut off, and the reset waits IDLE_MS after it ends", () => {
    s().markActivity(1_000);
    s().startReplay(FIXTURE_ID);
    for (const now of [20_000, 40_000, 60_000]) expect(idleTick(now)).toBe("none"); // 59 s after the last touch: still busy
    s().pauseReplay();                                                // replay ends at 64 s
    expect(idleTick(62_000)).toBe("none");
    expect(idleTick(60_000 + IDLE_MS)).toBe("none");
    expect(idleTick(60_000 + IDLE_MS + 1)).toBe("reset");
  });

  it("X22 a mission waiting at a checkpoint (no motion) is reset by the hard cap, ticking once a second", () => {
    s().markActivity(1_000);
    s().startMission(FIXTURE_ID);
    s().waitAtCheckpoint(1_000);                                      // replay.playing is false while it waits
    let resetAt = -1;
    for (let now = 2_000; now <= 1_000 + BUSY_MAX_MS + 5_000 && resetAt < 0; now += 1_000) {
      if (idleTick(now) === "reset") resetAt = now;                   // real timer cadence: refreshing lastBusyAt every tick
    }
    expect(resetAt).toBe(1_000 + BUSY_MAX_MS + 1_000);                // the first tick after the cap, not cap + IDLE_MS
    expect(s().mission.active).toBe(false);
  });

  it("X23 handlePointer and handleKey: the offer card gets its click; bare modifiers do not wake", () => {
    const env = { typing: false, dialogOpen: false, interactiveFocused: false, insideOffer: false };
    x().enterAttract(1);
    x().wake("rocket");
    handlePointer(true, 100);                                         // press inside the offer card
    expect(x().phase).toBe("offer");
    expect(s().lastActivityAt).toBe(100);
    expect(handleKey(key("Enter"), { ...env, interactiveFocused: true, insideOffer: true }, 200)).toBe(false);
    expect(x().phase).toBe("offer");                                  // Enter on the card's button still works
    expect(handleKey({ key: undefined as unknown as string, repeat: false, ctrlKey: false, metaKey: false, altKey: false }, env, 250)).toBe(false); // autofill event without a key: no throw
    expect(handleKey(key("Shift"), env, 300)).toBe(false);
    expect(x().phase).toBe("offer");                                  // a bare Shift does not wake
    expect(s().lastActivityAt).toBe(200);                             // ...and is not activity either
    expect(handleKey(key("m"), env, 400)).toBe(true);                 // M wakes AND starts the mission
    expect(x().phase).toBe("off");
    expect(s().mission).toMatchObject({ active: true, missionId: defaultMissionId(MISSIONS) });
    handlePointer(false, 500);
    expect(s().lastActivityAt).toBe(500);
  });

  it("X24 modifier keys and the wheel never open the offer while attracting", () => {
    // REGRESSION GUARD (review): both used to call markActivity, and the store subscriber took that for rocket motion.
    const env = { typing: false, dialogOpen: false, interactiveFocused: false, insideOffer: false };
    s().markActivity(1_000);
    x().enterAttract(1_000);
    const wakes = (now: number) => shouldWakeByRocket({
      phase: x().phase, lastActivityAt: s().lastActivityAt, prevLastActivityAt: 1_000, attractSince: x().attractSince, now,
    });
    expect(handleKey(key("Shift"), env, 2_000)).toBe(false);
    handleWheel(3_000);
    expect(s().lastActivityAt).toBe(1_000);                           // neither touched the activity time
    expect(wakes(3_000)).toBe(false);
    x().wake("touch");                                                // after a real wake the wheel counts as use
    handleWheel(4_000);
    expect(s().lastActivityAt).toBe(4_000);
  });
});
```

### Test: `lib/__tests__/exhibit-drift.test.ts` (Both)

It pins Neel's `RESET_EVENT` and `parseFlags` to Anders's copies. D1 compares all three event copies directly; D2 compares the 04 and 05 kiosk helpers to 12, including the body-class override.

```ts
// 12 Task 1: Neel's resetExhibit and Anders's listeners each keep their own copy of the reset event name (lanes never
// import each other). This file, owned by Both, is the only place that compares them: the event name, and the
// kiosk flag (05's readKiosk against Neel's parseFlags). 05's FL1 pins lib/voice/flags.ts to the literal and 09's
// I13 pins its own IMAGINE_RESET_EVENT. (04 exports readAgentKiosk from starters.ts and AgentBox uses it; its body-class override is also pinned.)
import { describe, expect, it } from "vitest";
import { RESET_EVENT as VOICE_EVENT } from "@/lib/voice/flags";
import { readKiosk } from "@/lib/voice/ask";
import { readAgentKiosk } from "@/lib/agent/starters";
import { IMAGINE_RESET_EVENT } from "@/lib/imagine/client";
import { parseFlags, RESET_EVENT as VIEWER_EVENT } from "@/lib/viewer/exhibit";

describe("exhibit drift guard (12 Task 1)", () => {
  it("D1 both lanes use the same reset event name", () => {
    expect(VOICE_EVENT).toBe(VIEWER_EVENT);
    expect(IMAGINE_RESET_EVENT).toBe(VIEWER_EVENT);
    expect(VIEWER_EVENT).toBe("teardown:exhibit-reset");
  });
  it("D2 05's readKiosk agrees with Neel's parseFlags(...).kiosk", () => {
    for (const q of ["", "?", "?kiosk=1", "?demo=1&kiosk=1", "?kiosk=true", "?kiosk=0", "?a=2&kiosk=1", "%%%"]) {
      expect(readKiosk(q)).toBe(parseFlags(q).kiosk);
      expect(readAgentKiosk(q)).toBe(parseFlags(q).kiosk);
      expect(readAgentKiosk(q, true)).toBe(true);
    }
  });
});
```

### Steps and acceptance

- [ ] **Step 1:** `?demo=1` (table above).
- [ ] **Step 2:** keyboard shortcuts (table above), each lane in its own slot.
- [ ] **Step 3:** exhibit mode (above).
- [ ] **Step 4:** `npm test` → all green (X1–X24 and D1–D2 added); `npx tsc --noEmit` clean; `npm run build` succeeds.
- [ ] **Step 5:** commit `feat: demo mode, exhibit mode, keyboard fallbacks` (one commit per lane is fine, same message).

Manual acceptance (Chrome, laptop, then with the phone rocket):
- [ ] `/?kiosk=1`: attract screen shows at once; the replay plays with no sound, captions change per event, the loop restarts about 3 s after the end. No replay readout shows through the screen.
- [ ] Touch anywhere: the attract screen goes, the loop stops, nothing speaks, and the button underneath the touch was not pressed.
- [ ] Leave it after touching: it resets after `IDLE_MS` (set `IDLE_MS` to 5000 once to check faster, then put it back). While a replay runs it does not reset; a mission waiting at a checkpoint resets only after `BUSY_MAX_MS` with no touch, voice or rocket movement. (The 5 s check does not exercise 04's own `AgentBox` clear timer; that one relies on the reset event.)
- [ ] Pick up the paired rocket during attract: "Ready to fly?" with **Fly the mission**. Tap it with the mouse: the guided mission starts at the first checkpoint (the card does not vanish on press).
- [ ] **Shake test:** finish a mission (stars shown), wait for the idle reset, shake the rocket on the attract screen: nothing starts. Shake right after a finish, before the reset: the mission restarts (11 Task 5, unchanged).
- [ ] Ask a question and press `Esc` (or wait for the reset) **before** the answer arrives: nothing is spoken afterwards, no scene change happens, and the answer and log are gone.
- [ ] Ask a spoken question, then wait for the idle reset: speech stops, the answer and history are gone, an open Imagine picture closes, level is Kid, view is Rocket; the phone stops rumbling, talking and (Android) vibrating. After the question, the reset still fires on time (the clock check, D8).
- [ ] No text box, no `?` overlay in kiosk; the example question buttons work with touch; right-click does nothing; ctrl+scroll and two-finger touch do not zoom the page.
- [ ] `/?demo=1`: reload twice; the QR code shows the same code each time; an already paired phone reconnects. With Wi-Fi off, the tour and the replay lines still play (cached audio) and "Show in action" works for the four cached parts. `/?demo=1` in a private window: still works (new code each time).
- [ ] `/` (no flags): press `M`; at each of the six pauses press `Space`: the mission completes with no phone (the pauses come as the clock reaches each checkpoint, so expect to wait between presses). `E`, `T`, `2`, `L`, `Esc`, `?` each do their action, also right after dragging the Explode slider; typing in the text box never triggers a shortcut; with `?` open, `M` does nothing.

## Task 2: README (Sun 12–4 AM)

**Files:** `README.md` (Anders's file per 00-index; Neel writes the Museum exhibit, The guided mission and Phone rocket sections and hands them over, or edits them after announcing), `docs/screenshots/*`, `lib/__tests__/readme.test.ts` (Anders).

Rules the template follows: facts come from the data files (the engine-out table is checked against `data/parts/falcon9.json` by test R4); kid-level words for anything a visitor would read; everything that only exists later is a `{{TODO: ...}}` marker that test R3 refuses at submit time. Section order is the plan's order.

### `README.md` template

````md
# Teardown

**Bringing rocket science down to Earth.**

## What it is

Teardown is a Falcon 9 you can take apart, ask questions, and fly. Pull the rocket into its parts, ask Grok anything in plain words, watch a real mission replay, then slide your phone into a model rocket and fly the mission yourself. The rocket rumbles at liftoff and clunks at separation. It is built to work like a museum exhibit: simple enough for a kid, accurate enough for an engineer.

{{TODO: GIF of the explode and the replay, docs/screenshots/explode-replay.gif}}

Try it: {{TODO: live URL}} · Video: {{TODO: unlisted YouTube link}}

## The problem

Rockets are one of the most-watched technologies in the world and one of the least understood.

- The data is public but scattered: specs in PDFs, mission timelines in webcast timestamps, booster histories in launch databases.
- People watch launches without understanding what they are seeing. "Stage separation" and "boostback" mean nothing until you have seen them happen.
- Learning it is passive. Diagrams and videos show a rocket; nothing lets a kid take one apart, ask it questions, or fly it.

Who it is for: anyone, down to a young kid. If a 10-year-old cannot follow a screen or a spoken line, we rewrite it.

## Museum exhibit

Open `/?kiosk=1` and Teardown runs like a walk-up exhibit.

- **Attract screen.** When nobody is around, the real mission replays silently with captions, the motto shows, and the screen says "Pick up the rocket to fly" and "Touch to explore".
- **Idle reset.** After about a minute with no touch, no voice question and no rocket movement (`IDLE_MS` in `lib/viewer/exhibit.ts`; a running replay, tour or mission counts as use), everything goes back to the start: parts unselected, rocket together, Kid level, Rocket view, mission cleared, phone sounds stopped. The next visitor starts fresh.
- **Wake up.** Touch the screen to explore. Pick up the rocket and the screen offers "Fly the mission".
- **No keyboard needed.** The text box and the shortcut list are hidden. Touch, push-to-talk and the rocket are the inputs. Example question buttons replace typing. Text selection, the right-click menu and page zoom are off.

Why: the pitch is that this could live in a science museum. Visitors will not read instructions, will not have a keyboard, and will walk away mid-sentence.

## The guided mission

The real mission timeline runs, but it pauses at each big moment until you do the move with the rocket in your hands.

| # | Real moment | What you do | The rocket plays |
|---|---|---|---|
| 1 | Liftoff | Lift it off the table | Countdown, then rumble, music and a long buzz (Android phones only; iPhones cannot buzz) |
| 2 | Leaning over (gravity turn) | Tilt it partway | The rumble keeps going |
| 3 | Max-Q, when the air pushes hardest | Hold it still for 2 seconds | Heavier rumble (and short buzzes on Android) |
| 4 | Stage separation and boostback | Turn it upside down | A clunk |
| 5 | Entry burn | Turn it upright | Burn sound |
| 6 | Landing | Set it down gently | Thud and a success chime |

If a mission has no landing (an expended booster), the last row is skipped. A coach gives hints if you get stuck, and offers to do a step for you. You earn up to three stars: finished, quick reactions, soft landing.

{{TODO: GIF of someone flying the mission, docs/screenshots/fly-mission.gif}}

## What people learned

We handed the phone rocket to people and explained nothing. These are their real answers (see `docs/hallway-test.md`).

| Tester | Background | Minutes used | After separating, the booster... | Why does it have legs? | Understood the rocket's voice? |
|---|---|---|---|---|---|
| {{TODO}} | {{TODO}} | {{TODO}} | {{TODO}} | {{TODO}} | {{TODO}} |

Which microphone heard questions better, the phone or the laptop: {{TODO: result and the `MIC_SOURCE` we chose}}.

## Demo

The 2-minute script (if a feature is cut, delete its row, and fix the Who and Seconds columns). The guided mission is the long beat: its clock alone runs about a minute at 8x (`REPLAY_SPEED`), plus the six moves. If rehearsal runs over, raise `REPLAY_SPEED` (07 says "tune on the day"):

| # | Beat | Who | Seconds |
|---|---|---|---|
| 1 | Open with the problem line and the motto while the rocket spins; press `L` for the replay loop | {{TODO: who talks}} | 8s |
| 2 | A judge scans the QR code and slides the phone into the rocket; the model turns with it | {{TODO: who drives}} | 10s |
| 3 | Pull it apart; ask Grok "what's inside?" and hear one part in kid words | {{TODO: who talks}} | 12s |
| 4 | "Let's fly": the guided mission, lift, lean, hold, flip, upright, land, stars | {{TODO: who drives}} | 70s |
| 5 | "What if two engines fail?" Grok switches two Merlins off and explains | {{TODO: who talks}} | 8s |
| 6 | "Show me this landing": Grok Imagine paints the booster landing | {{TODO: who drives}} | 7s |

Backup keys if voice or the phone fails: `M` start the mission, `Space` do the current move, `L` launch replay, `T` tour, `E` explode, `2` turn two engines off, `Esc` start over, `?` list the keys, hold `V` to talk, `I` imagine the picked part. Add `?demo=1` to the URL for the judging setup: the pairing code stays the same after a reload, so the phone stays paired. Voice lines and pictures come from the cache first in every mode.

## How Grok is used

- **Voice agent with function calling.** Grok decides which scene action to run; the browser runs it. Tools: {{TODO: tool list from lib/agent (04)}}. Bad tool arguments return an error and the scene does nothing.
- **Grok Voice** speaks the tour, the answers and the mission callouts. Short callouts come out of the phone inside the rocket; longer answers come out of the laptop. Lines are cached in `public/audio/` so the demo works without Wi-Fi.
- **Grok Imagine** paints a part in action from the current 3D view. Four pictures are cached in `public/imagine/`.
- **Facts only.** The system prompt forbids inventing numbers: {{TODO: path of the prompt file (04)}}. Every number comes from `data/parts/falcon9.json` or `data/missions/`.
- **Safety nets.** Text and voice calls stop waiting after 8 seconds (a whole question gives up after 15) and fall back to a cached line or "I couldn't reach Grok". Image calls give up after 30 seconds. The key stays on the server (`XAI_API_KEY`, only used by server code behind `app/api/*`).

## Real space data

- `data/parts/falcon9.json`: part names, specs and the vehicle block (height, mass, thrust, engine count) from public SpaceX vehicle pages. Each part has a `source`.
- `data/missions/`: the replayed mission: {{TODO: mission name, booster serial, flight number}}. Timeline source: {{TODO: URL of the published timeline}}. Booster history comes from Launch Library 2, fetched once by a script and committed; the app never calls it live.
- `data/emissions/falcon9.json`: the emissions view, every value labelled official, peer-reviewed or estimate with its source.
- **Engine-out math** (liftoff only; delete this bullet, the table and the caveat if the simulator is cut): weight is liftoff mass times gravity; thrust-to-weight is thrust divided by weight. Above 1 the rocket can lift off.

| Engines running | Thrust | Thrust-to-weight | Lifts off? |
|---|---|---|---|
| 9 | 7,605 kN | 1.41 | Yes |
| 8 | 6,760 kN | 1.26 | Yes |
| 7 | 5,915 kN | 1.10 | Barely |
| 6 | 5,070 kN | 0.94 | No |

Caveat: this is a liftoff-only simplification. Real engine-out tolerance depends on the phase of flight, and the "Barely" cut-off (`BARELY_BELOW` in `lib/engines.ts`) is our own line between 1.10 and 1.26.

## Built with Cursor

We built Teardown in Cursor Agent, one plan per stage and one task per agent run.

- `.cursor/rules/project.mdc` holds the always-on project rules.
- `docs/plans/` has one plan per stage; `docs/specs/` has the matching code-level spec. Each agent run reads the index, one plan and one spec, does one task, runs the tests and stops for review.
- Commits are small, one task each, under the human author’s identity.

{{TODO: 3-4 screenshots of Cursor Agent building features, docs/screenshots/cursor-agent-*.png}}
{{TODO: both Cursor usage pages for Oct 16-18, docs/screenshots/cursor-usage-*.png}}

## Phone rocket

Your phone is the rocket's brain. Scan the QR code, slide the phone into the shell top-first with the screen facing out, and its motion sensors turn the 3D model while its speaker plays the rumbles, the clunks and Grok's voice. It works in Android Chrome and iPhone Safari, over HTTPS only.

- Pairing: a 4-character code joins the phone and the laptop through a hosted relay. If the phone goes quiet for 2 seconds, the QR code comes back and touch keeps working.
- Sounds: CC0 and public-domain files only; see `public/sounds/CREDITS.md`.

{{TODO: photo of the rocket shell, docs/screenshots/rocket-shell.jpg}}

## Architecture

```text
 ┌──── Phone in the rocket ────┐   realtime   ┌──────── Laptop (Chrome, exhibit screen) ─────────┐     ┌── Next.js API routes ──┐
 │ /rocket page (HTTPS)        │    relay     │ 3D viewer: explode · select · tour · replay      │     │ (xAI key lives here)   │
 │ motion sensors → frames ────┼─────────────►│ gestures → guided mission → stars                │────►│ /api/agent → Grok      │
 │ speaker: sounds + Grok ◄────┼──────────────│ sound + "say" commands · "listen" (mic, optional)│◄────│ /api/voice → Grok Voice│
 └─────────────────────────────┘  (QR code    │ voice UI (push-to-talk) · engine panel · Imagine │     │ /api/imagine → Imagine │
                                    pairing)  └──────────────────────────────────────────────────┘     └────────────────────────┘
  Facts: data/parts/falcon9.json · data/missions/<id>.json   Assets: public/models · public/audio (Grok Voice cache) · public/sounds (CC0)
```

## Credits

- 3D model: "Falcon 9 - SpaceX" by Stanley Creative, CC BY 4.0 ({{TODO: model page URL}}).
- Sounds: see `public/sounds/CREDITS.md` ({{TODO: one line per sound file: source and license}}).
- NASA 3D Resources: {{TODO: model name and link, or delete this line if unused}}.
- Mission and booster data: Launch Library 2 (The Space Devs); timeline: {{TODO: source}}.
- Voice, text and pictures: Grok (xAI).

Student project. Not affiliated with SpaceX or xAI.
````

### Test: `lib/__tests__/readme.test.ts` (Anders)

```ts
// 12 Task 2: the README keeps the plan's section order, the credits, the facts rule and the 2-minute demo budget.
// Owner: Anders (README.md is his file in the 00-index table). R3 only runs with README_FINAL=1 (pre-submit gate).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { liftoffThrustKN, liftoffTW } from "@/lib/engines";
import type { PartsFile } from "@/lib/types";
import partsJson from "@/data/parts/falcon9.json";

const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
const parts = partsJson as unknown as PartsFile;

// 12 Task 2: section order. The Devpost copy (docs/devpost.md) is cut from four of these headings by name.
const HEADINGS = [
  "What it is", "The problem", "Museum exhibit", "The guided mission", "What people learned", "Demo",
  "How Grok is used", "Real space data", "Built with Cursor", "Phone rocket", "Architecture", "Credits",
] as const;

function section(name: string): string {
  const start = readme.indexOf(`\n## ${name}\n`);
  if (start < 0) return "";
  const rest = readme.slice(start + 1);
  const end = rest.indexOf("\n## ", 4);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("README (12 Task 2)", () => {
  it("R1 the twelve sections appear in the plan's order", () => {
    const found = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(found).toEqual([...HEADINGS]);
  });

  it("R2 credits carry the model licence, the sounds file and the footer line", () => {
    const c = section("Credits");
    for (const need of [
      "Falcon 9 - SpaceX", "Stanley Creative", "CC BY 4.0", "public/sounds/CREDITS.md",
      "Student project. Not affiliated with SpaceX or xAI.",
    ]) expect(c).toContain(need);
  });

  it.skipIf(!process.env.README_FINAL)("R3 no {{TODO}} markers are left (run: README_FINAL=1 npm test)", () => {
    expect(readme.match(/\{\{TODO[^}]*\}\}/g) ?? []).toEqual([]);
  });

  it("R4 the engine-out table is computed from the parts file (facts rule)", () => {
    const rows: { out: number[]; yes: string }[] = [
      { out: [], yes: "Yes" }, { out: [1], yes: "Yes" }, { out: [1, 2], yes: "Barely" }, { out: [1, 2, 3], yes: "No" },
    ];
    const t = section("Real space data");
    if (!t.includes("| Engines running |")) return; // the simulator (08) was cut: no table, nothing to check
    for (const r of rows) {
      const running = parts.vehicle.merlinCount - r.out.length;
      const kn = liftoffThrustKN(parts.vehicle, r.out).toLocaleString("en-US");
      const tw = liftoffTW(parts.vehicle, r.out).toFixed(2);
      expect(t).toContain(`| ${running} | ${kn} kN | ${tw} | ${r.yes} |`);
    }
  });

  it("R5 the demo table has four to six beats that fit in 115 seconds", () => {
    const d = section("Demo");
    const secs = [...d.matchAll(/^\|\s*\d+\s*\|.*\|\s*(\d+)s\s*\|$/gm)].map((m) => Number(m[1]));
    expect(secs.length).toBeGreaterThanOrEqual(4); // plan: 6 beats; cutting Imagine or engine-out leaves 4 or 5
    expect(secs.length).toBeLessThanOrEqual(6);
    const total = secs.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(115); // 2:00 minus 5 s of slack
  });

  it("R6 no secrets or banned words", () => {
    // Words built from pieces so this file itself does not contain them.
    const banned = ["cla" + "ude", "co" + "dex", "genera" + "ted by"];
    for (const w of banned) expect(readme.toLowerCase()).not.toContain(w);
    expect(readme).not.toMatch(/XAI_API_KEY\s*=\s*\S/);
    expect(readme).not.toContain("NEXT_PUBLIC_XAI");
  });
});
```

### Steps and acceptance

- [ ] **Step 1:** copy the template into `README.md`; replace the 01 scaffold README. `npm test` → R1, R2, R4, R5, R6 pass, R3 skipped.
- [ ] **Step 2:** fill markers as the material appears: GIFs (`docs/screenshots/explode-replay.gif`, `fly-mission.gif`), hallway results (Task 3), mission name and timeline source (06), tool list and prompt path (04), sound credits (05 Task 4), rocket shell photo (10 Task 5), Cursor screenshots (Task 5).
- [ ] **Step 3:** before submitting: `README_FINAL=1 npm test` → R3 passes (no `{{TODO` left).
- [ ] **Step 4:** check every link opens logged out; no secret appears (R6).
- [ ] **Step 5:** commit `docs: readme`.

## Task 3: Rehearse (Sun 4–5 AM; hallway test Saturday)

**Files:** `docs/rehearsal.md`, `docs/hallway-test.md` (Both; plain docs, no code).

### `docs/rehearsal.md`

````md
# Rehearsal

Setup for every run: the demo laptop in Chrome, plugged in, `/?demo=1`; the phone rocket charged and paired (the demo code stays the same after a reload, so do not clear browser storage); both on the same network.

## Step 1: three timed runs
| Run | Start | End | Under 2:00? | What went wrong |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
Beats and seconds are in the README "Demo" table (total 115 s or less; the guided mission is the long beat). Pass: all three runs under 2:00.

## Step 2: practice each failure
| Failure | How to cause it | What the judge sees | What we do | Pass when |
|---|---|---|---|---|
| Hackathon Wi-Fi down | turn Wi-Fi off on the laptop | cached lines still play | move the laptop and the phone to the phone hotspot, reload `/?demo=1` (same pairing code), let the phone reconnect | the tour and the replay talk; the rocket is connected again |
| Phone disconnects | lock the phone mid-mission | the QR code returns after 2 s (11 `DISCONNECT_MS`) | keep going with touch and `Space` for checkpoints | the mission still finishes with stars |
| Agent misunderstands | say nonsense | a short "didn't catch that" or a wrong action | press the shortcut instead (`M`, `2`, `L`, `T`) | the scene does what we wanted in under 5 s |
| Grok slow or down | block `api.x.ai` or unset the key | after 8 s a cached line or "I couldn't reach Grok" | carry on, no apology speech | nothing freezes |
| Phone mic is bad | ask 3 questions in a loud hall | wrong transcript | set `MIC_SOURCE = "screen"` in `lib/voice/listen.ts` (05) and reload, then hold `V` (while the phone is paired and `MIC_SOURCE` is `"rocket"`, `V` uses the phone mic) | the laptop mic gets it right |

## Step 2b: demo phone prep
- [ ] 100% charged
- [ ] Do Not Disturb on
- [ ] Auto-lock off
- [ ] Volume at maximum
- [ ] `/rocket` opened and tapped once before judges arrive

## Step 3: who talks, who drives
Open with the problem line ("Rockets are one of the most-watched technologies in the world and one of the least understood.") and the motto, not the tech. One person talks and one drives; fill in the Who column of the README "Demo" table. Swap roles on run 2.
````

### `docs/hallway-test.md`

````md
# Hallway test (Saturday, not Sunday; before the 12:00 AM freeze)

Setup: `/?kiosk=1`, Kid level, the phone rocket charged and paired. The kiosk is built Sat 9 PM to 12 AM (Task 1), so run this test as soon as it exists; if it is late, run it on the plain `/` page first and repeat once with `?kiosk=1`. Hand it to 3 to 5 people, ideally someone with no space background. **Explain nothing.**

Afterwards ask exactly these two things:
1. "What does the booster do after it separates?"
2. "Why does it have legs?"

| Tester | Background | Minutes used | Answer 1 | Answer 2 | Understood the rocket's voice? | Where they got stuck |
|---|---|---|---|---|---|---|
| | | | | | | |

Also note: which mic heard them better, the phone or the laptop? Try the same 10 questions on each in the same spot; count the right answers. Set `MIC_SOURCE` in `lib/voice/listen.ts` (05) to the winner.

Tally: what most people could not answer or got stuck on is the biggest confusion. Fix it before the freeze. Then tune from what you saw: `IDLE_MS`, `OFFER_MS` (12), `QUICK_MS`, `SOFT_JOLT` (07), `HINT_GAP_MS` (07 coach), the gesture thresholds (11), `MIC_SOURCE` (05), `REPLAY_SPEED` (07), and keep 04's `CONVERSATION_IDLE_MS` at or below `IDLE_MS`.

Copy the real answers into the README "What people learned" table. Real observations only: no invented counts or percentages.
````

- [ ] **Step 1:** three timed runs. **Step 2:** the failure table. **Step 2b:** phone prep. **Step 3:** roles. **Step 4:** the hallway test.
- [ ] Acceptance: `docs/rehearsal.md` has three runs under 2:00; all five failures passed; the hallway table has at least 3 rows; the README table is filled from it.

## Task 4: Video + Devpost (Sun 5–7 AM)

**Files:** `docs/devpost.md` (Both).

````md
# Devpost submission

- Title: Teardown
- Tagline: Bringing rocket science down to Earth
- Video: {{TODO: unlisted YouTube link}}
- Repo: {{TODO: GitHub link}}
- Built with: Cursor, Grok, Next.js, three.js, Web Audio, device motion sensors
- Gallery: docs/screenshots/*

## Body
Copy these four README sections (What it is, The problem, Museum exhibit, How Grok is used). Cut them with the command below so the text cannot drift:
```bash
for h in "What it is" "The problem" "Museum exhibit" "How Grok is used"; do
  awk -v h="## $h" '$0==h{p=1;print;next} /^## /{p=0} p' README.md
done > docs/devpost-body.md
```
Run it **after** the README is final (`README_FINAL=1 npm test` passes), then paste `docs/devpost-body.md` into the Devpost story field. Replace any relative image path in it by an upload to the Devpost gallery. Devpost has no test: also run `grep -c '{{TODO' docs/devpost.md docs/devpost-body.md`, which must print 0 for both.

## Prizes (select every one we qualify for)
- [ ] SpaceXAI
- [ ] Hardware for Good (the phone's accelerometer and speaker count: organizers confirmed)
- [ ] Chalk: only if an eval report checking Grok's answers against the data exists. It is cut by default.

## Video
- [ ] Screen recording plus a second camera on someone flying the rocket
- [ ] Under 2:00; follows the README "Demo" table
- [ ] Captions on; no music unless CC0
- [ ] Uploaded as **Unlisted** (not Private)

## Timeline
| Time | Do |
|---|---|
| 5:00 AM | record the video |
| 6:15 AM | Devpost filled in |
| 6:45 AM | final check (below) |
| **7:00 AM** | **submit** |
| 7:00–8:00 AM | buffer only; Devpost closes at 8:00 |

## Final check
- [ ] `README_FINAL=1 npm test` passes; `npm run build` succeeds
- [ ] Repo, video and live links open in a logged-out window
- [ ] Footer line and model credit are in the README and on screen
- [ ] `git grep -lE 'xai-[A-Za-z0-9]{20,}'` prints nothing; `git check-ignore .env.local` prints the file name
- [ ] Prizes ticked
````

- [ ] **Step 1:** record and upload the video (unlisted). **Step 2:** fill Devpost from `docs/devpost.md`. **Step 3:** tick prizes. **Step 4:** submit by 7:00 AM.
- [ ] Acceptance: `docs/devpost-body.md` exists and contains the four headings (`grep -c '^## ' docs/devpost-body.md` → 4); the video plays logged out; Devpost shows "Submitted".

## Task 5: Proof screenshots (anytime Sun before submitting)

**Files:** `docs/proof-checklist.md`, `docs/screenshots/*` (Both).

````md
# Proof of Cursor use

| Item | File | Goes in |
|---|---|---|
| Neel's Cursor usage page, Oct 16–18 | docs/screenshots/cursor-usage-neel.png | README "Built with Cursor", Devpost gallery |
| Anders's Cursor usage page, Oct 16–18 | docs/screenshots/cursor-usage-anders.png | same |
| Grok Bot planning thread | docs/screenshots/grok-planning.png | same |
| `git log` with small commits | docs/screenshots/git-log.png | same |
| 3–4 Cursor Agent building features | docs/screenshots/cursor-agent-1.png … 4.png | same |

Commands:
```bash
git log -30 --format='%h %s'                                  # small commits, one task each
ls docs/screenshots/cursor-usage-neel.png docs/screenshots/cursor-usage-anders.png docs/screenshots/grok-planning.png docs/screenshots/git-log.png docs/screenshots/cursor-agent-1.png   # all five must exist
```
````

- [ ] Both teammates' usage pages for Oct 16–18 (a Cursor Team admin can export a CSV for both). **Redact** email addresses, billing details and anything else personal before saving a screenshot.
- [ ] The Grok Bot planning thread.
- [ ] `git log --oneline | head -30` showing small commits under the human author’s identity.
- [ ] Add them to the README and the Devpost gallery.
- [ ] Acceptance: the five named proof files exist (the `ls` above prints no error); the README "Built with Cursor" markers are replaced; every screenshot is redacted. Secret check (prints file names only): `git grep -lE 'xai-[A-Za-z0-9]{20,}'` prints nothing, and `git check-ignore .env.local` prints the file name (it is ignored).

## Interfaces consumed

| Interface | From | Used by |
|---|---|---|
| `useScene` actions `stopTour`, `stopReplay`, `resetMission`, `setExplode`, `selectPart`, `flyTo`, `setEnginesOut`, `setLevel`, `setLens`, `setImageUrl`, `startMission`, `startReplay`, `startTour`, `completeCheckpoint`, `markActivity`; state `lastActivityAt`, `replay`, `tour`, `mission` | 01 `lib/store.ts` | `exhibit.ts`, `ExhibitRuntime`, `AttractScreen` |
| `MISSIONS` | 01 `data/missions/index.ts` | `exhibit.ts`, `AttractScreen` |
| `sendToRocket` | 01 seam `lib/rocket/commands.ts` | `resetExhibit` (`stop`, `stopSay`, `stopListen`, `vibrate`) |
| `defaultMissionId`, `poseAt` | 07 `lib/replay.ts` | shortcuts M and L, attract loop, captions |
| `checkpointsFor` | 07 `lib/mission.ts` | `completeCurrentCheckpoint` |
| `ReplayClock({ silent? })`, `MissionSlot`, `ReplayHud` | 07 | `Stage` passes `silent`; `MissionSlot` mounts `ExhibitRuntime` |
| `isPairCode`, `newPairCode` | 11 `lib/rocket/protocol.ts` | `demoPairCode`, test X2 |
| `decideMove` | 11 `lib/rocket/moves.ts` | test X15 (the shake rule) |
| rocket motion calls `markActivity` (11 Task 5 Step 2) | 11 `useRocket` | attract wake |
| `readKiosk`, `readAgentKiosk`, `IMAGINE_RESET_EVENT` |05 `lib/voice/ask.ts`,04 `lib/agent/starters.ts`,09 `lib/imagine/client.ts` | drift D1–D2 pin event and kiosk agreement across lanes |
| `useEnginesUi.setOpen` | 08 `components/engines/enginesUi.ts` | `resetExhibit` (the panel auto-opens on engine changes; it must start closed for the next visitor) |
| `stopSpeaking()`, `cancelAgent()`, `AGENT_STARTERS`, `PushToTalk`, `AgentBox` | 05 / 04 (Anders) | reached only through `RESET_EVENT` listeners in Anders's files; this spec defines no example-question list |
| `requestImagine`, audio manifest cache | 09, 05 | demo cache behavior (no change) |
| `liftoffTW`, `liftoffThrustKN`, parts `vehicle` | 01 `lib/engines.ts`, `data/parts/falcon9.json` | README test R4 |
| `.kiosk`, `.display--sentence`, `.reveal`, `.attract`, `.btn*`, `.card`, `.caption`, `.overlay*`, `.dock--bottom`, `.scrim-bottom`, `--z-overlay`, `--gutter`, `--sp-6` | `docs/specs/00-theme.spec.md` | components |

## Interfaces produced

| Interface | File | Consumed by |
|---|---|---|
| `IDLE_MS`, `BUSY_MAX_MS`, `CLOCK_SKEW_MS`, `OFFER_MS`, `ATTRACT_RESTART_MS`, `WAKE_GUARD_MS`, `DEMO_CODE_STORAGE`, `RESET_EVENT` | `lib/viewer/exhibit.ts` | tests, README |
| `parseFlags`, `demoPairCode(flags, storage, rand?)`, `idleAction`, `nextBusyAt`, `shouldWakeByRocket`, `wakesOnPointer`, `attractNeedsStart`, `resetExhibit`, `idleTick`, `handlePointer`, `handleKey`, `handleWheel`, `useExhibit`, `shortcutFor`, `runShortcut`, `completeCurrentCheckpoint`, `SHORTCUT_HELP` | `lib/viewer/exhibit.ts` | `ExhibitRuntime`, `AttractScreen`, `HelpOverlay`, `Stage`, `MissionSlot`, 11 `PairRocket` (`demoPairCode`) |
| `RESET_EVENT` (Anders's copy, 05 Task 3) | `lib/voice/flags.ts` | 05 `PushToTalk`, 04 `AgentBox` |
| `window` event `"teardown:exhibit-reset"` | dispatched by `resetExhibit` | Anders's slots clear speech, caption, transcript, history, picture |
| `body.kiosk { touch-action: pan-x pan-y; }` | `app/globals.css` | kiosk page |
| README section headings (12, in order) | `README.md` | test R1, `docs/devpost.md` extract |

## Plan deltas

| Plan said | Spec does | Why |
|---|---|---|
| Idle reset lists `stopTour()`, `endMission()`, `stopReplay()` | `stopTour()`, `stopReplay()` (resets the mission), `resetMission()` | 01 contract changes: `endMission` keeps results and stars; `resetMission` clears them. Needed so a shake after the reset cannot restart a mission. |
| "stop phone sounds" | `stop`, `stopSay`, `stopListen`, `vibrate [0]` to the phone; the laptop voice is stopped by Anders's `RESET_EVENT` listener (`stopSpeaking`) | 01 adds `stopSay`; lanes cannot import each other |
| Idle = `performance.now() - lastActivityAt > IDLE_MS` | plus busy time (`lastBusyAt`) with a hard cap of `BUSY_MAX_MS`, and a future timestamp is re-anchored to now | a 64 s replay, a mission waiting at a checkpoint and a clock mix-up must not reset under a visitor |
| Hands-free replay "looping silently" | silent loop with captions | theme 6.1 row says narration still plays; plan wins |
| "no accidental pinch-zoom of the page" | ctrl+wheel and Safari gestures blocked, `body.kiosk { touch-action: pan-x pan-y }`; viewport meta untouched | theme section 6: do not disable pinch-zoom in the viewport |
| "keeps the pairing code fixed" | one random code remembered in browser storage in demo mode | a public fixed string lets a second laptop or a stranger join the channel; the effect (phone stays paired between judges) is the same |
| "skips loading spinners where possible" | no hiding; cache-first rules (05, 09) already make spinners rare in demo mode | hiding the only loading feedback is worse for a kid |
| "prefers cached audio and Imagine images" | no new code: 05 and 09 are cache-first already | |
| Task 2 owner "Both" | README.md is Anders's file; Neel writes three sections | 00-index ownership table |
| Text box hidden in kiosk | 04's `AgentBox` hides it when `body.kiosk` and shows the `AGENT_STARTERS` buttons; 12 sets the class | theme section 7 (Voice / Ask) |
| "hide anything that needs a keyboard" | the `?` overlay is hidden; the operator backup keys stay live | they are the plan's own backup if voice or the rocket fails |
| Rocket pickup "offers Fly the mission" | the offer is a card; ignoring it leaves plain explore mode | plan |
| `MissionSlot` hides the replay readout on attract (07's note) | hides it while attract or the offer shows (`phase !== "off"`) | the offer card has its own "Fly the mission" button |
| Demo script "under 2:00" with the guided mission in 45 s | README table re-budgeted: guided mission 70 s, total 115 s | the real mission clock is about 64 s at `REPLAY_SPEED` 8 before the six moves; the plan's 45 s cannot be met. The 70 s mission budget is provisional: all three rehearsals must complete in 115 s; if not, shorten another beat or explicitly tune 07's demo speed and re-time. |
| Files the plan does not list | `lib/__tests__/readme.test.ts`, `lib/__tests__/exhibit-drift.test.ts`, `docs/rehearsal.md`, `docs/hallway-test.md`, `docs/devpost.md`, `docs/proof-checklist.md`, and the `RESET_EVENT` coupling | tests and checklists for people tasks; the event is how the reset reaches Anders's local state |
| Attract screen "Pick up the rocket to fly" | always shown | plan |
| Task 3: three failures | five rows (adds Grok slow or down, and phone mic) | review focus 3 and plan Step 4 |
| Task 3 Step 4: hallway test in `?kiosk=1` | same, with a fallback to plain `/` if the kiosk is late | the kiosk is built Sat 9 PM to 12 AM, the freeze is 12 AM |
| README "long buzz" | marked Android only | iPhone Safari has no vibration |
| Theme 6.1: idle replay loop is a static pose per event under reduced motion ("12") | built by 07's reduced-motion `ReplayClock` and 03's `CameraRig` | 12 passes `silent`; 07 advances captions at event boundaries and 03 cuts instead of sweeping. Verify with the OS preference enabled. |
| Activity = touch, push-to-talk, rocket motion | also keys and wheel/pinch on the model | a visitor zooming the model for a minute is using it |

## Open questions

1. **`cancelAgent` on reset.** 04 says the reset must call `cancelAgent()`; 12 cannot import it (D9), so `PushToTalk` and `AgentBox` must do it in their `RESET_EVENT` listeners (edits table). If either is missed, a late Grok answer speaks to the next visitor.
2. **Clock.** 12 fixes `markActivity` as `performance.now()` (D8); 05 and 11 already comply. Anyone adding a caller must too (X5 only limits the damage).
3. **Silent attract** uses 07's `ReplayClock` `silent` prop. If 07's final version drops it, add a check of `useExhibit.getState().phase === "attract"` at its `speakLine` call.
4. **Event name coupling settled.** `teardown:exhibit-reset` is recorded in 01's lifecycle contract. Drift tests compare the 04/05/09/12 consumers; use this exact name.
5. **README ownership settled.** Anders owns README.md; Neel hands over the three assigned sections. Both rehearse and verify their evidence.
6. **Cut list.** If Imagine, the second mission or the engine-out simulator is cut, delete its README bullet and demo row; R4 and R5 are written to pass then.
