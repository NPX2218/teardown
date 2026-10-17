// lib/voice/speak.ts — speakLine (01 Task 5 PLACEHOLDER; 05 Task 1 replaces the body, same signature). Owner: Anders.
// Placeholder: browser speechSynthesis on the laptop for every `via`. Never rejects.

export interface SpeakOptions {
  via?: "screen" | "rocket"; // rocket = the phone inside the model rocket (05); placeholder plays on the laptop
  queue?: boolean; // true = wait for the current line instead of cutting it off (13 uses this)
}

// Safety cap so a stuck browser voice never hangs the tour or the mission:
// ~55 ms per character (about 180 spoken words a minute) + 1.5 s slack for this browser-voice placeholder.
// 05 retains these exported constants but gives phone playback its separate 90 ms/character + startup/ack budget.
export const SPEAK_BASE_MS = 1500;
export const SPEAK_MS_PER_CHAR = 55;

let generation = 0; // bumped by every non-queued call; stale queued lines skip
let tail: Promise<void> = Promise.resolve();
let finishCurrent: (() => void) | null = null;

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function play(text: string, gen: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (gen !== generation || !canSpeak() || text.trim() === "") {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (finishCurrent === done) finishCurrent = null;
      resolve();
    };
    const timer = setTimeout(() => {
      // Cap hit: stop the stuck utterance before releasing the queue, but only if it is still the
      // current line (a newer line has already cancelled it and must not be cut off).
      if (finishCurrent === done && canSpeak()) window.speechSynthesis.cancel();
      done();
    }, SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * text.length);
    const u = new SpeechSynthesisUtterance(text);
    u.onend = done;
    u.onerror = done;
    finishCurrent = done;
    window.speechSynthesis.speak(u);
  });
}

/**
 * Speaks one line. Resolves when it ends, errors, is cut off, or hits the time cap (which also stops it).
 * Ordering contract (05 keeps it):
 *  - non-queued: cuts off the current line AND drops every queued line not yet started;
 *  - queue: true: plays after the line that is current or queued at call time, unless a later
 *    non-queued call drops it.
 */
export function speakLine(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (opts.queue) {
    const gen = generation;
    const p = tail.then(() => play(text, gen));
    tail = p;
    return p;
  }
  generation += 1;
  const gen = generation;
  if (canSpeak()) window.speechSynthesis.cancel();
  finishCurrent?.(); // resolve the line we just cut off
  const p = play(text, gen);
  tail = p;
  return p;
}
