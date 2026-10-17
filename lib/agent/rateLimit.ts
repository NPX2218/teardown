// lib/agent/rateLimit.ts — in-memory request limit (04 Task 3). Owner: Anders.

export const AGENT_RATE_LIMIT = 60;
export const AGENT_RATE_WINDOW_MS = 60_000;

/** Sliding-window limiter. `take(now)` → true if the request may go ahead. */
export function makeRateLimiter(limit: number, windowMs: number): { take(now: number): boolean } {
  const stamps: number[] = [];
  return {
    take(now: number): boolean {
      while (stamps.length > 0 && now - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length >= limit) return false;
      stamps.push(now);
      return true;
    },
  };
}
