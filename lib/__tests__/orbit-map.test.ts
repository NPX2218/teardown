import { describe, expect, it } from "vitest";
import { EARTH_MU_M3_S2, EARTH_RADIUS_M, coastPreview, orbitFromState, type FlightBody } from "@/lib/flight.helpers";
import {
  ELLIPSE_SAMPLES,
  LINE_CAPACITY,
  MAP_REFRESH_MS,
  SURFACE_LIFT,
  appendTrail,
  apsisLabel,
  decimatePath,
  groundTrack,
  PHYSICS_PLANE_FRAME,
  STARBASE,
  STARBASE_FRAME,
  frameFromLatLon,
  latLonToUnit,
  physicsToEarth,
  predictFromFlight,
  predictOrbit,
  projectToSurface,
  shouldRefresh,
  toOrbitPathState,
  traceBehind,
  trailToEarth,
  vectorFromFlightState,
  type StateVector,
} from "@/lib/flight/map";
import type { FlightState } from "@/lib/types";

function radiusOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x, point.y);
}

function radiusOf3(point: readonly [number, number, number]): number {
  return Math.hypot(point[0], point[1], point[2]);
}

function ellipseVector(periAltM: number, apoAltM: number, nu = 0): StateVector {
  const rp = EARTH_RADIUS_M + periAltM;
  const ra = EARTH_RADIUS_M + apoAltM;
  const axis = (rp + ra) / 2;
  const eccentricity = (ra - rp) / (ra + rp);
  const p = axis * (1 - eccentricity * eccentricity);
  const radius = p / (1 + eccentricity * Math.cos(nu));
  const h = -Math.sqrt(EARTH_MU_M3_S2 * p);
  const muOverH = EARTH_MU_M3_S2 / h;
  const vPeri = -muOverH * Math.sin(nu);
  const vQ = muOverH * (eccentricity + Math.cos(nu));
  return {
    x: radius * Math.sin(nu),
    y: radius * Math.cos(nu),
    vx: vQ,
    vy: vPeri,
  };
}

function metresApart(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("orbit map labels", () => {
  it("writes Ap 212 km and Pe 180 km in sentence case", () => {
    expect(apsisLabel("apoapsis", 212_000)).toBe("Ap 212 km");
    expect(apsisLabel("periapsis", 180_000)).toBe("Pe 180 km");
    expect(apsisLabel("apoapsis", 50_400)).toBe("Ap 50.4 km");
    expect(apsisLabel("periapsis", -20_000)).toBeNull();
    expect(apsisLabel("apoapsis", Number.NaN)).toBeNull();
  });
});

describe("ellipse from state vectors", () => {
  it("builds a closed 180 km by 212 km ellipse with Ap and Pe on opposite sides", () => {
    const state = ellipseVector(180_000, 212_000);
    const predicted = predictOrbit(state);
    const elements = orbitFromState(state);

    expect(predicted.kind).toBe("ellipse");
    expect(predicted.closed).toBe(true);
    expect(predicted.hitsSurface).toBe(false);
    expect(predicted.impact).toBeNull();
    expect(predicted.predicted.length).toBe(ELLIPSE_SAMPLES + 1);
    expect(predicted.predicted.length).toBeLessThanOrEqual(LINE_CAPACITY);

    expect(predicted.periapsis?.altitudeM).toBeCloseTo(180_000, 0);
    expect(predicted.apoapsis?.altitudeM).toBeCloseTo(212_000, 0);
    expect(predicted.periapsis?.label).toBe("Pe 180 km");
    expect(predicted.apoapsis?.label).toBe("Ap 212 km");
    expect(predicted.periapsis?.visible).toBe(true);
    expect(predicted.apoapsis?.visible).toBe(true);
    expect(elements.periapsisAltitudeM).toBeCloseTo(predicted.periapsis?.altitudeM ?? 0, 0);
    expect(elements.apoapsisAltitudeM).toBeCloseTo(predicted.apoapsis?.altitudeM ?? 0, 0);

    expect(metresApart(predicted.predicted[0], state)).toBeLessThan(1);
    expect(metresApart(predicted.predicted[predicted.predicted.length - 1], state)).toBeLessThan(1);
    expect(metresApart(predicted.periapsis!.position, { x: 0, y: EARTH_RADIUS_M + 180_000 })).toBeLessThan(1);
    expect(metresApart(predicted.apoapsis!.position, { x: 0, y: -(EARTH_RADIUS_M + 212_000) })).toBeLessThan(1);

    const rp = EARTH_RADIUS_M + 180_000;
    const ra = EARTH_RADIUS_M + 212_000;
    for (const point of predicted.predicted) {
      const radius = radiusOf(point);
      expect(radius).toBeGreaterThanOrEqual(rp - 1);
      expect(radius).toBeLessThanOrEqual(ra + 1);
    }
    expect(predicted.predicted[1].x).toBeLessThan(0);

    const prograde = { x: 0, y: rp, vx: Math.sqrt(EARTH_MU_M3_S2 * (2 / rp - 1 / ((rp + ra) / 2))), vy: 0 };
    expect(predictOrbit(prograde).predicted[1].x).toBeGreaterThan(0);
  });

  it("keeps a circular orbit on one radius and still names both apsides", () => {
    const altitude = 400_000;
    const radius = EARTH_RADIUS_M + altitude;
    const speed = Math.sqrt(EARTH_MU_M3_S2 / radius);
    const state = { x: 0, y: radius, vx: speed, vy: 0 };
    const predicted = predictOrbit(state);
    expect(predicted.kind).toBe("ellipse");
    expect(predicted.closed).toBe(true);
    expect(predicted.periapsis?.altitudeM).toBeCloseTo(altitude, 0);
    expect(predicted.apoapsis?.altitudeM).toBeCloseTo(altitude, 0);
    expect(predicted.periapsis?.label).toBe("Pe 400 km");
    expect(predicted.apoapsis?.label).toBe("Ap 400 km");
    for (const point of predicted.predicted) {
      expect(radiusOf(point)).toBeCloseTo(radius, 0);
    }
  });

  it("round-trips a point that is not an apsis, including the opposite sense", () => {
    const state = ellipseVector(200_000, 900_000, 1.1);
    const predicted = predictOrbit(state);
    expect(predicted.kind).toBe("ellipse");
    expect(metresApart(predicted.predicted[0], state)).toBeLessThan(1);
    expect(predicted.periapsis?.altitudeM).toBeCloseTo(200_000, 0);
    expect(predicted.apoapsis?.altitudeM).toBeCloseTo(900_000, 0);
    expect(orbitFromState(state).periapsisAltitudeM).toBeCloseTo(200_000, 0);

    const retrograde = { ...state, vx: -state.vx, vy: -state.vy };
    const back = predictOrbit(retrograde);
    expect(back.kind).toBe("ellipse");
    expect(metresApart(back.predicted[0], retrograde)).toBeLessThan(1);
    expect(back.predicted[1].x).not.toBeCloseTo(predicted.predicted[1].x, 0);
    expect(back.periapsis?.altitudeM).toBeCloseTo(200_000, 0);
    expect(back.apoapsis?.altitudeM).toBeCloseTo(900_000, 0);
  });

  it("samples the flown arc behind the vessel on the same ellipse", () => {
    const state = ellipseVector(180_000, 212_000, 0.4);
    const trail = traceBehind(state, 0.7, 40);
    expect(trail.length).toBeGreaterThan(10);
    expect(trail.length).toBeLessThanOrEqual(LINE_CAPACITY);
    expect(metresApart(trail[trail.length - 1], state)).toBeLessThan(1);
    const rp = EARTH_RADIUS_M + 180_000;
    const ra = EARTH_RADIUS_M + 212_000;
    for (const point of trail) {
      expect(radiusOf(point)).toBeGreaterThanOrEqual(rp - 1);
      expect(radiusOf(point)).toBeLessThanOrEqual(ra + 1);
    }
  });
});

describe("impact point", () => {
  it("ends a suborbital ellipse on the surface and keeps apoapsis above it", () => {
    const apoapsis = EARTH_RADIUS_M + 500_000;
    const periapsis = EARTH_RADIUS_M * 0.5;
    const axis = (apoapsis + periapsis) / 2;
    const speed = Math.sqrt(EARTH_MU_M3_S2 * (2 / apoapsis - 1 / axis));
    const state = { x: 0, y: apoapsis, vx: speed, vy: 0 };
    const predicted = predictOrbit(state);
    const elements = orbitFromState(state);

    expect(predicted.kind).toBe("ballistic");
    expect(predicted.closed).toBe(false);
    expect(predicted.hitsSurface).toBe(true);
    expect(predicted.impact).not.toBeNull();
    expect(radiusOf(predicted.impact!)).toBeCloseTo(EARTH_RADIUS_M, 0);
    expect(predicted.impact!.x).toBeGreaterThan(0);
    expect(predicted.apoapsis?.visible).toBe(true);
    expect(predicted.apoapsis?.label).toBe("Ap 500 km");
    expect(predicted.periapsis?.visible).toBe(false);
    expect(predicted.periapsis?.label).toBeNull();
    expect(elements.intersectsEarth).toBe(true);
    expect(predicted.apoapsis?.altitudeM).toBeCloseTo(elements.apoapsisAltitudeM ?? 0, 0);
    expect(metresApart(predicted.predicted[0], state)).toBeLessThan(1);

    for (const point of predicted.predicted) {
      expect(radiusOf(point)).toBeGreaterThanOrEqual(EARTH_RADIUS_M - 1);
      expect(radiusOf(point)).toBeLessThanOrEqual(apoapsis + 1);
    }
    expect(predicted.predicted.length).toBeLessThanOrEqual(LINE_CAPACITY);
    expect(conicRadiusAt(state, predicted.impact!)).toBeCloseTo(EARTH_RADIUS_M, 0);
    expect(coastPreview(state as FlightBody).hitsEarth).toBe(true);
  });

  it("drops a radial fall onto the pad and a radial hop back to the same meridian", () => {
    const falling = predictOrbit({ x: 0, y: EARTH_RADIUS_M + 150_000, vx: 0, vy: -80 });
    expect(falling.kind).toBe("radial");
    expect(falling.hitsSurface).toBe(true);
    expect(falling.impact?.x).toBeCloseTo(0, 0);
    expect(falling.impact?.y).toBeCloseTo(EARTH_RADIUS_M, 0);
    expect(falling.predicted.every((point) => Math.abs(point.x) < 1)).toBe(true);

    const radius = EARTH_RADIUS_M + 400_000;
    const speed = Math.sqrt(EARTH_MU_M3_S2 / radius);
    const hop = predictOrbit({ x: 0, y: radius, vx: 0, vy: speed });
    const energy = speed * speed / 2 - EARTH_MU_M3_S2 / radius;
    const apoRadius = -EARTH_MU_M3_S2 / energy;
    expect(hop.kind).toBe("radial");
    expect(hop.hitsSurface).toBe(true);
    expect(hop.impact?.y).toBeCloseTo(EARTH_RADIUS_M, 0);
    expect(hop.apoapsis?.radiusM).toBeCloseTo(apoRadius, 0);
    expect(hop.apoapsis?.visible).toBe(true);
    expect(Math.max(...hop.predicted.map(radiusOf))).toBeCloseTo(apoRadius, 0);
    expect(orbitFromState({ x: 0, y: radius, vx: 0, vy: speed }).intersectsEarth).toBe(true);
  });

  it("marks a hyperbola that misses and one that meets the ground", () => {
    const radius = EARTH_RADIUS_M + 400_000;
    const escape = Math.sqrt((2 * EARTH_MU_M3_S2) / radius) * 1.05;
    const miss = predictOrbit({ x: 0, y: radius, vx: escape, vy: 0 });
    expect(miss.kind).toBe("escape");
    expect(miss.hitsSurface).toBe(false);
    expect(miss.impact).toBeNull();
    expect(miss.apoapsis).toBeNull();
    expect(miss.periapsis?.visible).toBe(true);
    expect(miss.periapsis?.altitudeM).toBeCloseTo(orbitFromState({ x: 0, y: radius, vx: escape, vy: 0 }).periapsisAltitudeM ?? 0, 0);
    expect(miss.predicted.length).toBeGreaterThan(8);
    expect(miss.predicted.length).toBeLessThanOrEqual(LINE_CAPACITY);
    expect(Math.max(...miss.predicted.map(radiusOf))).toBeGreaterThan(radius);

    const escapeSpeed = Math.sqrt((2 * EARTH_MU_M3_S2) / radius);
    const hitState = { x: 0, y: radius, vx: escapeSpeed * 0.45, vy: -escapeSpeed * 1.05 };
    const hit = predictOrbit(hitState);
    expect(orbitFromState(hitState).bound).toBe(false);
    expect(hit.hitsSurface).toBe(true);
    expect(hit.impact).not.toBeNull();
    expect(radiusOf(hit.impact!)).toBeCloseTo(EARTH_RADIUS_M, 0);
    expect(hit.predicted.every((point) => radiusOf(point) >= EARTH_RADIUS_M - 1)).toBe(true);
    expect(conicRadiusAt(hitState, hit.impact!)).toBeCloseTo(EARTH_RADIUS_M, 0);
  });

  it("rejects empty, non-finite, and underground-origin vectors", () => {
    expect(predictOrbit({ x: Number.NaN, y: 0, vx: 0, vy: 0 }).kind).toBe("none");
    expect(predictOrbit({ x: 0, y: 0, vx: 1, vy: 0 }).kind).toBe("none");
    expect(predictOrbit({ x: 0, y: EARTH_RADIUS_M, vx: Number.POSITIVE_INFINITY, vy: 0 }).kind).toBe("none");
    expect(predictFromFlight(null).kind).toBe("none");
    expect(vectorFromFlightState(null)).toBeNull();
    expect(vectorFromFlightState(padState())).toBeNull();
    const aloft = vectorFromFlightState(flightState({ x: 1, y: 2, vx: 3, vy: 4 }));
    expect(aloft).toEqual({ x: 1, y: 2, vx: 3, vy: 4 });
  });
});

describe("earth-radii path passed to OrbitPath", () => {
  it("maps the 180 km by 212 km ellipse onto the unit globe", () => {
    const state = ellipseVector(180_000, 212_000);
    const view = toOrbitPathState(state, PHYSICS_PLANE_FRAME);
    const rp = (EARTH_RADIUS_M + 180_000) / EARTH_RADIUS_M;
    const ra = (EARTH_RADIUS_M + 212_000) / EARTH_RADIUS_M;

    expect(view.closed).toBe(true);
    expect(view.hitsEarth).toBe(false);
    expect(view.points).toHaveLength(ELLIPSE_SAMPLES + 1);
    expect(view.elements.periapsisAltitudeM).toBeCloseTo(180_000, 0);
    expect(view.elements.apoapsisAltitudeM).toBeCloseTo(212_000, 0);
    expect(view.elements.bound).toBe(true);
    expect(view.periapsis).not.toBeNull();
    expect(view.apoapsis).not.toBeNull();
    expect(view.periapsis?.[0]).toBeCloseTo(0, 5);
    expect(view.periapsis?.[1]).toBeCloseTo(rp, 5);
    expect(view.apoapsis?.[1]).toBeCloseTo(-ra, 5);
    expect(radiusOf3(view.points[0])).toBeCloseTo(rp, 5);
    for (const point of view.points) {
      const radius = radiusOf3(point);
      expect(radius).toBeGreaterThanOrEqual(rp - 1e-6);
      expect(radius).toBeLessThanOrEqual(ra + 1e-6);
    }

    const trail = trailToEarth(state, 0.5, 24, PHYSICS_PLANE_FRAME);
    expect(trail.length).toBeGreaterThan(4);
    expect(radiusOf3(trail[trail.length - 1])).toBeCloseTo(radiusOf3(view.points[0]), 5);
  });

  it("puts a suborbital impact on the surface and drops the underground periapsis", () => {
    const apoapsis = EARTH_RADIUS_M + 500_000;
    const periapsis = EARTH_RADIUS_M * 0.5;
    const axis = (apoapsis + periapsis) / 2;
    const speed = Math.sqrt(EARTH_MU_M3_S2 * (2 / apoapsis - 1 / axis));
    const view = toOrbitPathState({ x: 0, y: apoapsis, vx: speed, vy: 0 }, PHYSICS_PLANE_FRAME);
    expect(view.hitsEarth).toBe(true);
    expect(view.closed).toBe(false);
    expect(view.periapsis).toBeNull();
    expect(view.apoapsis).not.toBeNull();
    expect(view.elements.periapsisAltitudeM).toBeLessThan(0);
    expect(view.elements.apoapsisAltitudeM).toBeCloseTo(500_000, 0);
    const impact = view.points[view.points.length - 1];
    expect(radiusOf3(impact)).toBeCloseTo(1, 5);
    expect(view.points.every((point) => radiusOf3(point) >= 1 - 1e-6)).toBe(true);
  });

  it("defaults the free-flight pad to Boca Chica and accepts any other lat/lon", () => {
    const pad = physicsToEarth({ x: 0, y: EARTH_RADIUS_M });
    const starbase = latLonToUnit(STARBASE.lat, STARBASE.lon);
    expect(STARBASE.lat).toBeCloseTo(25.997, 5);
    expect(STARBASE.lon).toBeCloseTo(-97.157, 5);
    expect(pad[0]).toBeCloseTo(starbase[0], 6);
    expect(pad[1]).toBeCloseTo(starbase[1], 6);
    expect(pad[2]).toBeCloseTo(starbase[2], 6);
    expect(STARBASE_FRAME.up[1]).toBeCloseTo(starbase[1], 6);

    const cape = frameFromLatLon(28.561941, -80.577357, 90);
    const capePad = physicsToEarth({ x: 0, y: EARTH_RADIUS_M }, cape);
    const capeUnit = latLonToUnit(28.561941, -80.577357);
    expect(capePad[0]).toBeCloseTo(capeUnit[0], 6);
    expect(capePad[1]).toBeCloseTo(capeUnit[1], 6);
    expect(capePad[2]).toBeCloseTo(capeUnit[2], 6);
    expect(Math.hypot(capePad[0] - pad[0], capePad[1] - pad[1], capePad[2] - pad[2])).toBeGreaterThan(0.2);

    const state = ellipseVector(180_000, 212_000);
    const atStarbase = toOrbitPathState(state);
    const inPlane = toOrbitPathState(state, PHYSICS_PLANE_FRAME);
    expect(atStarbase.closed).toBe(inPlane.closed);
    expect(atStarbase.points).toHaveLength(inPlane.points.length);
    expect(radiusOf3(atStarbase.points[0])).toBeCloseTo(radiusOf3(inPlane.points[0]), 5);
    expect(Math.hypot(
      atStarbase.points[0][0] - inPlane.points[0][0],
      atStarbase.points[0][1] - inPlane.points[0][1],
      atStarbase.points[0][2] - inPlane.points[0][2],
    )).toBeGreaterThan(0.2);

    const east = frameFromLatLon(0, 0, 90).downrange;
    expect(east[0]).toBeCloseTo(0, 5);
    expect(Math.abs(east[2])).toBeGreaterThan(0.9);
    const north = frameFromLatLon(0, 0, 0).downrange;
    expect(north[1]).toBeGreaterThan(0.9);
  });

  it("rotates the physics plane onto a supplied launch frame", () => {
    const frame = {
      up: [0, 0, 1] as const,
      downrange: [1, 0, 0] as const,
      right: [0, 1, 0] as const,
    };
    const placed = physicsToEarth({ x: 0, y: EARTH_RADIUS_M }, frame);
    expect(placed[0]).toBeCloseTo(0, 8);
    expect(placed[1]).toBeCloseTo(0, 8);
    expect(placed[2]).toBeCloseTo(1, 8);
    const moved = physicsToEarth({ x: EARTH_RADIUS_M, y: 0 }, frame);
    expect(moved[0]).toBeCloseTo(1, 8);
    expect(radiusOf3(moved)).toBeCloseTo(1, 8);
  });
});

describe("ground track, trail, and the 10 Hz gate", () => {
  it("projects the track onto a radius just above the sphere and keeps the angle", () => {
    const point = { x: 1_200_000, y: EARTH_RADIUS_M + 40_000 };
    const projected = projectToSurface(point);
    expect(projected).not.toBeNull();
    expect(radiusOf(projected!)).toBeCloseTo(EARTH_RADIUS_M * SURFACE_LIFT, 3);
    expect(Math.atan2(projected!.x, projected!.y)).toBeCloseTo(Math.atan2(point.x, point.y), 8);
    expect(projectToSurface({ x: 0, y: 0 })).toBeNull();
    expect(projectToSurface({ x: Number.NaN, y: 1 })).toBeNull();

    const track = groundTrack([
      { x: 0, y: EARTH_RADIUS_M + 200_000 },
      { x: 10, y: EARTH_RADIUS_M + 200_000 },
      { x: 800_000, y: EARTH_RADIUS_M },
    ]);
    expect(track.length).toBe(2);
    expect(track.every((sample) => Math.abs(radiusOf(sample) - EARTH_RADIUS_M * SURFACE_LIFT) < 1)).toBe(true);
    expect(groundTrack(Array.from({ length: 5_000 }, (_, i) => ({ x: i * 1_000, y: EARTH_RADIUS_M }))).length).toBeLessThanOrEqual(LINE_CAPACITY);
  });

  it("drops tiny steps, caps the store, and keeps both ends when decimating", () => {
    let trail = appendTrail([], { x: 0, y: 0 });
    const same = appendTrail(trail, { x: 10, y: 0 });
    expect(same).toBe(trail);
    trail = appendTrail(trail, { x: 3_000, y: 0 });
    expect(trail).toHaveLength(2);
    expect(appendTrail(trail, { x: Number.NaN, y: 0 })).toBe(trail);

    let long = appendTrail([], { x: 0, y: 0 }, 1, 4);
    for (let i = 1; i <= 6; i += 1) long = appendTrail(long, { x: i, y: 0 }, 1, 4);
    expect(long).toHaveLength(4);
    expect(long[0].x).toBe(3);
    expect(long[3].x).toBe(6);

    const dense = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }));
    const thin = decimatePath(dense, 11);
    expect(thin).toHaveLength(11);
    expect(thin[0]).toEqual(dense[0]);
    expect(thin[10]).toEqual(dense[99]);
    expect(decimatePath(dense, 100)).toHaveLength(100);
    expect(decimatePath(dense, 0)).toEqual([]);
  });

  it("refreshes on the first sample and then at most every 100 ms", () => {
    expect(shouldRefresh(Number.NEGATIVE_INFINITY, 0)).toBe(true);
    expect(shouldRefresh(Number.NaN, 50)).toBe(true);
    expect(shouldRefresh(0, MAP_REFRESH_MS - 1)).toBe(false);
    expect(shouldRefresh(0, MAP_REFRESH_MS)).toBe(true);
    expect(shouldRefresh(0, Number.NaN)).toBe(false);
    expect(shouldRefresh(0, 1_000, 0)).toBe(false);
  });

  it("fits a few hundred points and stays cheap enough for 10 Hz", () => {
    const state = ellipseVector(180_000, 2_000_000, 0.8);
    const started = performance.now();
    for (let i = 0; i < 200; i += 1) {
      const predicted = predictOrbit(state);
      expect(predicted.predicted.length).toBeLessThanOrEqual(LINE_CAPACITY);
    }
    expect(performance.now() - started).toBeLessThan(500);
  });
});

/** Orbit-equation radius at a point's true anomaly. Independent of predictOrbit. */
function conicRadiusAt(state: StateVector, point: { x: number; y: number }): number {
  const radius = Math.hypot(state.x, state.y);
  const radial = state.x * state.vx + state.y * state.vy;
  const speed2 = state.vx * state.vx + state.vy * state.vy;
  const h = state.x * state.vy - state.y * state.vx;
  const ex = ((speed2 - EARTH_MU_M3_S2 / radius) * state.x - radial * state.vx) / EARTH_MU_M3_S2;
  const ey = ((speed2 - EARTH_MU_M3_S2 / radius) * state.y - radial * state.vy) / EARTH_MU_M3_S2;
  const eccentricity = Math.hypot(ex, ey);
  const p = (h * h) / EARTH_MU_M3_S2;
  const pointRadius = Math.hypot(point.x, point.y);
  const cosNu = (ex * point.x + ey * point.y) / (eccentricity * pointRadius);
  return p / (1 + eccentricity * cosNu);
}

function padState(): FlightState {
  return flightState(null);
}

function flightState(position: { x: number; y: number; vx: number; vy: number } | null): FlightState {
  return {
    pitchRad: 0,
    throttle: 0,
    activeStageId: "upper",
    simulatedTimeS: 0,
    stages: [],
    payloadKg: 0,
    positionM: position ? { x: position.x, y: position.y } : null,
    velocityMps: position ? { x: position.vx, y: position.vy } : null,
    thrustOffS: 0,
    airborne: position !== null,
  };
}
