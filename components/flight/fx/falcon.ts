/**
 * Falcon 9 dimensions in the flight rocket frame.
 *
 * `public/models/falcon9.glb` (Stanley Creative, CC BY 4.0) is about 7099 cm
 * tall. `prepareModel` scales that height to `DISPLAY_HEIGHT` (12) for the
 * explorer. Flight FX do not use that display scale: the integrator parents
 * these components in metres, origin on the engine bells, +Y toward the nose.
 * The numbers below are the GLB bounds converted from centimetres and shifted
 * so the bell plane is y = 0.
 */
import { DISPLAY_HEIGHT } from "@/lib/viewer/prepareModel";

/** Measured GLB height, centimetres, before the viewer scale. */
export const FALCON_GLB_HEIGHT_CM = 7099.361629681423;

export const FALCON_M = {
  /** Nose-to-bell length. Matches the GLB bounding height. */
  heightM: FALCON_GLB_HEIGHT_CM / 100,
  /** Explorer scene height. Flight FX are not in this unit. */
  viewerDisplayHeight: DISPLAY_HEIGHT,
  bodyRadiusM: 1.85,
  nozzleRadiusM: 0.47,
  /** Centre of the eight outer Merlin bells, from the vehicle axis. */
  ringRadiusM: 1.75,
  merlinCount: 9,
  /** Bottom of the Merlin Vacuum bell. */
  mvacExitYM: 43.565,
  mvacBellRadiusM: 1.52,
  mvacBellLengthM: 4.6,
  fairingBaseYM: 57.936,
  fairingTopYM: FALCON_GLB_HEIGHT_CM / 100,
  fairingRadiusM: 2.6,
  /** Top of the interstage, where the booster lets go. */
  sepPlaneYM: 48.64,
  interstageBottomYM: 40.53,
} as const;

/** Metres per explorer scene unit, so a viewer-space mesh can be compared. */
export function viewerMetresPerUnit(): number {
  return FALCON_M.heightM / FALCON_M.viewerDisplayHeight;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** 1 at sea level, near 0 by ~80 km. Max-Q (~12 km) is still about half. */
export function atmospherePressure(altitudeKm: number): number {
  const h = Math.max(0, finiteOr(altitudeKm, 0));
  return Math.exp(-h / 18);
}

export interface PlumeProfile {
  throttle: number;
  /** 0 at sea level, 1 in vacuum. */
  vacuum: number;
  /** Envelope length, metres, pointing down from the bells. */
  lengthM: number;
  /** Envelope radius at the wide end, metres. */
  radiusM: number;
  /** 0..1. Sea level is brightest. */
  brightness: number;
  /** 0..1 pad steam. Strong on the pad, gone after about 1.6 km. */
  smoke: number;
  /** 0..1 warm light in the steam closest to the bells. */
  orange: number;
  /** White column length behind the bells, metres. */
  contrailM: number;
  /** 0..1 opacity of that column. */
  contrail: number;
}

/**
 * Merlin exhaust shape.
 * Sea level is a bright white column with a wide cream billow. Max-Q keeps
 * a white trail. Vacuum opens the bell. Width uses vacuum² so the dense-air
 * plume stays narrow. The contrail grows with altitude and then holds.
 */
export function plumeProfile(throttle: number, altitudeKm: number): PlumeProfile {
  const t = clamp01(throttle);
  const pressure = atmospherePressure(altitudeKm);
  const vacuum = 1 - pressure;
  const width = vacuum * vacuum;
  const drive = 0.35 + 0.65 * t;
  const lengthM = (32 + vacuum * 70) * drive;
  const radiusM = (1.15 + width * 16) * (0.55 + 0.45 * t);
  const brightness = t * (0.55 + 0.45 * pressure);
  const h = Math.max(0, finiteOr(altitudeKm, 0));
  const smoke = t * clamp01(1 - h / 1.6);
  const orange = smoke * (0.45 + 0.55 * pressure);
  const contrailM = t > 0.02 ? Math.min(h * 1000, 4500) : 0;
  const contrail = t * clamp01(h / 0.15) * clamp01(1 - h / 40);
  return { throttle: t, vacuum, lengthM, radiusM, brightness, smoke, orange, contrailM, contrail };
}

/** Starbase / Boca Chica. The env pad is built here. */
export const BOCA_CHICA_LAT = 25.997;
export const BOCA_CHICA_LON = -97.157;

/**
 * Unit position on the flight globe. Same mapping as `latLonToUnit` in
 * `lib/flight/scene-types.ts`: +Y north, +X lon 0 on the equator.
 */
export function latLonToUnit(latDeg: number, lonDeg: number): [number, number, number] {
  const lat = Math.min(90, Math.max(-90, finiteOr(latDeg, 0)));
  const lon = finiteOr(lonDeg, 0);
  const wrapped = lon % 360;
  const lon360 = wrapped < 0 ? wrapped + 360 : wrapped;
  const phi = (((lon360 + 180) % 360) / 360) * Math.PI * 2;
  const theta = ((90 - lat) * Math.PI) / 180;
  const sinTheta = Math.sin(theta);
  return [-Math.cos(phi) * sinTheta, Math.cos(theta), Math.sin(phi) * sinTheta];
}

export function bocaChicaPad(): [number, number, number] {
  return latLonToUnit(BOCA_CHICA_LAT, BOCA_CHICA_LON);
}

/** Pad origin in Earth radii. Missing or broken input falls back to Boca Chica. */
export function resolvePad(pad: readonly [number, number, number] | undefined): [number, number, number] {
  if (!pad || pad.length < 3) return bocaChicaPad();
  const x = pad[0];
  const y = pad[1];
  const z = pad[2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return bocaChicaPad();
  const len = Math.hypot(x, y, z);
  if (!(len > 0)) return bocaChicaPad();
  return [x / len, y / len, z / len];
}

export interface PadBasis {
  up: [number, number, number];
  east: [number, number, number];
  north: [number, number, number];
}

function cross3(a: readonly [number, number, number], b: readonly [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit3(v: readonly [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!(len > 0)) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Tangent frame on the globe. `up` is the outward normal at the pad. */
export function padBasis(pad: readonly [number, number, number]): PadBasis {
  const up = unit3(pad);
  const pole: [number, number, number] = Math.abs(up[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const east = unit3(cross3(pole, up));
  const north = unit3(cross3(up, east));
  return { up, east, north };
}

/** Nine Merlin bells: one on the axis, eight on the octaweb ring. */
export function merlinNozzles(): ReadonlyArray<readonly [number, number, number]> {
  const out: Array<readonly [number, number, number]> = [[0, 0, 0]];
  const r = FALCON_M.ringRadiusM;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    out.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  return out;
}

export interface BoosterPose {
  separated: boolean;
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
}

/**
 * Booster motion after separation. `stage` 0 (or elapsed ≤ 0) stays stacked.
 * The drop is exaggerated so the gap reads within a couple of seconds, then
 * it holds so a long clock does not send the mesh to infinity.
 */
export function boosterPose(stage: number, elapsedS: number): BoosterPose {
  const stacked = !(finiteOr(stage, 0) >= 1) || !(finiteOr(elapsedS, 0) > 0);
  if (stacked) return { separated: false, x: 0, y: 0, z: 0, pitch: 0, roll: 0 };
  const t = Math.min(finiteOr(elapsedS, 0), 6);
  return {
    separated: true,
    x: t * 3.2,
    y: -(4 * t + 6 * t * t),
    z: Math.sin(t * 0.7) * 1.4,
    pitch: t * 0.55,
    roll: t * 0.35,
  };
}

/**
 * 0 until the booster has dropped clear of the MVac bell (~0.55 s),
 * then ramps to 1. The upper stage engine stays dark while stacked.
 */
export function mvacIgnition(stage: number, elapsedS: number): number {
  if (!(finiteOr(stage, 0) >= 1)) return 0;
  return clamp01((finiteOr(elapsedS, 0) - 0.55) / 0.45);
}

export interface FairingPose {
  spread: number;
  yaw: number;
  drop: number;
}

/** Fairing halves stay shut unless `open` is set. They swing out on `elapsedS`. */
export function fairingPose(open: boolean, elapsedS: number): FairingPose {
  if (!open) return { spread: 0, yaw: 0, drop: 0 };
  const t = Math.max(0, finiteOr(elapsedS, 0));
  const u = 1 - Math.exp(-Math.min(t, 4) * 1.6);
  return { spread: u * 8, yaw: u * 1.2, drop: u * u * 6 };
}

export const EXPLOSION_BURST_S = 2;
export const EXPLOSION_FADE_S = 0.8;

export interface ExplosionVisual {
  alive: boolean;
  /** 0..1 opacity after the burst. */
  fade: number;
  /** 0..1 through the 2 s burst. */
  life: number;
  /** Fireball radius, metres. */
  radiusM: number;
  /** 0..1 flame intensity. */
  fire: number;
  /** 0..1 smoke intensity. */
  smoke: number;
  /** 0..1 initial flash. */
  flash: number;
}

/** Fireball for ~2 s, then a short fade. `ageS` < 0 means the effect is off. */
export function explosionVisual(ageS: number): ExplosionVisual {
  if (!Number.isFinite(ageS) || ageS < 0) {
    return { alive: false, fade: 0, life: 0, radiusM: 0, fire: 0, smoke: 0, flash: 0 };
  }
  const fade = ageS <= EXPLOSION_BURST_S
    ? 1
    : Math.max(0, 1 - (ageS - EXPLOSION_BURST_S) / EXPLOSION_FADE_S);
  const life = Math.min(ageS / EXPLOSION_BURST_S, 1);
  const radiusM = 8 + life * 82;
  const fire = fade * (ageS < 0.18 ? 1 : Math.max(0, 1 - (ageS - 0.18) / 1.7));
  const smoke = fade * Math.min(1, ageS / 0.35);
  const flash = fade * Math.max(0, 1 - ageS / 0.22);
  return { alive: fade > 0.02, fade, life, radiusM, fire, smoke, flash };
}

/** Cloud decks the vehicle climbs through, kilometres. */
export const CLOUD_DECKS_KM = [3.2, 6.4, 9.1, 11.4] as const;

export const CLOUD_BAND = { lowKm: 2, highKm: 12 } as const;

/** How solid a deck is at this vehicle altitude. 0 once the vehicle is above it. */
export function cloudDeckOpacity(altitudeKm: number, deckKm: number): number {
  const alt = finiteOr(altitudeKm, 0);
  const above = alt - deckKm;
  if (above > 1.4) return 0;
  if (above > 0) return (1 - above / 1.4) * 0.9;
  if (alt < CLOUD_BAND.lowKm) return 0.55;
  return 0.9;
}

/** 1 while the vehicle is inside a deck, so the view can white out for a moment. */
export function cloudPunch(altitudeKm: number): number {
  const alt = finiteOr(altitudeKm, 0);
  if (alt < CLOUD_BAND.lowKm - 0.3 || alt > CLOUD_BAND.highKm + 0.6) return 0;
  let punch = 0;
  for (const deck of CLOUD_DECKS_KM) {
    const near = 1 - Math.abs(alt - deck) / 0.55;
    if (near > punch) punch = near;
  }
  return clamp01(punch);
}

export interface FxBudget {
  sparks: number;
  /** Horizontal pad billow sprites on the rocket. */
  smoke: number;
  /** White column sprites behind the bells. */
  contrail: number;
  debris: number;
  embers: number;
  cloudPuffs: number;
  flicker: boolean;
}

/** Particle counts. Reduced motion keeps the shapes and drops the specks. */
export function fxBudget(reduced: boolean): FxBudget {
  if (reduced) {
    return {
      sparks: 0, smoke: 16, contrail: 10, debris: 8, embers: 0,
      cloudPuffs: 4, flicker: false,
    };
  }
  return {
    sparks: 28, smoke: 72, contrail: 40, debris: 32, embers: 40,
    cloudPuffs: 12, flicker: true,
  };
}
