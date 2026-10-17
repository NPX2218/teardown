"use client";
// Ghost path, corridor edges, and the impact burst. Sibling of Earth, never inside it.
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { MISSIONS } from "@/data/missions/index";
import { CORRIDOR } from "@/lib/flight/corridor";
import { missionById } from "@/lib/flight/mission-select";
import { corridorEdges, referencePath } from "@/lib/flight/reference";
import { toScene } from "@/lib/flight/scene-scale";
import { useScene } from "@/lib/store";

const EMPTY: { x: number; y: number }[] = [];

function makeLine(points: { x: number; y: number }[], color: string): THREE.Line {
  const data = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    const [x, y, z] = toScene(point.x, point.y, 0);
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
  const corridorOn = useScene((s) => s.playMode === "mission" && s.flight.guide?.corridor === true);
  const trail = useScene((s) => (s.warningLevel === "failed" ? s.flight.guide?.trail ?? EMPTY : EMPTY));
  const impact = useScene((s) => s.impact);
  const mission = playMode === "mission" ? missionById(MISSIONS, trackId) : null;
  const reference = mission?.reference;
  const marks = useMemo(() => {
    const objects: THREE.Line[] = [];
    if (corridorOn) {
      const ghost = referencePath(reference);
      const edges = corridorEdges(reference, CORRIDOR.altM);
      if (ghost && ghost.length > 1) objects.push(makeLine(ghost, "#9ec7ff"));
      if (edges) {
        objects.push(makeLine(edges.inner, "#e7b3a2"));
        objects.push(makeLine(edges.outer, "#e7b3a2"));
      }
    }
    if (trail.length > 1) objects.push(makeLine(trail, "#e85d4c"));
    return objects;
  }, [corridorOn, reference, trail]);

  useEffect(() => () => {
    marks.forEach((item) => {
      item.geometry.dispose();
      const material = item.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }, [marks]);

  const burst = impact ? toScene(impact.x, impact.y, 0) : null;
  return (
    <>
      {marks.map((item, index) => (
        <primitive key={index} object={item} />
      ))}
      {burst && (
        <group position={burst}>
          <mesh>
            <sphereGeometry args={[0.07, 10, 10]} />
            <meshBasicMaterial color="#e85d4c" />
          </mesh>
          <mesh position={[0.05, 0.03, 0]}>
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshBasicMaterial color="#f0c36a" />
          </mesh>
          <mesh position={[-0.04, 0.02, 0.02]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color="#f4efe6" />
          </mesh>
        </group>
      )}
    </>
  );
}
