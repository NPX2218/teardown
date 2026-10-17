// Phone steering response is measured in wall time, independently of flight warp.
import type { Quat } from "@/lib/types";
import { quatConj, quatMul, quatNormalize } from "@/lib/rocket/orient";
import { quatSlerp } from "@/lib/flight/quaternion.helpers";
/**
 * The fixed-direction / abrupt-turn report on 2026-10-17 requested gentle curves
 * in every direction. Two degrees reject ordinary upright hand jitter.
 * Sixty degrees ends the fine-control band; full 180-degree turns stay reachable.
 * Squaring the normalized small angle gives hand movements finer control.
 * A shared twelve-degree/second angular budget includes pointing and twist.
 * A delayed sample spends at most 100 ms so stale frames cannot jump the target.
 * These are interaction tuning values from that report, not vehicle specifications.
 */
export const PHONE_STEERING = {
  deadzoneRad: 2 * Math.PI / 180,
  fineControlRad: 60 * Math.PI / 180,
  slewRadPerS: 12 * Math.PI / 180,
  maxSampleDeltaS: 0.1,
} as const;

/**
 * The October 17 handset test requested reversal of every mission steering axis.
 * Map Explore's screen-normal +Z into flight downrange +X, then invert the
 * complete calibrated rotation so pitch, lateral pointing, and twist agree.
 * Conjugating the whole pose also handles combined turns and inverted flight.
 * Explore keeps its original orientation; this mapping belongs to flight only.
 */
export function phoneToFlightAttitude(orientation: Quat): Quat {
  const remap: Quat = [Math.SQRT1_2, 0, Math.SQRT1_2, 0];
  return quatConj(quatNormalize(quatMul(quatMul(remap, orientation), quatConj(remap))));
}

/**
 * October 17 full-pointing follow-up: the previous 60-degree cone blocked inverted flight.
 * Retain fine control within that band, but keep every larger orientation reachable.
 * The quaternion's shortest axis-angle includes twist as well as pointing.
 * All axes therefore share one response and cannot gain speed on a diagonal.
 * Quaternion signs describe the same pose and are aligned before interpolation.
 */
export function shapePhoneAttitude(raw: Quat): Quat {
  let q = quatNormalize(raw);
  if (q[0] < 0) q = q.map((value) => -value) as Quat;
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, q[0])));
  if (angle <= PHONE_STEERING.deadzoneRad) return [1, 0, 0, 0];
  const targetAngle = angle <= PHONE_STEERING.fineControlRad
    ? PHONE_STEERING.fineControlRad * ((angle - PHONE_STEERING.deadzoneRad) / (PHONE_STEERING.fineControlRad - PHONE_STEERING.deadzoneRad)) ** 2
    : angle;
  return quatSlerp([1, 0, 0, 0], q, targetAngle / angle);
}

/** Gentle complete orientation, measured in real time even while the simulation is accelerated. */
export function stepPhoneAttitude(previous: Quat, raw: Quat, wallDeltaS: number): Quat {
  if (!Number.isFinite(wallDeltaS) || wallDeltaS <= 0) return previous;
  const target = shapePhoneAttitude(raw);
  const dot = Math.abs(previous.reduce((sum, value, i) => sum + value * target[i], 0));
  const distance = 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
  if (distance <= Number.EPSILON) return target;
  const budget = PHONE_STEERING.slewRadPerS * Math.min(wallDeltaS, PHONE_STEERING.maxSampleDeltaS);
  return quatSlerp(previous, target, Math.min(1, budget / distance));
}
