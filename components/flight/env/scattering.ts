import { clamp } from "./frame";

/**
 * Single-scattering Rayleigh / Mie march in kilometres.
 * Coefficients are the usual per-metre values × 1000, so a kilometre step
 * matches the reference optical depth. Primary and light steps stay small
 * enough for a full-screen pass at 1440×900.
 */
export const SCATTER = {
  primarySteps: 8,
  lightSteps: 4,
  iSun: 48,
  exposure: 1.35,
  rayleigh: [5.5e-3, 13.0e-3, 22.4e-3] as const,
  mie: 3.2e-3,
  scaleRayleighKm: 8.5,
  scaleMieKm: 1.2,
  mieG: 0.758,
  planetKm: 6378.137,
  atmosphereKm: 100,
  /** Extra fade so a 100 km prop is black overhead even if the camera lags. */
  blackKm: 100,
} as const;

const PI = Math.PI;

export interface ScatterSample {
  altitudeKm: number;
  /** Degrees above the local horizon. 90 is the zenith. */
  viewElevationDeg: number;
  /** Degrees above the local horizon. Negative is night. */
  sunElevationDeg: number;
  /** 0 looks at the sun's azimuth. */
  viewFromSunDeg: number;
}

export interface ScatterRgb {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export function sanitizeAltitudeKm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 2000);
}

function raySphere(ro: readonly [number, number, number], rd: readonly [number, number, number], radius: number): [number, number] | null {
  const b = 2 * (ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2]);
  const c = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2] - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  return [(-b - s) / 2, (-b + s) / 2];
}

function tone(value: number, exposure: number): number {
  return 1 - Math.exp(-Math.max(value, 0) * exposure);
}

/**
 * Local frame: planet at the origin, up is +Y, the sun lies in the +X/up plane.
 * `altitudeKm` is both the camera height and the density the integrator asked for.
 */
export function sampleAtmosphere(sample: ScatterSample): ScatterRgb {
  const altitudeKm = sanitizeAltitudeKm(sample.altitudeKm);
  const viewEl = Number.isFinite(sample.viewElevationDeg) ? sample.viewElevationDeg : 90;
  const sunEl = Number.isFinite(sample.sunElevationDeg) ? sample.sunElevationDeg : 45;
  const viewAz = Number.isFinite(sample.viewFromSunDeg) ? sample.viewFromSunDeg : 0;
  const el = (viewEl * PI) / 180;
  const az = (viewAz * PI) / 180;
  const sun = Math.sin((sunEl * PI) / 180);
  const sunCos = Math.cos((sunEl * PI) / 180);
  const rd: [number, number, number] = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
  const sunDir: [number, number, number] = [sunCos, sun, 0];
  const radius = SCATTER.planetKm + Math.max(altitudeKm, 0.002);
  const ro: [number, number, number] = [0, radius, 0];
  const marched = marchAtmosphere(ro, rd, sunDir, 1);
  const mu = rd[0] * sunDir[0] + rd[1] * sunDir[1] + rd[2] * sunDir[2];
  const graded = gradeSunset(marched, mu, (sunEl * PI) / 180);
  if (altitudeKm >= SCATTER.blackKm && viewEl > 0) {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }
  const night = smooth(6, -6, sunEl);
  return {
    r: graded.r,
    g: graded.g,
    b: graded.b,
    alpha: marched.alpha * (1 - night * 0.78),
  };
}

/** Push the horizon toward orange when the sun is low and the view faces it. */
export function gradeSunset(
  marched: { r: number; g: number; b: number },
  mu: number,
  sunElevationRad: number,
): { r: number; g: number; b: number } {
  const warm = smooth(0.35, 0.92, mu) * smooth(0.28, -0.03, sunElevationRad);
  return {
    r: Math.min(1, tone(marched.r, SCATTER.exposure) * (1 + warm * 0.4)),
    g: Math.min(1, tone(marched.g, SCATTER.exposure) * (1 - warm * 0.45)),
    b: Math.min(1, tone(marched.b, SCATTER.exposure) * (1 - warm * 0.7)),
  };
}

function smooth(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : clamp((x - edge0) / span, 0, 1);
  return t * t * (3 - 2 * t);
}

export interface MarchResult {
  r: number;
  g: number;
  b: number;
  alpha: number;
  odR: number;
}

/** Shared by the unit tests and the ground-fog colour. */
export function marchAtmosphere(
  ro: readonly [number, number, number],
  rd: readonly [number, number, number],
  sunDir: readonly [number, number, number],
  densityScale: number,
): MarchResult {
  const atmosR = SCATTER.planetKm + SCATTER.atmosphereKm;
  const atmo = raySphere(ro, rd, atmosR);
  if (!atmo) return { r: 0, g: 0, b: 0, alpha: 0, odR: 0 };
  const t0 = Math.max(atmo[0], 0);
  let t1 = atmo[1];
  const planet = raySphere(ro, rd, SCATTER.planetKm);
  if (planet && planet[0] > 0.001) t1 = Math.min(t1, planet[0]);
  if (!(t1 > t0)) return { r: 0, g: 0, b: 0, alpha: 0, odR: 0 };

  const mu = rd[0] * sunDir[0] + rd[1] * sunDir[1] + rd[2] * sunDir[2];
  const mumu = mu * mu;
  const g = SCATTER.mieG;
  const gg = g * g;
  const pRlh = (3 / (16 * PI)) * (1 + mumu);
  const pMie = (3 / (8 * PI)) * ((1 - gg) * (mumu + 1)) / (Math.pow(1 + gg - 2 * mu * g, 1.5) * (2 + gg));

  const steps = SCATTER.primarySteps;
  const stepLen = (t1 - t0) / steps;
  let odR = 0;
  let odM = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalM = 0;
  const kR = SCATTER.rayleigh;
  const kM = SCATTER.mie;
  const scale = Number.isFinite(densityScale) && densityScale > 0 ? densityScale : 0;

  for (let i = 0; i < steps; i += 1) {
    const t = t0 + stepLen * (i + 0.5);
    const px = ro[0] + rd[0] * t;
    const py = ro[1] + rd[1] * t;
    const pz = ro[2] + rd[2] * t;
    const height = Math.max(Math.hypot(px, py, pz) - SCATTER.planetKm, 0);
    const dR = Math.exp(-height / SCATTER.scaleRayleighKm) * scale;
    const dM = Math.exp(-height / SCATTER.scaleMieKm) * scale;
    const odStepR = dR * stepLen;
    const odStepM = dM * stepLen;
    odR += odStepR;
    odM += odStepM;

    let jOdR = 0;
    let jOdM = 0;
    const shadow = raySphere([px, py, pz], sunDir, SCATTER.planetKm);
    if (shadow && shadow[0] > 0.01) {
      jOdR = 1e6;
      jOdM = 1e6;
    } else {
      const sunHit = raySphere([px, py, pz], sunDir, atmosR);
      const sunFar = sunHit ? Math.max(sunHit[1], 0) : 0;
      const jSteps = SCATTER.lightSteps;
      const jStep = sunFar / jSteps;
      for (let j = 0; j < jSteps; j += 1) {
        const jt = jStep * (j + 0.5);
        const sx = px + sunDir[0] * jt;
        const sy = py + sunDir[1] * jt;
        const sz = pz + sunDir[2] * jt;
        const sh = Math.max(Math.hypot(sx, sy, sz) - SCATTER.planetKm, 0);
        jOdR += Math.exp(-sh / SCATTER.scaleRayleighKm) * jStep * scale;
        jOdM += Math.exp(-sh / SCATTER.scaleMieKm) * jStep * scale;
      }
    }

    const tauR = odR + jOdR;
    const tauM = odM + jOdM;
    const attnR = Math.exp(-(kM * tauM + kR[0] * tauR));
    const attnG = Math.exp(-(kM * tauM + kR[1] * tauR));
    const attnB = Math.exp(-(kM * tauM + kR[2] * tauR));
    totalR += odStepR * attnR;
    totalG += odStepR * attnG;
    totalB += odStepR * attnB;
    totalM += odStepM * ((attnR + attnG + attnB) / 3);
  }

  const sunLight = SCATTER.iSun;
  return {
    r: sunLight * (pRlh * kR[0] * totalR + pMie * kM * totalM),
    g: sunLight * (pRlh * kR[1] * totalG + pMie * kM * totalM),
    b: sunLight * (pRlh * kR[2] * totalB + pMie * kM * totalM),
    alpha: 1 - Math.exp(-(odR * 0.45 + odM * 0.35)),
    odR,
  };
}

export function luminance(color: ScatterRgb): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}
