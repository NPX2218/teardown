/** Closed-ellipse samples. Inclusive of the repeated seam, still a few hundred points. */
export const ELLIPSE_SAMPLES = 240;

/** Samples along a ballistic arc or an escape branch. */
export const ARC_SAMPLES = 160;

/** Hard cap for any line the map view uploads to the GPU. */
export const LINE_CAPACITY = 300;

/** Prediction and line rebuilds. Ten hertz. */
export const MAP_REFRESH_MS = 100;

/** Ignore trail samples closer than this, metres. */
export const TRAIL_MIN_STEP_M = 2_000;

/** Raw history kept before the draw path is decimated. */
export const TRAIL_STORE_MAX = 2_000;

/** Flown line length after decimation. */
export const TRAIL_DRAW_MAX = 240;

/**
 * Ground track radius / Earth radius. Lifts the line off the mesh so it
 * stays visible on the globe instead of z-fighting the surface.
 */
export const SURFACE_LIFT = 1.004;
