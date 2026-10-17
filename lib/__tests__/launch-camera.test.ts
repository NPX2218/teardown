import { describe, expect, it } from "vitest";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { buildFlightDraw, stageIndex } from "@/lib/flight/flight-pose";
import {
  CHASE_RANGE_KNOTS,
  blendShots,
  chaseRangeM,
  chaseShot,
  cloudDeckOpacity,
  introBlend,
  mapShot,
  padShot,
  skyBlackness,
} from "@/lib/flight/launch-camera";
import { launchSiteFor } from "@/lib/flight/launch-site";
import {
  CAPE_SLC40,
  EARTH_RADIUS,
  STARBASE,
  VSFB_SLC4E,
  dot,
  earthRadiiToScene,
  eastNorthUp,
  globeFrameFor,
  length,
  noseFromPitch,
  physicsMetersToEarthRadii,
} from "@/lib/flight/scene-types";

describe("launch sites", () => {
  it("puts free flight and practice at Starbase and Sentinel-6 at Vandenberg", () => {
    expect(launchSiteFor({ missionId: null }).name).toBe(STARBASE.name);
    expect(launchSiteFor({ missionId: null }).lat).toBeCloseTo(25.997, 5);
    expect(launchSiteFor({ missionId: null }).lon).toBeCloseTo(-97.157, 5);
    expect(launchSiteFor({ missionId: "practice" }).name).toBe(STARBASE.name);
    expect(launchSiteFor({ missionId: "classroom" }).name).toBe(STARBASE.name);
    expect(launchSiteFor({ missionId: "sentinel-6-michael-freilich" }).name).toBe(VSFB_SLC4E.name);
    expect(launchSiteFor({ launchSiteText: "SLC-4E at Vandenberg" }).name).toBe(VSFB_SLC4E.name);
    const vsfb = globeFrameFor(VSFB_SLC4E);
    const north = eastNorthUp(VSFB_SLC4E.lat, VSFB_SLC4E.lon).north;
    expect(dot(vsfb.downrange, north)).toBeLessThan(0);
  });
});

describe("chase distance and sky", () => {
  it("matches the altitude knots and grows smoothly", () => {
    for (const [altitude, range] of CHASE_RANGE_KNOTS) {
      expect(chaseRangeM(altitude)).toBeCloseTo(range, 4);
    }
    expect(chaseRangeM(-20)).toBe(CHASE_RANGE_KNOTS[0][1]);
    expect(chaseRangeM(10_000)).toBeGreaterThan(chaseRangeM(0));
    expect(chaseRangeM(60_000)).toBeGreaterThan(chaseRangeM(10_000));
    expect(chaseRangeM(200_000)).toBeGreaterThan(chaseRangeM(60_000));
    expect(chaseRangeM(2_000_000)).toBeGreaterThan(EARTH_RADIUS_M * 2);
    const mid = 20_000;
    const geometric = Math.sqrt(250 * 300);
    expect(chaseRangeM(mid)).toBeGreaterThan(250);
    expect(chaseRangeM(mid)).toBeLessThan(300);
    expect(chaseRangeM(mid)).not.toBeCloseTo(geometric, 1);
  });

  it("fades the sky from blue to black by 100 km and the clouds by 22 km", () => {
    expect(skyBlackness(0)).toBe(0);
    expect(skyBlackness(50)).toBeCloseTo(0.5, 5);
    expect(skyBlackness(100)).toBe(1);
    expect(skyBlackness(400)).toBe(1);
    expect(cloudDeckOpacity(0)).toBeGreaterThan(0.5);
    expect(cloudDeckOpacity(8)).toBe(cloudDeckOpacity(0));
    expect(cloudDeckOpacity(22)).toBe(0);
    expect(cloudDeckOpacity(15)).toBeLessThan(cloudDeckOpacity(8));
  });
});

describe("camera shots", () => {
  const frame = globeFrameFor(CAPE_SLC40);

  it("starts the map on the whole globe and the pad a few metres off the ground", () => {
    expect(mapShot().position).toEqual([14, 8, 14]);
    expect(mapShot().fov).toBe(42);
    const pad = padShot(frame);
    const radius = length(pad.position);
    const eyeHeightM = (radius - EARTH_RADIUS) / 1e-6;
    expect(eyeHeightM).toBeGreaterThan(60);
    expect(eyeHeightM).toBeLessThan(180);
    const site = earthRadiiToScene(frame.up);
    const offsetM = Math.hypot(pad.position[0] - site[0], pad.position[1] - site[1], pad.position[2] - site[2]) / 1e-6;
    expect(offsetM).toBeGreaterThan(200);
    expect(offsetM).toBeLessThan(500);
    expect(pad.target[1]).toBeGreaterThan(site[1]);
  });

  it("views the Starbase pad from behind, pilot right, and above, aimed at the stack", () => {
    const siteFrame = globeFrameFor(STARBASE);
    const pad = padShot(siteFrame);
    const site = earthRadiiToScene(siteFrame.up);
    const offset = [
      pad.position[0] - site[0],
      pad.position[1] - site[1],
      pad.position[2] - site[2],
    ] as const;
    const aim = [
      pad.target[0] - site[0],
      pad.target[1] - site[1],
      pad.target[2] - site[2],
    ] as const;
    expect(dot(offset, siteFrame.downrange)).toBeLessThan(0);
    expect(dot(offset, siteFrame.right)).toBeGreaterThan(0);
    expect(dot(offset, siteFrame.up)).toBeGreaterThan(0);
    expect(dot(aim, siteFrame.right)).toBeCloseTo(0, 9);
    expect(dot(aim, siteFrame.up) / 1e-6).toBeCloseTo(35.6, 3);
    const chase = chaseShot({
      frame: siteFrame,
      position: physicsMetersToEarthRadii(0, EARTH_RADIUS_M, siteFrame),
      nose: noseFromPitch(siteFrame, 0),
      altitudeM: 0,
    });
    const chaseHeightM = (length(chase.position) - EARTH_RADIUS) / 1e-6;
    expect(chaseHeightM).toBeGreaterThan(40);
    expect(dot(
      [chase.position[0] - site[0], chase.position[1] - site[1], chase.position[2] - site[2]],
      siteFrame.downrange,
    )).toBeLessThan(0);
  });

  it("pulls the chase camera back a little in the climb and to the globe in high orbit", () => {
    const onPad = physicsMetersToEarthRadii(0, EARTH_RADIUS_M, frame);
    const low = chaseShot({ frame, position: onPad, nose: noseFromPitch(frame, 0), altitudeM: 0 });
    const highPos = physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 200_000, frame);
    const high = chaseShot({ frame, position: highPos, nose: noseFromPitch(frame, 0.4), altitudeM: 200_000 });
    const lowGap = Math.hypot(low.position[0] - earthRadiiToScene(onPad)[0], low.position[1] - earthRadiiToScene(onPad)[1], low.position[2] - earthRadiiToScene(onPad)[2]);
    const highGap = Math.hypot(high.position[0] - earthRadiiToScene(highPos)[0], high.position[1] - earthRadiiToScene(highPos)[1], high.position[2] - earthRadiiToScene(highPos)[2]);
    expect(highGap).toBeGreaterThan(lowGap);
    expect(highGap).toBeLessThan(lowGap * 3);
    expect(length(high.position)).toBeGreaterThan(EARTH_RADIUS);
    const orbit = chaseShot({
      frame,
      position: physicsMetersToEarthRadii(0, EARTH_RADIUS_M + 2_000_000, frame),
      nose: noseFromPitch(frame, 1.2),
      altitudeM: 2_000_000,
    });
    expect(length(orbit.position)).toBeGreaterThan(EARTH_RADIUS * 2);
  });

  it("zooms from the map shot down to the pad", () => {
    const pad = padShot(frame);
    const start = blendShots(mapShot(), pad, introBlend(0));
    const end = blendShots(mapShot(), pad, introBlend(2.6));
    expect(start.position[0]).toBeCloseTo(14, 6);
    expect(end.position[0]).toBeCloseTo(pad.position[0], 5);
    expect(introBlend(1.3)).toBeGreaterThan(0.4);
    expect(introBlend(1.3)).toBeLessThan(0.6);
  });
});

describe("physics to globe pose", () => {
  it("stands the stack on the Cape and pitches the nose downrange", () => {
    const draw = buildFlightDraw({
      site: CAPE_SLC40,
      positionM: null,
      pitchRad: 0,
      throttle: 0,
      airborne: false,
      altitudeM: 0,
      activeStageId: "booster",
      simulatedTimeS: 0,
      separatedAtS: null,
      path: null,
      pathClosed: false,
      pathHitsEarth: false,
      elements: { periapsisAltitudeM: null, apoapsisAltitudeM: null, eccentricity: null, bound: false },
    });
    const frame = globeFrameFor(CAPE_SLC40);
    expect(draw.stage).toBe(0);
    expect(draw.altitudeKm).toBe(0);
    expect(draw.position[0]).toBeCloseTo(frame.up[0], 6);
    expect(draw.nose[2]).toBeCloseTo(frame.up[2], 6);
    expect(draw.orbit.points).toEqual([]);
    expect(stageIndex("upper")).toBe(1);

    const flying = buildFlightDraw({
      ...draw,
      site: CAPE_SLC40,
      positionM: { x: 50_000, y: EARTH_RADIUS_M + 12_000 },
      pitchRad: 0.4,
      throttle: 1,
      airborne: true,
      altitudeM: 12_000,
      activeStageId: "upper",
      simulatedTimeS: 160,
      separatedAtS: 150,
      path: [
        { x: 0, y: EARTH_RADIUS_M },
        { x: 50_000, y: EARTH_RADIUS_M + 12_000 },
      ],
      pathClosed: false,
      pathHitsEarth: true,
      elements: { periapsisAltitudeM: -1000, apoapsisAltitudeM: 20_000, eccentricity: 1.2, bound: false },
    });
    expect(flying.stage).toBe(1);
    expect(flying.elapsedS).toBeCloseTo(10, 6);
    expect(flying.altitudeKm).toBeCloseTo(12, 3);
    expect(flying.orbit.points).toHaveLength(2);
    expect(flying.orbit.hitsEarth).toBe(true);
    expect(dot(flying.nose, frame.downrange)).toBeGreaterThan(0.3);
  });
});
