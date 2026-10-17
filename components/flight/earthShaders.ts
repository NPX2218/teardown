// Day/night shading for the flight globe. Numbers here are the shader's source of truth.

export const TERMINATOR = { edge0: -0.15, edge1: 0.25 } as const;
/** City lights fade out through the sunset and are zero once the surface is in daylight. */
export const NIGHT_LIGHTS = { edge0: 0.18, edge1: -0.25 } as const;
export const NIGHT_GAIN = 1.55;
export const DAY_FLOOR = 0.03;
export const SPEC_POWER = 160;

export const CLOUD_MASK = { edge0: 0.2, edge1: 0.82 } as const;
export const CLOUD_OPACITY = 0.88;
/** One turn in about six minutes. Paused when the visitor asks for less motion. */
export const CLOUD_YAW_RAD_PER_SEC = 0.018;

const SUN_RAW = [-1, 0.36, 1] as const;
const SUN_LENGTH = Math.hypot(SUN_RAW[0], SUN_RAW[1], SUN_RAW[2]);

/**
 * Sun sits over the Americas, so the default camera (14, 8, 14) looks across
 * the Atlantic terminator: daylight on the left, city lights toward Europe.
 */
export const EARTH_SUN_DIRECTION: readonly [number, number, number] = [
  SUN_RAW[0] / SUN_LENGTH,
  SUN_RAW[1] / SUN_LENGTH,
  SUN_RAW[2] / SUN_LENGTH,
];

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

export function dayFactor(ndotl: number): number {
  return smoothstep(TERMINATOR.edge0, TERMINATOR.edge1, ndotl);
}

export function nightGate(ndotl: number): number {
  return smoothstep(NIGHT_LIGHTS.edge0, NIGHT_LIGHTS.edge1, ndotl);
}

export function cloudOpacity(density: number): number {
  return smoothstep(CLOUD_MASK.edge0, CLOUD_MASK.edge1, density) * CLOUD_OPACITY;
}

export function cloudYawDelta(deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion || !(deltaSeconds > 0)) return 0;
  return CLOUD_YAW_RAD_PER_SEC * Math.min(deltaSeconds, 0.05);
}

const terminator = `${TERMINATOR.edge0.toFixed(2)}, ${TERMINATOR.edge1.toFixed(2)}`;
const nightLights = `${NIGHT_LIGHTS.edge0.toFixed(2)}, ${NIGHT_LIGHTS.edge1.toFixed(2)}`;
const cloudMask = `${CLOUD_MASK.edge0.toFixed(2)}, ${CLOUD_MASK.edge1.toFixed(2)}`;

export const earthVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
bool isPerspectiveMatrix(mat4 m) {
  return m[2][3] == -1.0;
}
#include <logdepthbuf_pars_vertex>
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  #include <logdepthbuf_vertex>
}
`;

export const earthFragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform sampler2D specMap;
uniform vec3 sunDir;
uniform vec3 specColor;
uniform float nightGain;
uniform float specPower;
#include <logdepthbuf_pars_fragment>
void main() {
  vec3 N = normalize(vNormalW);
  vec3 L = normalize(sunDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndotl = dot(N, L);
  float dayFactor = smoothstep(${terminator}, ndotl);
  float nightGate = smoothstep(${nightLights}, ndotl);

  vec3 dayColor = texture2D(dayMap, vUv).rgb;
  vec3 nightSample = texture2D(nightMap, vUv).rgb;
  float ocean = texture2D(specMap, vUv).r;

  vec3 color = dayColor * mix(${DAY_FLOOR.toFixed(2)}, 1.0, dayFactor);
  color += nightSample * nightGate * nightGain;

  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float glint = pow(ndh, specPower) + pow(ndh, 24.0) * 0.045;
  float wet = ocean * smoothstep(-0.02, 0.40, ndotl);
  color += specColor * glint * wet;

  gl_FragColor = vec4(color, 1.0);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;

export const cloudFragmentShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;
uniform sampler2D cloudMap;
uniform vec3 sunDir;
#include <logdepthbuf_pars_fragment>
void main() {
  vec3 N = normalize(vNormalW);
  float ndotl = dot(N, normalize(sunDir));
  float density = texture2D(cloudMap, vUv).r;
  float alpha = smoothstep(${cloudMask}, density) * ${CLOUD_OPACITY.toFixed(2)};
  float light = mix(0.04, 1.0, smoothstep(-0.20, 0.45, ndotl));
  gl_FragColor = vec4(vec3(light), alpha);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;
