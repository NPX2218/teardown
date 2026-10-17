/**
 * Rocket flight effects. Plain props, no store reads or writes.
 *
 *   EnginePlume       rocket metres, origin at the bells, +Y nose
 *   StageSeparation   same frame. stage 0 stacked, stage >= 1 separated
 *   Explosion         Earth radii, inside the globe group
 *   CloudLayer        Earth radii, local puffs and fog from about 2 km to 12 km
 *
 * Sizes follow the Falcon 9 GLB (about 71 m tall). The explorer viewer
 * squeezes that model to 12 scene units; these components stay in metres
 * so the flight parent (`1 / EARTH_RADIUS_M` inside the Earth-radii group)
 * lines the exhaust up with the real bells.
 */
export { EnginePlume } from "./EnginePlume";
export { StageSeparation } from "./StageSeparation";
export { Explosion } from "./Explosion";
export { CloudLayer } from "./CloudLayer";
export {
  BOCA_CHICA_LAT,
  BOCA_CHICA_LON,
  CLOUD_BAND,
  CLOUD_DECKS_KM,
  EXPLOSION_BURST_S,
  EXPLOSION_FADE_S,
  FALCON_GLB_HEIGHT_CM,
  FALCON_M,
  atmospherePressure,
  bocaChicaPad,
  boosterPose,
  cloudDeckOpacity,
  cloudPunch,
  explosionVisual,
  fairingPose,
  fxBudget,
  latLonToUnit,
  merlinNozzles,
  mvacIgnition,
  padBasis,
  plumeProfile,
  resolvePad,
  viewerMetresPerUnit,
} from "./falcon";
export type {
  CloudLayerProps,
  EarthRadiiVec3,
  EnginePlumeProps,
  ExplosionProps,
  StageSeparationProps,
  Vec3,
} from "./types";
