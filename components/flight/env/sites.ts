import type { LaunchSiteSpec } from "./types";

/** Cape Canaveral SLC-40. Free flight, practice, and the classroom pad. */
export const CAPE_SLC40: LaunchSiteSpec = {
  lat: 28.561941,
  lon: -80.577357,
  name: "Cape Canaveral SLC-40",
  azimuthDeg: 90,
};

/**
 * Vandenberg SLC-4E. Sentinel-6 Michael Freilich.
 * Azimuth is the southbound heading for a ~66° orbit from this latitude.
 */
export const VSFB_SLC4E: LaunchSiteSpec = {
  lat: 34.632093,
  lon: -120.610829,
  name: "VSFB SLC-4E",
  azimuthDeg: 150.4,
};

export const LAUNCH_SITES = [VSFB_SLC4E, CAPE_SLC40] as const;

/**
 * Illustrative shoreline, not a survey. Bearing is clockwise from north,
 * toward the water a visitor sees from the pad.
 */
export type CoastDressing = {
  coastBearingDeg: number;
  shoreM: number;
};

const COASTS: readonly { site: LaunchSiteSpec; coast: CoastDressing }[] = [
  { site: VSFB_SLC4E, coast: { coastBearingDeg: 255, shoreM: 780 } },
  { site: CAPE_SLC40, coast: { coastBearingDeg: 95, shoreM: 620 } },
];

export function coastFor(site: LaunchSiteSpec): CoastDressing | null {
  for (const entry of COASTS) {
    const sameName = entry.site.name === site.name;
    const near = Math.abs(entry.site.lat - site.lat) < 0.05 && Math.abs(entry.site.lon - site.lon) < 0.05;
    if (sameName || near) return entry.coast;
  }
  return null;
}
