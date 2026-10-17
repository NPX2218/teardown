// Run: npx tsx scripts/check-sounds.ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SOUND_IDS } from "../lib/voice/sound-ids";
import { SOUND_SPECS, checkSounds, soundFile } from "../lib/voice/sounds-check";

const DIR = join(process.cwd(), "public", "sounds");

const files: Record<string, number> = {};
if (existsSync(DIR)) for (const f of readdirSync(DIR)) files[f] = statSync(join(DIR, f)).size;
const creditsPath = join(DIR, "CREDITS.md");
const credits = existsSync(creditsPath) ? readFileSync(creditsPath, "utf8") : "";

const errors = checkSounds(files, credits);
if (!existsSync(creditsPath)) errors.push("missing file: public/sounds/CREDITS.md");

function probeSeconds(path: string): number | null {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], { encoding: "utf8" });
    const n = Number.parseFloat(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

let probed = false;
for (const id of SOUND_IDS) {
  const name = soundFile(id);
  if (files[name] === undefined) continue;
  const secs = probeSeconds(join(DIR, name));
  if (secs === null) continue;
  probed = true;
  if (secs > SOUND_SPECS[id].maxSeconds + 0.1) errors.push(`too long: ${name} is ${secs.toFixed(1)} s, cap ${SOUND_SPECS[id].maxSeconds} s`);
}

if (!probed) console.log("(ffprobe not found or no files: duration check skipped)");
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  process.exit(1);
}
console.log(`OK: ${SOUND_IDS.length} sounds present, credited, CC0/public domain.`);
