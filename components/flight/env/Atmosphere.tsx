"use client";
// Stand-in sky until neel/19a-surface-env replaces this file.
// Blue at the pad, black by 100 km, and clear when the camera is already in space.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EARTH_RADIUS_M } from "@/lib/flight.helpers";
import { EARTH_RADIUS, type AtmosphereProps } from "@/lib/flight/scene-types";
import { skyBlackness } from "@/lib/flight/launch-camera";
import { FLIGHT_SCENE } from "@/lib/viewer/colors";
import { flightDrawNow } from "../flightDraw";

const EARTH_KM = EARTH_RADIUS_M / 1000;

const vertexShader = /* glsl */ `
varying vec3 vWorldPos;
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  #include <logdepthbuf_vertex>
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vWorldPos;
uniform float vehicleBlack;
uniform vec3 sunDir;
uniform vec3 zenithColor;
uniform vec3 horizonColor;
uniform vec3 sunColor;
#include <logdepthbuf_pars_fragment>
void main() {
  float camR = max(length(cameraPosition), 0.001);
  float camKm = (camR / ${EARTH_RADIUS.toFixed(6)} - 1.0) * ${EARTH_KM.toFixed(3)};
  float camBlack = smoothstep(0.0, 100.0, camKm);
  float black = clamp(max(vehicleBlack, camBlack), 0.0, 1.0);
  vec3 up = cameraPosition / camR;
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  float elev = dot(viewDir, up);
  float grade = smoothstep(0.0, 0.62, elev);
  vec3 color = mix(horizonColor, zenithColor, grade);
  float sun = pow(max(dot(viewDir, normalize(sunDir)), 0.0), 48.0);
  color += sunColor * sun * (1.0 - black);
  float alpha = (1.0 - black) * smoothstep(-0.06, 0.08, elev);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
  #include <logdepthbuf_fragment>
}
`;

export function Atmosphere({ altitudeKm, sunDirection }: AtmosphereProps) {
  const alt = useRef(altitudeKm);
  alt.current = altitudeKm;
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      vehicleBlack: { value: 0 },
      sunDir: { value: new THREE.Vector3(...sunDirection) },
      zenithColor: { value: new THREE.Color(FLIGHT_SCENE.skyZenith) },
      horizonColor: { value: new THREE.Color(FLIGHT_SCENE.skyHorizon) },
      sunColor: { value: new THREE.Color(FLIGHT_SCENE.sunDisc) },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [sunDirection]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const kilometres = flightDrawNow.current?.altitudeKm ?? alt.current;
    material.uniforms.vehicleBlack.value = skyBlackness(kilometres);
    const sun = material.uniforms.sunDir.value as THREE.Vector3;
    sun.set(sunDirection[0], sunDirection[1], sunDirection[2]);
  });
  return (
    <mesh frustumCulled={false} renderOrder={-2}>
      <sphereGeometry args={[4, 48, 24]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
