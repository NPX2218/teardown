"use client";
// Composes the Earth-radii group: site, sky, rocket, coast line, map labels.
import { useState } from "react";
import { useFrame } from "@react-three/fiber";
import { EARTH_SUN_DIRECTION } from "@/components/flight/earthShaders";
import { sunFromHorizon } from "@/components/flight/env/frame";
import { EARTH_RADIUS, globeFrameFor, physicsMetersToEarthRadii, type MapLabel } from "@/lib/flight/scene-types";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { Atmosphere } from "./env/Atmosphere";
import { LaunchSite } from "./env/LaunchSite";
import { flightDrawNow } from "./flightDraw";
import { CloudLayer } from "./fx/CloudLayer";
import { Explosion } from "./fx/Explosion";
import { MapOverlay } from "./map/MapOverlay";
import { OrbitPath } from "./map/OrbitPath";
import { readFlightDraw } from "./readFlightDraw";
import { Vehicle } from "./Vehicle";

export function KerbalWorld() {
  const [tick, setTick] = useState(0);
  const impact = useScene((s) => s.impact);
  const status = useScene((s) => s.flight.status);
  const view = useAppMode((s) => s.view);

  useFrame(() => {
    const bucket = Math.floor(performance.now() / 160);
    setTick((current) => (current === bucket ? current : bucket));
  });

  const draw = flightDrawNow.current ?? readFlightDraw();
  void tick;
  const labels: MapLabel[] = [
    { id: "site", text: draw.site.name, at: draw.up },
    { id: "rocket", text: "Rocket", at: draw.position },
  ];
  if (draw.orbit.periapsis && draw.orbit.elements.periapsisAltitudeM !== null) {
    labels.push({ id: "peri", text: "Lowest point", at: draw.orbit.periapsis });
  }
  if (draw.orbit.apoapsis && draw.orbit.elements.apoapsisAltitudeM !== null && draw.orbit.points.length > 2) {
    labels.push({ id: "apo", text: "Highest point", at: draw.orbit.apoapsis });
  }
  const boom = status === "crashed" && impact
    ? physicsMetersToEarthRadii(impact.x, impact.y, globeFrameFor(draw.site))
    : draw.position;
  const sun = draw.site.name === "Starbase"
    ? sunFromHorizon(draw.site.lat, draw.site.lon, 248, 12)
    : EARTH_SUN_DIRECTION;

  return (
    <group scale={EARTH_RADIUS}>
      <LaunchSite site={draw.site} launchCloudIntensity={draw.altitudeKm < 4 ? draw.throttle : 0} />
      <Atmosphere altitudeKm={draw.altitudeKm} sunDirection={sun} />
      <CloudLayer altitudeKm={draw.altitudeKm} pad={draw.up} />
      <Vehicle stage={draw.stage} throttle={draw.throttle} altitudeKm={draw.altitudeKm} elapsedS={draw.elapsedS} />
      <OrbitPath state={draw.orbit} />
      <Explosion position={boom} active={status === "crashed" && impact !== null} />
      <MapOverlay visible={view === "overview"} labels={labels} />
    </group>
  );
}
