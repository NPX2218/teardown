// lib/voice/sound-ids.ts — SoundId list from the 01 contract. Owner: Anders.
// Lives here until lib/types.ts lands. The names must stay identical to that union.

export const SOUND_IDS = [
  "countdown",
  "liftoff_rumble",
  "maxq_rumble",
  "separation_clunk",
  "fairing_pop",
  "entry_burn",
  "landing_thud",
  "success",
  "music_launch",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export const isSoundId = (x: unknown): x is SoundId =>
  (SOUND_IDS as readonly unknown[]).includes(x);
