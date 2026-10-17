"use client";
// Reads the flight store once per frame and builds the plain draw props.
import { FLIGHT_SCENARIOS } from "@/data/flight/index";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { CLASSROOM_SCENARIOS } from "@/lib/flight/classroom";
import { buildFlightDraw, stageIndex, type FlightDraw } from "@/lib/flight/flight-pose";
import { launchSiteFor } from "@/lib/flight/launch-site";
import { frameFromLatLon, toOrbitPathState, vectorFromFlightState } from "@/lib/flight/map";
import { bodyFromFlightState, coastPreview, orbitFromState, type OrbitElements } from "@/lib/flight.helpers";
import type { LaunchSiteSpec, OrbitElementsView, OrbitPathState } from "@/lib/flight/scene-types";
import { illustratedTrack, replayPose } from "@/lib/replay";
import { useScene } from "@/lib/store";
import type { FlightScenario, FlightState, Mission } from "@/lib/types";

const EMPTY_ELEMENTS: OrbitElementsView = {
  periapsisAltitudeM: null,
  apoapsisAltitudeM: null,
  eccentricity: null,
  bound: false,
};

let separated: { key: string; t: number } | null = null;

function scenarioFor(id: string | null): FlightScenario | null {
  if (!id) return null;
  if (Object.prototype.hasOwnProperty.call(FLIGHT_SCENARIOS, id)) return FLIGHT_SCENARIOS[id] ?? null;
  if (Object.prototype.hasOwnProperty.call(CLASSROOM_SCENARIOS, id)) return CLASSROOM_SCENARIOS[id] ?? null;
  return null;
}

function missionFor(id: string | null): Mission | null {
  if (!id || !Object.prototype.hasOwnProperty.call(MISSIONS, id)) return null;
  return MISSIONS[id] ?? null;
}

function siteText(mission: Mission | null): string | null {
  if (!mission) return null;
  const extra = mission as Mission & { launchSite?: { text?: string } };
  return typeof extra.launchSite?.text === "string" ? extra.launchSite.text : null;
}

function coastAtSite(site: LaunchSiteSpec, state: FlightState | null): OrbitPathState | null {
  const vector = vectorFromFlightState(state);
  if (!vector || !state?.airborne) return null;
  const frame = frameFromLatLon(site.lat, site.lon, site.azimuthDeg ?? 90);
  return toOrbitPathState(vector, frame);
}

function elementsOf(orbit: OrbitElements): OrbitElementsView {
  return {
    periapsisAltitudeM: orbit.periapsisAltitudeM,
    apoapsisAltitudeM: orbit.apoapsisAltitudeM,
    eccentricity: orbit.eccentricity,
    bound: orbit.bound,
  };
}

export function readFlightDraw(): FlightDraw {
  const mode = useAppMode.getState().mode;
  const scene = useScene.getState();
  const replayMission = mode === "replay" ? missionFor(scene.replay.missionId) : null;
  const tracked = scene.playMode === "mission" ? missionFor(scene.missionTrackId) : null;
  const mission = replayMission ?? tracked;
  const site = launchSiteFor({ missionId: mission?.id ?? null, launchSiteText: siteText(mission) });

  const steered = scene.flight.status !== "idle";
  if (replayMission && !steered) {
    const pose = replayPose(replayMission, scene.replay.t);
    const sep = replayMission.events.find((event) => event.id === "stage_sep" || event.id === "staging");
    const stageId = sep && pose.t >= sep.t ? "upper" : "booster";
    return buildFlightDraw({
      site,
      positionM: { x: pose.x, y: pose.y },
      pitchRad: pose.pitchRad,
      throttle: pose.flame ? 1 : 0,
      airborne: pose.t > 0.05 || pose.schematicAltitudeM > 1,
      altitudeM: pose.schematicAltitudeM,
      activeStageId: stageId,
      simulatedTimeS: pose.t,
      separatedAtS: sep && pose.t >= sep.t ? sep.t : null,
      path: illustratedTrack(replayMission),
      pathClosed: false,
      pathHitsEarth: false,
      elements: EMPTY_ELEMENTS,
    });
  }

  const flight = scene.flight;
  const state = flight.state;
  const scenario = scenarioFor(flight.scenarioId);
  let path: { x: number; y: number }[] | null = null;
  let pathClosed = false;
  let pathHitsEarth = false;
  let elements = EMPTY_ELEMENTS;
  if (scenario && state?.positionM && state.velocityMps && state.airborne) {
    const body = bodyFromFlightState(scenario, state);
    const coast = coastPreview(body);
    path = coast.points;
    pathClosed = coast.closed;
    pathHitsEarth = coast.hitsEarth;
    elements = elementsOf(orbitFromState(body));
  }
  const stage = stageIndex(state?.activeStageId ?? "booster");
  const key = flight.runId ?? "pad";
  if (stage < 1) {
    if (separated?.key === key) separated = null;
  } else if (!separated || separated.key !== key) {
    separated = { key, t: flight.simulatedTimeS };
  }
  const draw = buildFlightDraw({
    site,
    positionM: state?.positionM ?? null,
    pitchRad: state?.pitchRad ?? flight.input.pitchRad,
    throttle: state?.throttle ?? flight.input.throttle,
    airborne: state?.airborne ?? false,
    altitudeM: flight.readout?.altitudeM ?? null,
    activeStageId: state?.activeStageId ?? "booster",
    simulatedTimeS: flight.simulatedTimeS,
    separatedAtS: stage >= 1 && separated?.key === key ? separated.t : null,
    path,
    pathClosed,
    pathHitsEarth,
    elements,
  });
  const coast = coastAtSite(site, state);
  return coast ? { ...draw, orbit: coast } : draw;
}
