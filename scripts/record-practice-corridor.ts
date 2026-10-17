// scripts/record-practice-corridor.ts — record the PRACTICE corridor.
// Flies CLASSROOM_ORBIT_PROFILE through stepFlight on the classroom rocket
// and samples altitude, downrange, speed, and pitch. This is a simulated
// practice reference, not historical, and it is not a Sentinel-6 path.
//
//   npx tsx scripts/record-practice-corridor.ts --write
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CLASSROOM_LAUNCH } from "../lib/flight/classroom";
import { EARTH_RADIUS_M, createFlight, stepFlight, type FlightBody } from "../lib/flight.helpers";
import { CLASSROOM_ORBIT_PROFILE, inputAt } from "../lib/flight/profiles";

/** Seconds between stored rows. stepFlight still runs at 1/60 s. */
export const PRACTICE_CORRIDOR_SAMPLE_S = 2;

const PRACTICE_FILE = resolve("data/missions/practice.json");

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export interface PracticeCorridorSample {
  t: number;
  altKm: number;
  downrangeKm: number;
  velMs: number;
  pitchDeg: number;
  source: "simulated-practice-reference";
  quality: "simulated-practice";
}

function measure(state: FlightBody): PracticeCorridorSample {
  const altM = Math.hypot(state.x, state.y) - EARTH_RADIUS_M;
  const downrangeM = Math.atan2(state.x, state.y) * EARTH_RADIUS_M;
  return {
    t: round(state.simulatedTimeS, 3),
    altKm: round(altM / 1000, 4),
    downrangeKm: round(downrangeM / 1000, 4),
    velMs: round(Math.hypot(state.vx, state.vy), 2),
    pitchDeg: round((state.pitchRad * 180) / Math.PI, 3),
    source: "simulated-practice-reference",
    quality: "simulated-practice",
  };
}

/** Nominal classroom orbit, sampled. The last row is the orbit outcome state. */
export function recordPracticeCorridor(limitS = 900): {
  samples: PracticeCorridorSample[];
  outcomeKind: string | null;
  simulatedTimeS: number;
} {
  let state = createFlight(CLASSROOM_LAUNCH);
  const samples = [measure(state)];
  let next = PRACTICE_CORRIDOR_SAMPLE_S;
  let guard = 0;
  while (!state.outcome && state.simulatedTimeS < limitS && guard < limitS * 60 + 5) {
    guard += 1;
    state = stepFlight(state, inputAt(CLASSROOM_ORBIT_PROFILE, state.simulatedTimeS), 1 / 60);
    if (state.simulatedTimeS + 1e-6 >= next) {
      samples.push(measure(state));
      while (next <= state.simulatedTimeS + 1e-6) next += PRACTICE_CORRIDOR_SAMPLE_S;
    }
  }
  const last = measure(state);
  if (samples[samples.length - 1]?.t !== last.t) samples.push(last);
  return {
    samples,
    outcomeKind: state.outcome?.kind ?? null,
    simulatedTimeS: state.simulatedTimeS,
  };
}

export function practiceCorridorReference() {
  const recorded = recordPracticeCorridor();
  if (recorded.outcomeKind !== "orbit") {
    throw new Error(`classroom profile did not reach orbit (${recorded.outcomeKind ?? "no outcome"})`);
  }
  return {
    id: "practice-corridor",
    label: "PRACTICE corridor. Simulated practice reference, not historical. Not Sentinel-6.",
    interpolated: true,
    method:
      "Flew CLASSROOM_ORBIT_PROFILE through stepFlight on the classroom scenario and recorded altitude, downrange, speed, and commanded pitch every 2 seconds until the orbit outcome. Simulated practice reference, not historical.",
    samples: recorded.samples,
  };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const reference = practiceCorridorReference();
  if (process.argv.includes("--write")) {
    const practice = JSON.parse(readFileSync(PRACTICE_FILE, "utf8")) as { reference?: unknown };
    practice.reference = reference;
    writeFileSync(PRACTICE_FILE, `${JSON.stringify(practice, null, 2)}\n`);
    process.stdout.write(`wrote ${reference.samples.length} PRACTICE corridor samples to ${PRACTICE_FILE}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(reference, null, 2)}\n`);
  }
}
