// lib/voice/sounds-check.ts — CC0 sound file check (05 Task 4). Owner: Anders.
import { SOUND_IDS, type SoundId } from "./sound-ids";

export interface SoundSpec { loop: boolean; maxSeconds: number; maxBytes: number }
const EFFECT: Pick<SoundSpec, "maxSeconds" | "maxBytes"> = { maxSeconds: 4, maxBytes: 150_000 };
export const SOUND_SPECS: Record<SoundId, SoundSpec> = {
  countdown: { loop: true, ...EFFECT },
  liftoff_rumble: { loop: true, ...EFFECT },
  maxq_rumble: { loop: true, ...EFFECT },
  separation_clunk: { loop: false, ...EFFECT },
  fairing_pop: { loop: false, ...EFFECT },
  entry_burn: { loop: false, ...EFFECT },
  landing_thud: { loop: false, ...EFFECT },
  success: { loop: false, ...EFFECT },
  music_launch: { loop: true, maxSeconds: 30, maxBytes: 800_000 },
};

export const soundFile = (id: SoundId): string => `${id}.mp3`;

const OK_LICENSE = /^(cc0|public domain|nasa)\b/i;

interface CreditRow { file: string; url: string; license: string }

function parseCredits(credits: string): CreditRow[] {
  const rows: CreditRow[] = [];
  for (const line of credits.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 3) continue;
    if (/^:?-{3,}:?$/.test(cells[0])) continue;
    const file = cells[0].replace(/`/g, "");
    if (file.toLowerCase() === "file") continue;
    rows.push({ file, url: cells[1], license: cells[2] });
  }
  return rows;
}

/** files: file name → size in bytes. Returns error strings; [] means OK. */
export function checkSounds(files: Record<string, number>, credits: string): string[] {
  const errors: string[] = [];
  const rows = parseCredits(credits);
  for (const id of SOUND_IDS) {
    const name = soundFile(id);
    const size = files[name];
    if (size === undefined) errors.push(`missing file: public/sounds/${name}`);
    else if (size > SOUND_SPECS[id].maxBytes) {
      errors.push(`too big: ${name} is ${size} bytes, cap ${SOUND_SPECS[id].maxBytes}`);
    }
    const row = rows.find((r) => r.file === name);
    if (!row) errors.push(`not listed in CREDITS.md: ${name}`);
    else {
      if (!OK_LICENSE.test(row.license)) errors.push(`bad license for ${name}: "${row.license}" (need CC0, Public Domain or NASA)`);
      if (!/^https?:\/\/\S+$/.test(row.url) || /REPLACE/i.test(row.url)) errors.push(`no real source URL for ${name} in CREDITS.md`);
    }
  }
  return errors;
}
