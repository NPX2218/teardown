import { FALCON_M } from "@/components/flight/fx/falcon";
import { add, normalize, scale, type Vec3 } from "@/lib/flight/scene-types";

/**
 * The 2026-10-17 camera-drift report exposed two different vehicle origins.
 * Preserve the renderer's existing 28/56 m stage pivots and 40 m pad blend.
 * The loaded stack is fitted to 70 m; the upper stage uses its measured bounds.
 * The 0.6 m surface lift is the existing bell clearance, shared with the camera.
 * Both consumers must use these offsets so a turn cannot move the aim point away from the body.
 */
const VEHICLE_POSE = {
  pivotsM: [28, 56],
  pivotBlendM: 40,
  surfaceLiftM: 0.6,
  centersM: [35, (FALCON_M.mvacExitYM + FALCON_M.fairingTopYM) / 2],
} as const;

export const ROCKET_MID_M = VEHICLE_POSE.centersM[0];

/** Offsets from the physical position, in metres in the supplied globe frame. */
export function vehiclePoseOffsets(position: Vec3, noseDirection: Vec3, altitudeM: number, stage = 0, padLiftM: number = VEHICLE_POSE.surfaceLiftM): { originM: Vec3; centerM: Vec3 } {
  const up = normalize(position);
  const nose = normalize(noseDirection);
  const index = stage >= 1 ? 1 : 0;
  const pivot = VEHICLE_POSE.pivotsM[index] * Math.min(1, Math.max(0, altitudeM / VEHICLE_POSE.pivotBlendM));
  const originM = add(scale(up, padLiftM + pivot), scale(nose, -pivot));
  return { originM, centerM: add(originM, scale(nose, VEHICLE_POSE.centersM[index])) };
}
