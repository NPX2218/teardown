// lib/flight/reference.ts — read a mission reference without inventing kinematics.
// Owner: Neel. A null altitude or velocity drops the whole corridor.
import type { MissionReference, MissionReferenceSample } from "@/lib/types";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";

export const REFERENCE_UNAVAILABLE = "Reference trajectory unavailable";

export interface KinematicSample {
  t: number;
  altM: number;
  downrangeM: number | null;
  velMs: number;
  pitchRad: number | null;
  event: string | null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** True only when every sample has a real altitude and velocity. */
export function referenceHasKinematics(reference: MissionReference | null | undefined): boolean {
  if (!reference || reference.samples.length === 0) return false;
  return reference.samples.every((sample) => finite(sample.altKm) && finite(sample.velMs));
}

export function referenceEvents(reference: MissionReference | null | undefined): { t: number; id: string }[] {
  if (!reference) return [];
  return reference.samples
    .filter((sample) => finite(sample.t) && typeof sample.event === "string" && sample.event.trim() !== "")
    .map((sample) => ({ t: sample.t, id: sample.event as string }));
}

/**
 * Hold or interpolate a kinematic sample. Returns null when any row lacks
 * altitude or velocity — the missing numbers are not filled in.
 */
export function sampleReference(reference: MissionReference | null | undefined, time: number): KinematicSample | null {
  if (!referenceHasKinematics(reference) || !reference) return null;
  const samples = [...reference.samples].sort((a, b) => a.t - b.t);
  const t = Number.isFinite(time) ? time : 0;
  const toSample = (row: MissionReferenceSample, at: number): KinematicSample => ({
    t: at,
    altM: (row.altKm as number) * 1000,
    downrangeM: finite(row.downrangeKm) ? (row.downrangeKm as number) * 1000 : null,
    velMs: row.velMs as number,
    pitchRad: finite(row.pitchDeg) ? ((row.pitchDeg as number) * Math.PI) / 180 : null,
    event: typeof row.event === "string" ? row.event : null,
  });
  if (t <= samples[0].t) return toSample(samples[0], t);
  const last = samples[samples.length - 1];
  if (t >= last.t) return toSample(last, t);
  let upper = 1;
  while (upper < samples.length && samples[upper].t < t) upper += 1;
  const right = samples[upper];
  const left = samples[upper - 1];
  if (!reference.interpolated) return toSample(left, t);
  const span = right.t - left.t;
  const u = span > 0 ? (t - left.t) / span : 0;
  const mix = (a: number | null, b: number | null) => (finite(a) && finite(b) ? a + (b - a) * u : finite(a) ? a : finite(b) ? b : null);
  const altKm = mix(left.altKm, right.altKm);
  const vel = mix(left.velMs, right.velMs);
  if (!finite(altKm) || !finite(vel)) return null;
  const down = mix(finite(left.downrangeKm) ? left.downrangeKm : null, finite(right.downrangeKm) ? right.downrangeKm : null);
  const pitch = mix(finite(left.pitchDeg) ? left.pitchDeg : null, finite(right.pitchDeg) ? right.pitchDeg : null);
  return {
    t,
    altM: altKm * 1000,
    downrangeM: finite(down) ? down * 1000 : null,
    velMs: vel,
    pitchRad: finite(pitch) ? (pitch * Math.PI) / 180 : null,
    event: left.event ?? null,
  };
}

/** Planar position from altitude and downrange. Null when downrange was not published. */
export function referencePoint(altM: number, downrangeM: number | null): { x: number; y: number } | null {
  if (!Number.isFinite(altM) || !Number.isFinite(downrangeM ?? NaN)) return null;
  const angle = (downrangeM as number) / EARTH_RADIUS_M;
  const radius = EARTH_RADIUS_M + altM;
  return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius };
}

/** Ghost path. Null when kinematics or downrange are missing. Never a made-up arc. */
export function referencePath(reference: MissionReference | null | undefined): { x: number; y: number }[] | null {
  if (!referenceHasKinematics(reference) || !reference) return null;
  if (!reference.samples.every((sample) => finite(sample.downrangeKm))) return null;
  const points: { x: number; y: number }[] = [];
  for (const sample of [...reference.samples].sort((a, b) => a.t - b.t)) {
    const point = referencePoint((sample.altKm as number) * 1000, (sample.downrangeKm as number) * 1000);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

/** Altitude ribbon around a kinematic path. Null when the path itself cannot be drawn. */
export function corridorEdges(
  reference: MissionReference | null | undefined,
  altToleranceM: number,
): { inner: { x: number; y: number }[]; outer: { x: number; y: number }[] } | null {
  const path = referencePath(reference);
  if (!path || !(altToleranceM > 0)) return null;
  const shift = (point: { x: number; y: number }, delta: number) => {
    const radius = Math.hypot(point.x, point.y) || 1;
    const next = radius + delta;
    return { x: (point.x / radius) * next, y: (point.y / radius) * next };
  };
  return {
    inner: path.map((point) => shift(point, -altToleranceM)),
    outer: path.map((point) => shift(point, altToleranceM)),
  };
}

/** Pitch and throttle that follow a kinematic sample. Null when there is nothing to follow. */
export function autopilotInput(
  reference: MissionReference | null | undefined,
  time: number,
  speedMs: number,
): { pitchRad: number; throttle: number } | null {
  const sample = sampleReference(reference, time);
  if (!sample || sample.pitchRad === null) return null;
  let throttle = 0.7;
  if (speedMs < sample.velMs - 200) throttle = 1;
  else if (speedMs > sample.velMs + 200) throttle = 0;
  return { pitchRad: sample.pitchRad, throttle };
}
