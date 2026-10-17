// lib/flight/profiles.ts — recorded classroom inputs. Owner: Neel.
// These are open-loop pitch and throttle schedules for the gameplay-tuning
// rockets in lib/flight/classroom.ts. They are not an in-game autopilot and
// they are not a historical trajectory. The game never applies them unless a
// person moves the same public controls.
import type { FlightInput, FlightScenario } from "@/lib/types";
import { createFlight, stepFlight, type FlightBody } from "@/lib/flight.helpers";

export interface ProfileSegment {
  /** This command applies until simulated time reaches untilS. */
  untilS: number;
  pitchRad: number;
  throttle: number;
}

/** Reaches the classroom orbit goal. Recorded from public pitch and throttle commands. */
export const CLASSROOM_ORBIT_PROFILE: readonly ProfileSegment[] = [
  { untilS: 25, pitchRad: 0, throttle: 1 },
  { untilS: 30, pitchRad: 0.0315, throttle: 1 },
  { untilS: 35, pitchRad: 0.0579, throttle: 1 },
  { untilS: 40, pitchRad: 0.0901, throttle: 1 },
  { untilS: 45, pitchRad: 0.1285, throttle: 1 },
  { untilS: 50, pitchRad: 0.1735, throttle: 1 },
  { untilS: 55, pitchRad: 0.2256, throttle: 1 },
  { untilS: 60, pitchRad: 0.2855, throttle: 1 },
  { untilS: 65, pitchRad: 0.3537, throttle: 1 },
  { untilS: 70, pitchRad: 0.4309, throttle: 1 },
  { untilS: 75, pitchRad: 0.5176, throttle: 1 },
  { untilS: 80, pitchRad: 0.6143, throttle: 1 },
  { untilS: 85, pitchRad: 0.7207, throttle: 0 },
  { untilS: 90, pitchRad: 0.8273, throttle: 0 },
  { untilS: 95, pitchRad: 0.9309, throttle: 0 },
  { untilS: 100, pitchRad: 1.0316, throttle: 0 },
  { untilS: 105, pitchRad: 1.1292, throttle: 0 },
  { untilS: 110, pitchRad: 1.224, throttle: 0 },
  { untilS: 115, pitchRad: 1.3157, throttle: 0 },
  { untilS: 120, pitchRad: 1.4046, throttle: 0 },
  { untilS: 255, pitchRad: 1.45, throttle: 0 },
  { untilS: 285, pitchRad: 1.5708, throttle: 1 },
  { untilS: 372, pitchRad: 1.45, throttle: 1 },
  { untilS: 387, pitchRad: 1.5708, throttle: 0 },
  { untilS: 1e9, pitchRad: 1.45, throttle: 0 },
];

/** Straight up on the short hop. The rocket leaves the pad and hits the ground. */
export const HOP_CRASH_PROFILE: readonly ProfileSegment[] = [
  { untilS: 1e9, pitchRad: 0, throttle: 1 },
];

export function inputAt(profile: readonly ProfileSegment[], simulatedTimeS: number): FlightInput {
  const segment = profile.find((item) => simulatedTimeS < item.untilS) ?? profile[profile.length - 1];
  return { pitchRad: segment?.pitchRad ?? 0, throttle: segment?.throttle ?? 0 };
}

/** Replays a profile through stepFlight. This is the same helper the controls use, not a second physics engine. */
export function flyProfile(scenario: FlightScenario, profile: readonly ProfileSegment[], limitS = 900): FlightBody {
  let state = createFlight(scenario);
  let guard = 0;
  while (!state.outcome && state.simulatedTimeS < limitS && guard < limitS * 60 + 5) {
    guard += 1;
    state = stepFlight(state, inputAt(profile, state.simulatedTimeS), 1 / 60);
  }
  return state;
}
