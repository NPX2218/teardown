// Rendered launch primitives also define solid contact; no parallel hand-written obstacle map.
import { kitFor, launchPadLiftM, siteKind } from "@/components/flight/env/kit";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import type { LaunchSiteSpec } from "@/lib/flight/scene-types";
import type { CollisionCapsule, CollisionObstacle } from "@/lib/flight/collision.helpers";
import type { Vec3 } from "@/lib/types";

const solids = new Map<string, readonly CollisionObstacle[]>();

export { launchPadLiftM };

/** Physics axes already match the pad axes; translate its local origin to Earth's surface. */
export function launchObstacles(site: LaunchSiteSpec): readonly CollisionObstacle[] {
  const kind = siteKind(site);
  const cached = solids.get(kind);
  if (cached) return cached;
  const kit = kitFor(site);
  const center = (at: Vec3): Vec3 => [at[0], EARTH_RADIUS_M + at[1], at[2]];
  const result: CollisionObstacle[] = [
    ...kit.boxes.map((item, i): CollisionObstacle => ({ id: `${kind}-box-${i}`, kind: "box", centerM: center(item.position), sizeM: item.size, rotationRad: item.rotation })),
    ...kit.cylinders.map((item, i): CollisionObstacle => ({ id: `${kind}-cylinder-${i}`, kind: "cylinder", centerM: center(item.position), radiusM: item.size[0], heightM: item.size[1], rotationRad: item.rotation })),
    ...kit.spheres.map((item, i): CollisionObstacle => ({ id: `${kind}-cap-${i}`, kind: "sphere", centerM: center(item.position), radiusM: item.size[0] })),
  ];
  solids.set(kind, result);
  return result;
}

const obstacleBounds = new Map<string, { lo: Vec3; hi: Vec3 }>();

/** Skip the entire launch kit once the swept vehicle bounds are clear of it. */
export function nearbyLaunchObstacles(site: LaunchSiteSpec, before: readonly CollisionCapsule[], after: readonly CollisionCapsule[]): readonly CollisionObstacle[] {
  const obstacles = launchObstacles(site);
  const key = siteKind(site);
  let bounds = obstacleBounds.get(key);
  if (!bounds) {
    const radius = (item: CollisionObstacle) => item.kind === "box" ? Math.hypot(...item.sizeM) / 2
      : item.kind === "cylinder" ? Math.hypot(item.radiusM, item.heightM / 2) : item.radiusM;
    bounds = {
      lo: [0, 1, 2].map(i => Math.min(...obstacles.map(item => item.centerM[i] - radius(item)))) as Vec3,
      hi: [0, 1, 2].map(i => Math.max(...obstacles.map(item => item.centerM[i] + radius(item)))) as Vec3,
    };
    obstacleBounds.set(key, bounds);
  }
  const all = [...before, ...after];
  // Expanding by a complete capsule length safely encloses the small rotation
  // arc between poses, even when its midpoint lies outside the endpoint bounds.
  const reach = Math.max(...all.map(item => Math.hypot(...item.a.map((v, i) => v - item.b[i])) + item.radiusM));
  for (let axis = 0; axis < 3; axis++) {
    const lo = Math.min(...all.flatMap(item => [item.a[axis], item.b[axis]])) - reach;
    const hi = Math.max(...all.flatMap(item => [item.a[axis], item.b[axis]])) + reach;
    if (lo > bounds.hi[axis] || hi < bounds.lo[axis]) return [];
  }
  return obstacles;
}
