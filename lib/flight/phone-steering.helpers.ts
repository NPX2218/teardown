// Phone steering response is measured in wall time, independently of flight warp.
export interface PhoneSteering {
  pitchRad: number;
  yawRad: number;
}

/**
 * The fixed-direction / abrupt-turn report on 2026-10-17 requested gentle curves
 * in every direction. Two degrees reject ordinary upright hand jitter.
 * Sixty degrees reaches the full command without requiring a horizontal shell.
 * Squaring the normalized lean gives small movements finer control.
 * A single twelve-degree/second vector budget avoids faster diagonal steering.
 * A delayed sample spends at most 100 ms so stale frames cannot jump the target.
 * These are interaction tuning values from that report, not vehicle specifications.
 */
export const PHONE_STEERING = {
  deadzoneRad: 2 * Math.PI / 180,
  maxLeanRad: 60 * Math.PI / 180,
  slewRadPerS: 12 * Math.PI / 180,
  maxSampleDeltaS: 0.1,
} as const;

function finite(steering: PhoneSteering): boolean {
  return Number.isFinite(steering.pitchRad) && Number.isFinite(steering.yawRad);
}

/** Radial shaping preserves the direction of cardinal and diagonal leans. */
export function shapePhoneSteering(raw: PhoneSteering): PhoneSteering {
  if (!finite(raw)) return { pitchRad: 0, yawRad: 0 };
  const magnitude = Math.hypot(raw.pitchRad, raw.yawRad);
  if (magnitude <= PHONE_STEERING.deadzoneRad) return { pitchRad: 0, yawRad: 0 };
  const normalized = Math.min(1, (magnitude - PHONE_STEERING.deadzoneRad) / (PHONE_STEERING.maxLeanRad - PHONE_STEERING.deadzoneRad));
  const scale = PHONE_STEERING.maxLeanRad * normalized * normalized / magnitude;
  return { pitchRad: raw.pitchRad * scale, yawRad: raw.yawRad * scale };
}

/** Both axes spend the same wall-time turn budget, including when reversing. */
export function stepPhoneSteering(previous: PhoneSteering, raw: PhoneSteering, wallDeltaS: number): PhoneSteering {
  if (!finite(raw) || !Number.isFinite(wallDeltaS) || wallDeltaS <= 0) return previous;
  const target = shapePhoneSteering(raw);
  const pitch = target.pitchRad - previous.pitchRad;
  const yaw = target.yawRad - previous.yawRad;
  const distance = Math.hypot(pitch, yaw);
  const budget = PHONE_STEERING.slewRadPerS * Math.min(wallDeltaS, PHONE_STEERING.maxSampleDeltaS);
  if (distance <= budget) return target;
  return {
    pitchRad: previous.pitchRad + pitch * budget / distance,
    yawRad: previous.yawRad + yaw * budget / distance,
  };
}
