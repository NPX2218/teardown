/**
 * Props for the surface module. Shapes match `lib/flight/scene-types.ts` on
 * `neel/19-kerbal-launch` (that file is not on this branch). Mount both
 * components inside `<group scale={EARTH_RADIUS}>`, where the surface is
 * radius 1. `EARTH_RADIUS` is the globe mesh radius in scene units.
 */

/** Cartesian tuple. Earth-fixed: +Y north pole, +X lon 0° on the equator, +Z lon -90°. */
export type Vec3 = readonly [number, number, number];

export interface LaunchSiteSpec {
  /** Degrees north of the equator. */
  lat: number;
  /** Degrees east of the prime meridian. West is negative. */
  lon: number;
  name: string;
  /**
   * Launch azimuth, degrees clockwise from north.
   * Cape practice flights use 90 (due east). Vandenberg Sentinel-6 uses ~150.
   * Omit to face due east.
   */
  azimuthDeg?: number;
}

export interface AtmosphereProps {
  /** Vehicle altitude. 0 on the pad. The sky is blue here and black by 100. */
  altitudeKm: number;
  /** Unit vector in earth-fixed axes. Pass `EARTH_SUN_DIRECTION`. */
  sunDirection: Vec3;
}

export interface LaunchSiteProps {
  site: LaunchSiteSpec;
  /**
   * Earth-fixed sun. Optional so `<LaunchSite site={...} />` matches the
   * integrator props. Starbase defaults to a low warm sun; other sites
   * default to `EARTH_SUN_DIRECTION`.
   */
  sunDirection?: Vec3;
  /**
   * 0..1 liftoff steam for the fx module (`neel/19b-rocket-fx`).
   * This component does not draw the cloud. The value is copied onto the
   * group's `userData.launchCloudIntensity` so EnginePlume / CloudLayer can
   * read it without a second plume living here.
   */
  launchCloudIntensity?: number;
}
