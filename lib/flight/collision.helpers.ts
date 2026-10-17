// Shared solid-body collision contract for the 2026-10-17 launch collision report.
import { vehiclePoseOffsets } from "@/lib/flight/vehicle-pose.helpers";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { FALCON_HEIGHT_M } from "@/components/flight/fitFalcon";
import { FALCON_M } from "@/components/flight/fx/falcon";
import { quatConj, quatMul } from "@/lib/rocket/orient";
import { quatRotate } from "@/lib/flight/quaternion.helpers";
import type { Quat, Vec3 } from "@/lib/types";

export interface CollisionCapsule { a: Vec3; b: Vec3; radiusM: number }
interface ObstacleBase { id: string; centerM: Vec3; rotationRad?: Vec3 }
export type CollisionObstacle =
  | (ObstacleBase & { kind: "box"; sizeM: Vec3 })
  | (ObstacleBase & { kind: "cylinder"; radiusM: number; heightM: number })
  | (ObstacleBase & { kind: "sphere"; radiusM: number });
export interface CollisionSphere { centerM: Vec3; radiusM: number }
export interface CollisionContact { kind: "ground" | "structure"; obstacleId?: string; fraction: number; pointM: Vec3 }

/**
 * Collision report 2026-10-17: contacts resolve to ten micrometres, far below
 * the 0.6 m visible bell clearance and widened structure clearance.
 * This tolerance terminates conservative advancement near a touching surface.
 * It is a geometry tolerance, never a launch-time or altitude grace period.
 * Cylinder minimization takes 48 ternary intervals: (2/3)^48 of a 70 m axis
 * is below this tolerance, while preserving curved tank corners.
 */
const CONTACT_TOLERANCE_M = 1e-5;
const CYLINDER_MINIMIZATION_STEPS = 48;
/**
 * The 2026-10-17 micro-gap regression sweeps two kilometres past a wall.
 * Eighty ternary intervals resolve its time minimum below floating precision;
 * sixty-four bisections locate the first contact without stepping through a
 * tiny parallel clearance millions of times. These fixed loops bound CPU for
 * unchanged-orientation sweeps while retaining the same geometry tolerance.
 */
const SWEEP_MINIMIZATION_STEPS = 80;
const CONTACT_BISECTION_STEPS = 64;

const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3): number => Math.hypot(...a);
const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
interface Distance { clearanceM: number; pointM: Vec3 }

function closestSegmentPoint(a: Vec3, b: Vec3, p: Vec3): Vec3 {
  const delta = sub(b, a);
  const squared = dot(delta, delta);
  return lerp(a, b, squared > 0 ? clamp(dot(sub(p, a), delta) / squared) : 0);
}

function sphereDistance(capsule: CollisionCapsule, sphere: CollisionSphere): Distance {
  const axis = closestSegmentPoint(capsule.a, capsule.b, sphere.centerM);
  const outward = sub(axis, sphere.centerM);
  const radius = length(outward);
  return {
    clearanceM: radius - sphere.radiusM - capsule.radiusM,
    pointM: add(sphere.centerM, radius > 0 ? scale(outward, sphere.radiusM / radius) : [0, sphere.radiusM, 0]),
  };
}

function obstacleRotation(rotation: Vec3 = [0, 0, 0]): Quat {
  const axis = (index: number): Quat => {
    const q: Quat = [Math.cos(rotation[index] / 2), 0, 0, 0];
    q[index + 1] = Math.sin(rotation[index] / 2);
    return q;
  };
  // Three Euler XYZ applies Rz first, then Ry, then Rx.
  return quatMul(quatMul(axis(0), axis(1)), axis(2));
}

function boxDistance(a: Vec3, b: Vec3, size: Vec3): { distanceM: number; pointM: Vec3 } {
  const half = scale(size, 0.5);
  const delta = sub(b, a);
  const knots = [0, 1];
  for (let i = 0; i < 3; i += 1) if (delta[i] !== 0) {
    for (const face of [-half[i], half[i]]) {
      const t = (face - a[i]) / delta[i];
      if (t > 0 && t < 1) knots.push(t);
    }
  }
  knots.sort((x, y) => x - y);
  let bestSquared = Infinity;
  let bestPoint: Vec3 = [0, 0, 0];
  const evaluate = (t: number) => {
    const p = lerp(a, b, t);
    const q = p.map((v, i) => clamp(v, -half[i], half[i])) as Vec3;
    const delta = sub(p, q);
    const squared = dot(delta, delta);
    if (squared < bestSquared) { bestSquared = squared; bestPoint = q; }
  };
  for (let k = 0; k + 1 < knots.length; k += 1) {
    const lo = knots[k];
    const hi = knots[k + 1];
    const middle = lerp(a, b, (lo + hi) / 2);
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(middle[i]) <= half[i]) continue;
      const face = middle[i] < 0 ? -half[i] : half[i];
      numerator += delta[i] * (a[i] - face);
      denominator += delta[i] * delta[i];
    }
    evaluate(lo);
    evaluate(hi);
    if (denominator > 0) evaluate(clamp(-numerator / denominator, lo, hi));
  }
  return { distanceM: Math.sqrt(bestSquared), pointM: bestPoint };
}

function cylinderDistance(a: Vec3, b: Vec3, radius: number, height: number): { distanceM: number; pointM: Vec3 } {
  const closest = (p: Vec3): Vec3 => {
    const radial = Math.hypot(p[0], p[2]);
    const factor = radial > radius ? radius / radial : 1;
    return [p[0] * factor, clamp(p[1], -height / 2, height / 2), p[2] * factor];
  };
  const evaluate = (t: number) => {
    const p = lerp(a, b, t);
    const q = closest(p);
    const delta = sub(p, q);
    return { squared: dot(delta, delta), pointM: q };
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < CYLINDER_MINIMIZATION_STEPS; i += 1) {
    const left = lo + (hi - lo) / 3;
    const right = hi - (hi - lo) / 3;
    if (evaluate(left).squared <= evaluate(right).squared) hi = right;
    else lo = left;
  }
  const candidates = [evaluate(0), evaluate(1), evaluate((lo + hi) / 2)];
  const best = candidates.reduce((a, b) => a.squared < b.squared ? a : b);
  return { distanceM: Math.sqrt(best.squared), pointM: best.pointM };
}

function obstacleDistance(capsule: CollisionCapsule, obstacle: CollisionObstacle): Distance {
  if (obstacle.kind === "sphere") return sphereDistance(capsule, obstacle);
  const rotation = obstacleRotation(obstacle.rotationRad);
  const inverse = quatConj(rotation);
  const a = quatRotate(inverse, sub(capsule.a, obstacle.centerM));
  const b = quatRotate(inverse, sub(capsule.b, obstacle.centerM));
  const distance = obstacle.kind === "box"
    ? boxDistance(a, b, obstacle.sizeM)
    : cylinderDistance(a, b, obstacle.radiusM, obstacle.heightM);
  return { clearanceM: distance.distanceM - capsule.radiusM, pointM: add(obstacle.centerM, quatRotate(rotation, distance.pointM)) };
}

function sweptBounds(before: CollisionCapsule, after: CollisionCapsule, margin: number): { lo: Vec3; hi: Vec3 } {
  const radius = Math.max(before.radiusM, after.radiusM) + margin;
  const points = [before.a, before.b, after.a, after.b];
  return {
    lo: [0, 1, 2].map(i => Math.min(...points.map(p => p[i])) - radius) as Vec3,
    hi: [0, 1, 2].map(i => Math.max(...points.map(p => p[i])) + radius) as Vec3,
  };
}

function boundsDistance(bounds: ReturnType<typeof sweptBounds>, p: Vec3): number {
  return Math.hypot(...p.map((v, i) => v - clamp(v, bounds.lo[i], bounds.hi[i])));
}

function obstacleCanMeet(bounds: ReturnType<typeof sweptBounds>, start: CollisionCapsule, end: CollisionCapsule, margin: number, obstacle: CollisionObstacle): boolean {
  if (obstacle.kind === "sphere") return boundsDistance(bounds, obstacle.centerM) <= obstacle.radiusM;
  const inverse = quatConj(obstacleRotation(obstacle.rotationRad));
  const local = (c: CollisionCapsule): CollisionCapsule => ({ a: quatRotate(inverse, sub(c.a, obstacle.centerM)), b: quatRotate(inverse, sub(c.b, obstacle.centerM)), radiusM: c.radiusM });
  const extent = sweptBounds(local(start), local(end), margin);
  if (obstacle.kind === "box") return [0, 1, 2].every(i => extent.lo[i] <= obstacle.sizeM[i] / 2 && extent.hi[i] >= -obstacle.sizeM[i] / 2);
  if (extent.lo[1] > obstacle.heightM / 2 || extent.hi[1] < -obstacle.heightM / 2) return false;
  const x = clamp(0, extent.lo[0], extent.hi[0]);
  const z = clamp(0, extent.lo[2], extent.hi[2]);
  return Math.hypot(x, z) <= obstacle.radiusM;
}

function translatedContact(distanceAt: (fraction: number) => Distance, limit: number): { fraction: number; distance: Distance } | null {
  const beginning = distanceAt(0);
  if (beginning.clearanceM <= CONTACT_TOLERANCE_M) return { fraction: 0, distance: beginning };
  let lo = 0;
  let hi = limit;
  // Distance between a fixed convex solid and a translating capsule is convex.
  for (let i = 0; i < SWEEP_MINIMIZATION_STEPS; i += 1) {
    const left = lo + (hi - lo) / 3;
    const right = hi - (hi - lo) / 3;
    if (distanceAt(left).clearanceM <= distanceAt(right).clearanceM) hi = right;
    else lo = left;
  }
  const candidates = [lo, hi, limit];
  const minimum = candidates.map(fraction => ({ fraction, distance: distanceAt(fraction) })).reduce((a, b) => a.distance.clearanceM < b.distance.clearanceM ? a : b);
  if (minimum.distance.clearanceM > CONTACT_TOLERANCE_M) return null;
  lo = 0;
  hi = minimum.fraction;
  for (let i = 0; i < CONTACT_BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (distanceAt(mid).clearanceM <= CONTACT_TOLERANCE_M) hi = mid;
    else lo = mid;
  }
  return { fraction: hi, distance: distanceAt(hi) };
}

/** Search only intervals whose Lipschitz distance bound can still contain contact. */
function rotatingContact(distanceAt: (fraction: number) => Distance, canMeet: (lo: number, hi: number) => boolean, speedBound: number, limit: number): { fraction: number; distance: Distance } | null {
  // At the leaf, even a zero-width grazing contact is within ten micrometres
  // of the midpoint sample. Depth follows spatial resolution, not a CPU bailout.
  const maxDepth = Math.max(0, Math.ceil(Math.log2(Math.max(1, speedBound / CONTACT_TOLERANCE_M))) + 1);
  const search = (lo: number, hi: number, depth: number, left: Distance, right: Distance): { fraction: number; distance: Distance } | null => {
    if (left.clearanceM <= CONTACT_TOLERANCE_M) return { fraction: lo, distance: left };
    if (!canMeet(lo, hi)) return null;
    const mid = (lo + hi) / 2;
    const middle = distanceAt(mid);
    if (middle.clearanceM - speedBound * (hi - lo) / 2 > CONTACT_TOLERANCE_M) return null;
    if (depth >= maxDepth) {
      if (middle.clearanceM <= CONTACT_TOLERANCE_M) return { fraction: mid, distance: middle };
      return right.clearanceM <= CONTACT_TOLERANCE_M ? { fraction: hi, distance: right } : null;
    }
    return search(lo, mid, depth + 1, left, middle) ?? search(mid, hi, depth + 1, middle, right);
  };
  return search(0, limit, 0, distanceAt(0), distanceAt(limit));
}

/**
 * Sweep every paired capsule continuously, including changes of orientation.
 * Distances bound safe advancement, so clear endpoints cannot hide tunneling.
 * A small sagitta envelope also covers the curved endpoint motion between the
 * integrator's 1/60 s orientation samples; it vanishes at both exact poses.
 * At the existing 20 degree/s turn limit that envelope is below a millimetre.
 */
export function sweepCapsules(before: readonly CollisionCapsule[], after: readonly CollisionCapsule[], obstacles: readonly CollisionObstacle[], earth?: CollisionSphere): CollisionContact | null {
  let best: CollisionContact | null = null;
  // Bound rotational sagitta by each pose's vehicle diameter, excluding travel.
  let diameter = 0;
  for (const list of [before, after]) for (const a of list) for (const b of list) {
    for (const p of [a.a, a.b]) for (const q of [b.a, b.b]) diameter = Math.max(diameter, length(sub(p, q)) + a.radiusM + b.radiusM);
  }
  if (before.length === 0 || after.length === 0) return null;
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    const start = before[index];
    const end = after[index];
    const startAxis = sub(start.b, start.a);
    const endAxis = sub(end.b, end.a);
    const axisLength = length(startAxis) * length(endAxis);
    const angle = axisLength > 0 ? Math.acos(clamp(dot(startAxis, endAxis) / axisLength, -1, 1)) : 0;
    const sagitta = diameter * (1 - Math.cos(angle / 2));
    const speedBound = Math.max(length(sub(end.a, start.a)), length(sub(end.b, start.b))) + Math.abs(end.radiusM - start.radiusM) + 4 * sagitta;
    const bounds = sweptBounds(start, end, sagitta + CONTACT_TOLERANCE_M);
    const candidates = obstacles.filter(obstacle => obstacleCanMeet(bounds, start, end, sagitta + CONTACT_TOLERANCE_M, obstacle));
    const targets: { obstacle?: CollisionObstacle; sphere?: CollisionSphere }[] = candidates.map(obstacle => ({ obstacle }));
    if (earth && boundsDistance(bounds, earth.centerM) <= earth.radiusM) targets.push({ sphere: earth });
    for (const target of targets) {
      const limit = best?.fraction ?? 1;
      const capsuleAt = (fraction: number): CollisionCapsule => ({
        a: lerp(start.a, end.a, fraction), b: lerp(start.b, end.b, fraction),
        radiusM: start.radiusM + (end.radiusM - start.radiusM) * fraction + 4 * fraction * (1 - fraction) * sagitta,
      });
      const distanceAt = (fraction: number): Distance => target.obstacle ? obstacleDistance(capsuleAt(fraction), target.obstacle) : sphereDistance(capsuleAt(fraction), target.sphere!);
      const canMeet = (lo: number, hi: number): boolean => {
        const first = capsuleAt(lo);
        const last = capsuleAt(hi);
        const margin = sagitta * (hi - lo) ** 2 + CONTACT_TOLERANCE_M;
        const bound = sweptBounds(first, last, margin);
        return target.obstacle ? obstacleCanMeet(bound, first, last, margin, target.obstacle) : boundsDistance(bound, target.sphere!.centerM) <= target.sphere!.radiusM;
      };
      let contact: { fraction: number; distance: Distance } | null = null;
      if (length(sub(startAxis, endAxis)) <= CONTACT_TOLERANCE_M * 0.1) {
        contact = translatedContact(distanceAt, limit);
      } else {
        contact = rotatingContact(distanceAt, canMeet, speedBound, limit);
      }
      if (contact) best = { kind: target.obstacle ? "structure" : "ground", ...(target.obstacle ? { obstacleId: target.obstacle.id } : {}), fraction: contact.fraction, pointM: contact.distance.pointM };
    }
  }
  return best;
}

/** Active model solids in fixed physics metres, using the same rendered origin/pivot. */
export function vehicleCollisionCapsules(positionM: Vec3, nose: Vec3, stage = 0, padLiftM = 0.6): CollisionCapsule[] {
  const radius = Math.hypot(...positionM);
  // The physical origin is Earth-centred; normalizing altitude-only coordinates
  // would incorrectly turn the pad's outward direction into lateral steering.
  const altitudeM = radius - EARTH_RADIUS_M;
  const unitNose = scale(nose, 1 / Math.hypot(...nose));
  const offsets = vehiclePoseOffsets(positionM, unitNose, altitudeM, stage, padLiftM);
  const origin = add(positionM, offsets.originM);
  const fitScale = stage >= 1 ? 1 : FALCON_HEIGHT_M / FALCON_M.heightM;
  const minimum = stage >= 1 ? FALCON_M.mvacExitYM : 0;
  const fairingBase = FALCON_M.fairingBaseYM * fitScale;
  const top = stage >= 1 ? FALCON_M.fairingTopYM : FALCON_HEIGHT_M;
  const bodyRadius = FALCON_M.bodyRadiusM * fitScale;
  const fairingRadius = FALCON_M.fairingRadiusM * fitScale;
  const piece = (lo: number, hi: number, radiusM: number): CollisionCapsule => ({
    a: add(origin, scale(unitNose, lo + radiusM)),
    b: add(origin, scale(unitNose, hi - radiusM)),
    radiusM,
  });
  // Overlap the two rounded pieces at the joint. Insetting both pieces at
  // that internal seam would leave visible cylinder walls unprotected.
  // Only the outer bell/nose endpoints stay inset to retain real clearance.
  return [piece(minimum, fairingBase + bodyRadius, bodyRadius), piece(fairingBase - fairingRadius, top, fairingRadius)];
}
