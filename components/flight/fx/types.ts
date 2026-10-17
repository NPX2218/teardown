/**
 * Prop types for the rocket FX module.
 *
 * These match `lib/flight/scene-types.ts` on `neel/19-kerbal-launch`
 * (EnginePlume, StageSeparation, Explosion, CloudLayer). That file is owned
 * by the integrator and is not copied here. `fairingSep` is an optional
 * extension: the shared contract does not require it.
 *
 * Frames (from that contract):
 * - EnginePlume and StageSeparation: rocket-local. Origin at the engine
 *   bells, +Y toward the nose, 1 unit = 1 metre.
 * - Explosion `position`: Earth radii, earth-fixed. The parent group is
 *   scaled by `EARTH_RADIUS`.
 * - CloudLayer: same Earth-radii parent. Altitude fades the decks.
 */

/** Cartesian tuple. Meaning depends on the frame named at the use site. */
export type Vec3 = readonly [number, number, number];

/** Earth-fixed coordinates in Earth radii. The surface is radius 1. */
export type EarthRadiiVec3 = Vec3;

export interface EnginePlumeProps {
  /** 0..1 engine command. Hide the plume at 0. */
  throttle: number;
  /** Vehicle altitude, kilometres. The plume may widen as the air thins. */
  altitudeKm: number;
}

export interface StageSeparationProps {
  /**
   * Active stage index from the flight state.
   * 0 = still stacked. 1 = the booster has separated.
   * Any value >= 1 is treated as separated so a later upper-stage index
   * still shows the fallen booster.
   */
  stage: number;
  /** Seconds since `stage` became 1. 0 while the vehicle is still stacked. */
  elapsedS: number;
  /**
   * When true, the payload-fairing halves open on the same `elapsedS` clock.
   * Omit or pass false to keep the nose closed.
   */
  fairingSep?: boolean;
}

export interface ExplosionProps {
  /** Impact point in Earth radii, earth-fixed frame. Ignored while `active` is false. */
  position: EarthRadiiVec3;
  active: boolean;
}

export interface CloudLayerProps {
  /** Vehicle altitude, kilometres. Fade the deck out as this climbs through the clouds. */
  altitudeKm: number;
}

/** Optional override. When omitted, the OS `prefers-reduced-motion` setting is used. */
export interface MotionOverride {
  reducedMotion?: boolean;
}
