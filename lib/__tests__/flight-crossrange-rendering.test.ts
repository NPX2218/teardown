import { describe, expect, it } from "vitest";
import { EARTH_MU_M3_S2, EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { altitudeMetres, buildFlightDraw, type FlightDrawInput } from "@/lib/flight/flight-pose";
import { PHYSICS_PLANE_FRAME, physicsToEarth, toOrbitPathState } from "@/lib/flight/map/view";
import { predictOrbit, traceBehind, vectorFromFlightState, type StateVector } from "@/lib/flight/map/predict";
import { appendTrail, projectToSurface } from "@/lib/flight/map/trail";
import { STARBASE, globeFrameFor, physicsMetersToEarthRadii } from "@/lib/flight/scene-types";

const input: FlightDrawInput = {
  site: STARBASE, positionM: null, pitchRad: 0, throttle: 1, airborne: true,
  altitudeM: null, activeStageId: "booster", simulatedTimeS: 10, separatedAtS: null,
  path: null, pathClosed: false, pathHitsEarth: false,
  elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
};

// REGRESSION GUARD for the 2026-10-17 phone-steering report: side lean moved only the drawing.
describe("physical crossrange drawing", () => {
  it("R7: full physical twist survives drawing while its nose stays upright (PR #34 full orientation)", () => {
    const twist: [number, number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2, 0];
    const draw = buildFlightDraw({ ...input, positionM: { x: 0, y: EARTH_RADIUS_M }, attitudeQuat: twist } as FlightDrawInput);
    expect(draw.orientation).toBeDefined();
    const [w, x, y, z] = draw.orientation!;
    // The model's side axis must twist too, rather than reconstructing rotation from its nose alone.
    const side = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
    const frame = globeFrameFor(STARBASE);
    side.forEach((value, i) => expect(value).toBeCloseTo(-frame.right[i], 10));
    draw.nose.forEach((value, i) => expect(value).toBeCloseTo(frame.up[i], 10));
  });
  it("R1: preserves crossrange position and uses both actual lean angles (2026-10-17 report)", () => {
    const radius = EARTH_RADIUS_M + 200_000;
    const pitch = 0.2;
    const yaw = 0.3;
    const position = { x: 0, y: radius, z: 1234 };
    const pad = buildFlightDraw({ ...input, positionM: { x: 0, y: radius }, pitchRad: pitch, yawRad: yaw } as FlightDrawInput);
    const frame = globeFrameFor(STARBASE);
    const expected = physicsMetersToEarthRadii(Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw), frame, Math.cos(pitch) * Math.sin(yaw)).map((v) => v * EARTH_RADIUS_M);
    pad.nose.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 12));
    const draw = buildFlightDraw({ ...input, positionM: position });
    expect(draw.position).toEqual(physicsMetersToEarthRadii(position.x, position.y, frame, position.z));
    expect(altitudeMetres(position, null)).toBeCloseTo(Math.hypot(position.y, position.z) - EARTH_RADIUS_M, 8);
  });

  it("R2: maps crossrange path points into the same frame as the rocket (2026-10-17 report)", () => {
    const point = { x: 100, y: EARTH_RADIUS_M + 1000, z: 5000 };
    const draw = buildFlightDraw({ ...input, path: [point] });
    expect(draw.orbit.points[0]).toEqual(physicsMetersToEarthRadii(point.x, point.y, globeFrameFor(STARBASE), point.z));
    expect(physicsToEarth(point, PHYSICS_PLANE_FRAME)).toEqual([point.x / EARTH_RADIUS_M, point.y / EARTH_RADIUS_M, point.z / EARTH_RADIUS_M]);
  });
});

describe("crossrange orbital map", () => {
  it("R3: draws a circular orbit in its physical plane (2026-10-17 report)", () => {
    const radius = EARTH_RADIUS_M + 300_000;
    const speed = Math.sqrt(EARTH_MU_M3_S2 / radius);
    const vector = { x: 0, y: radius, z: 0, vx: 0, vy: 0, vz: speed } as StateVector;
    const orbit = toOrbitPathState(vector, PHYSICS_PLANE_FRAME);
    expect(orbit.closed).toBe(true);
    expect(orbit.hitsEarth).toBe(false);
    expect(orbit.elements.periapsisAltitudeM).toBeCloseTo(300_000, 5);
    expect(Math.max(...orbit.points.map((p) => Math.abs(p[2])))).toBeGreaterThan(1);
    for (const point of orbit.points) {
      expect(point[0]).toBeCloseTo(0, 10);
      expect(Math.hypot(...point)).toBeCloseTo(radius / EARTH_RADIUS_M, 10);
    }
  });

  it("R4: keeps 3D impact and radial coast points finite (2026-10-17 report)", () => {
    const vector = { x: 0, y: 0, z: EARTH_RADIUS_M + 1000, vx: 0, vy: 0, vz: -100 } as StateVector;
    const prediction = predictOrbit(vector);
    expect(prediction.kind).toBe("radial");
    expect(prediction.hitsSurface).toBe(true);
    const impact = prediction.impact as { x: number; y: number; z?: number };
    expect(impact.x).toBe(0);
    expect(impact.y).toBe(0);
    expect(impact.z).toBeCloseTo(EARTH_RADIUS_M, 8);
    const extracted = vectorFromFlightState({ positionM: { x: 1, y: 2, z: 3 }, velocityMps: { x: 4, y: 5, z: 6 } } as Parameters<typeof vectorFromFlightState>[0]);
    expect(extracted).toMatchObject({ z: 3, vz: 6 });
  });

  it("R5: rotating an eccentric orbit rotates its coast and flown history (2026-10-17 report)", () => {
    const radius = EARTH_RADIUS_M + 500_000;
    const speed = Math.sqrt(EARTH_MU_M3_S2 / radius) * 0.95;
    const angle = 0.7;
    const planar = { x: 0, y: radius, vx: speed, vy: 100 };
    const rotated = { ...planar, vx: speed * Math.cos(angle), vz: speed * Math.sin(angle) };
    for (const [original, actual] of [
      [predictOrbit(planar).predicted, predictOrbit(rotated).predicted],
      [traceBehind(planar, 0.4, 20), traceBehind(rotated, 0.4, 20)],
    ]) {
      expect(actual.length).toBe(original.length);
      original.forEach((point, i) => {
        expect(actual[i].x).toBeCloseTo(point.x * Math.cos(angle), 5);
        expect(actual[i].y).toBeCloseTo(point.y, 5);
        expect(actual[i].z).toBeCloseTo(point.x * Math.sin(angle), 5);
      });
    }
  });

  it("R6: crossrange-only trail motion survives sampling and surface projection (2026-10-17 report)", () => {
    const point = { x: 0, y: EARTH_RADIUS_M, z: 10_000 };
    const trail = appendTrail([{ x: 0, y: EARTH_RADIUS_M, z: 0 }], point, 100);
    expect(trail).toHaveLength(2);
    expect(trail[1].z).toBe(10_000);
    const surface = projectToSurface(point, 1)!;
    expect(Math.hypot(surface.x, surface.y, surface.z ?? 0)).toBeCloseTo(EARTH_RADIUS_M, 7);
    expect(surface.z).toBeGreaterThan(0);
    expect(vectorFromFlightState({ positionM: { x: 1, y: 2, z: NaN }, velocityMps: { x: 0, y: 0 } } as Parameters<typeof vectorFromFlightState>[0])).toBeNull();
  });
});
