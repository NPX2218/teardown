import type { EarthRadiiVec3, MapLabel, OrbitPathState } from "@/lib/flight/map";

/**
 * Matches `OrbitPathProps` in lib/flight/scene-types.ts.
 * `trail` is optional history in the same Earth-radii frame. Omit it and the
 * solid line accumulates from the first coast sample, at most ten times a second.
 */
export interface OrbitPathProps {
  state: OrbitPathState;
  trail?: readonly EarthRadiiVec3[];
  /** Globe-scale markers belong in overview, outside the metre-scale follow shot. */
  showMarkers?: boolean;
}

/**
 * Matches `MapOverlayProps` in lib/flight/scene-types.ts.
 * `state` / `trail` are optional so a labels-only shell still typechecks.
 * Pass `state` to draw the ground track under the markers.
 */
export interface MapOverlayProps {
  visible: boolean;
  labels?: readonly MapLabel[];
  state?: OrbitPathState;
  trail?: readonly EarthRadiiVec3[];
}
