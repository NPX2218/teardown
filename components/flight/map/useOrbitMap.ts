"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import {
  LINE_CAPACITY,
  SURFACE_LIFT,
  TRAIL_DRAW_MAX,
  TRAIL_STORE_MAX,
  apsisLabel,
  shouldRefresh,
  type EarthRadiiVec3,
  type OrbitPathState,
} from "@/lib/flight/map";

const MIN_STEP = 2_000 / EARTH_RADIUS_M;

export interface PathSnap {
  predicted: readonly EarthRadiiVec3[];
  flown: readonly EarthRadiiVec3[];
  groundPredicted: readonly EarthRadiiVec3[];
  groundFlown: readonly EarthRadiiVec3[];
  impact: EarthRadiiVec3 | null;
  apoapsis: EarthRadiiVec3 | null;
  periapsis: EarthRadiiVec3 | null;
  apoLabel: string | null;
  periLabel: string | null;
}

function decimate(points: readonly EarthRadiiVec3[], max: number): EarthRadiiVec3[] {
  if (points.length <= max) return points.slice();
  if (max <= 0) return [];
  if (max === 1) return [points[points.length - 1]];
  const out: EarthRadiiVec3[] = [];
  const last = points.length - 1;
  for (let i = 0; i < max; i += 1) out.push(points[Math.round((i * last) / (max - 1))]);
  return out;
}

function pushTrail(buffer: EarthRadiiVec3[], point: EarthRadiiVec3) {
  const last = buffer[buffer.length - 1];
  if (last) {
    const dx = point[0] - last[0];
    const dy = point[1] - last[1];
    const dz = point[2] - last[2];
    if (dx * dx + dy * dy + dz * dz < MIN_STEP * MIN_STEP) return;
  }
  buffer.push([point[0], point[1], point[2]]);
  if (buffer.length <= TRAIL_STORE_MAX) return;
  const kept = decimate(buffer, Math.floor(TRAIL_STORE_MAX / 2));
  buffer.length = 0;
  for (const sample of kept) buffer.push(sample);
}

function lift(points: readonly EarthRadiiVec3[]): EarthRadiiVec3[] {
  const raw: EarthRadiiVec3[] = [];
  for (const point of points) {
    const radius = Math.hypot(point[0], point[1], point[2]);
    if (radius < 1e-6) continue;
    const scale = SURFACE_LIFT / radius;
    const next: EarthRadiiVec3 = [point[0] * scale, point[1] * scale, point[2] * scale];
    const prev = raw[raw.length - 1];
    if (prev) {
      const dx = next[0] - prev[0];
      const dy = next[1] - prev[1];
      const dz = next[2] - prev[2];
      if (dx * dx + dy * dy + dz * dz < 1e-6) continue;
    }
    raw.push(next);
  }
  return decimate(raw, LINE_CAPACITY);
}

function project(state: OrbitPathState, trail: readonly EarthRadiiVec3[] | undefined, memory: EarthRadiiVec3[]): PathSnap {
  const predicted = state.points.length ? decimate(state.points, LINE_CAPACITY) : [];
  let flown: readonly EarthRadiiVec3[];
  if (trail) {
    flown = decimate(trail, TRAIL_DRAW_MAX);
  } else {
    const head = state.points[0];
    if (head) pushTrail(memory, head);
    flown = decimate(memory, TRAIL_DRAW_MAX);
  }
  const last = predicted[predicted.length - 1] ?? null;
  return {
    predicted,
    flown,
    groundPredicted: lift(predicted),
    groundFlown: lift(flown),
    impact: state.hitsEarth && last ? last : null,
    apoapsis: state.apoapsis,
    periapsis: state.periapsis,
    apoLabel: apsisLabel("apoapsis", state.elements.apoapsisAltitudeM ?? Number.NaN),
    periLabel: apsisLabel("periapsis", state.elements.periapsisAltitudeM ?? Number.NaN),
  };
}

function samePoint(a: EarthRadiiVec3 | null | undefined, b: EarthRadiiVec3 | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function sameSnap(a: PathSnap, b: PathSnap): boolean {
  return a.predicted.length === b.predicted.length
    && a.flown.length === b.flown.length
    && a.apoLabel === b.apoLabel
    && a.periLabel === b.periLabel
    && samePoint(a.predicted[0], b.predicted[0])
    && samePoint(a.predicted[a.predicted.length - 1], b.predicted[b.predicted.length - 1])
    && samePoint(a.flown[a.flown.length - 1], b.flown[b.flown.length - 1])
    && samePoint(a.impact, b.impact)
    && samePoint(a.apoapsis, b.apoapsis)
    && samePoint(a.periapsis, b.periapsis);
}

/** Uploads the provided samples at 10 Hz. The first upload is immediate. */
export function useOrbitMap(state: OrbitPathState, trail: readonly EarthRadiiVec3[] | undefined): PathSnap {
  const stateRef = useRef(state);
  const trailRef = useRef(trail);
  stateRef.current = state;
  trailRef.current = trail;
  const memory = useRef<EarthRadiiVec3[]>([]);
  const lastMs = useRef(Number.NEGATIVE_INFINITY);
  const [snap, setSnap] = useState<PathSnap>(() => project(state, trail, memory.current));

  const publish = useCallback((force: boolean) => {
    const now = performance.now();
    if (!force && !shouldRefresh(lastMs.current, now)) return;
    lastMs.current = now;
    const next = project(stateRef.current, trailRef.current, memory.current);
    setSnap((prev) => (sameSnap(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    publish(true);
  }, [publish]);

  useFrame(() => {
    publish(false);
  });

  return snap;
}
