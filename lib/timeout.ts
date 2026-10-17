// lib/timeout.ts — one timeout helper for every xAI call (04 Task 2). Owner: Anders.

// 00-index Global Constraints: text and voice calls to xAI abort after 8,000 ms.
export const TEXT_TIMEOUT_MS = 8000;

/** Resolves or rejects like `p`, or rejects with Error("timeout") after `ms`. Always clears its timer. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
