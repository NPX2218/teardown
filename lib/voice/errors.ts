// lib/voice/errors.ts — listen failures the phone and the laptop share. Owner: Anders.

export const LISTEN_ERROR_REASONS = ["denied", "no-speech", "unsupported", "network"] as const;

export type ListenErrorReason = (typeof LISTEN_ERROR_REASONS)[number];

export function asListenError(e: unknown): ListenErrorReason {
  return e === "denied" || e === "no-speech" || e === "unsupported" || e === "network" ? e : "network";
}
