"use client";
// Ghost path and corridor edges, on the launch-site globe. Sibling of Earth, never inside it.
// The impact burst is the Explosion module.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MISSIONS } from "@/data/missions/index";
import { useAppMode } from "@/lib/flight/app-mode";
import { CORRIDOR } from "@/lib/flight/corridor";
import { launchSiteFor } from "@/lib/flight/launch-site";
import { missionById } from "@/lib/flight/mission-select";
import { corridorEdges, referencePath } from "@/lib/flight/reference";
import { earthRadiiToScene, globeFrameFor, physicsMetersToEarthRadii, type GlobeFrame } from "@/lib/flight/scene-types";
import { useScene } from "@/lib/store";
import type { Mission } from "@/lib/types";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

const EMPTY: { x: number; y: number }[] = [];

function siteText(mission: Mission | null): string | null {
  if (!mission) return null;
  const extra = mission as Mission & { launchSite?: { text?: string } };
  return typeof extra.launchSite?.text === "string" ? extra.launchSite.text : null;
}

function makeLine(points: { x: number; y: number }[], color: string, frame: GlobeFrame): THREE.Line {
  const data = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    const [x, y, z] = earthRadiiToScene(physicsMetersToEarthRadii(point.x, point.y, frame));
    data[index * 3] = x;
    data[index * 3 + 1] = y;
    data[index * 3 + 2] = z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data, 3));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

export function GuidanceMarks() {
  const playMode = useScene((s) => s.playMode);
  const trackId = useScene((s) => s.missionTrackId);
  const replayId = useScene((s) => s.replay.missionId);
  const mode = useAppMode((s) => s.mode);
  const corridorOn = useScene((s) => s.playMode === "mission" && s.flight.guide?.corridor === true);
  const trail = useScene((s) => (s.warningLevel === "failed" ? s.flight.guide?.trail ?? EMPTY : EMPTY));
  const mission = mode === "replay"
    ? missionById(MISSIONS, replayId)
    : playMode === "mission"
      ? missionById(MISSIONS, trackId)
      : null;
  const reference = mission?.reference;
  const frame = useMemo(
    () => globeFrameFor(launchSiteFor({ missionId: mission?.id ?? null, launchSiteText: siteText(mission) })),
    [mission],
  );
  const marks = useMemo(() => {
    const objects: THREE.Line[] = [];
    if (corridorOn) {
      const ghost = referencePath(reference);
      const edges = corridorEdges(reference, CORRIDOR.altM);
      if (ghost && ghost.length > 1) objects.push(makeLine(ghost, FLIGHT_SCENE.path, frame));
      if (edges) {
        objects.push(makeLine(edges.inner, FLIGHT_SCENE.pathHit, frame));
        objects.push(makeLine(edges.outer, FLIGHT_SCENE.pathHit, frame));
      }
    }
    if (trail.length > 1) objects.push(makeLine(trail, FLIGHT_SCENE.boom, frame));
    return objects;
  }, [corridorOn, reference, trail, frame]);

  useEffect(() => () => {
    marks.forEach((item) => {
      item.geometry.dispose();
      const material = item.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }, [marks]);

  return (
    <>
      {marks.map((item, index) => (
        <primitive key={`${index}-${item.uuid}`} object={item} />
      ))}
    </>
  );
}
