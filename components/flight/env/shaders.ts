import { SCATTER } from "./scattering";
import { GROUND_FADE_END_M, GROUND_FADE_START_M, SCENE_TO_KM } from "./frame";

const logVertex = /* glsl */ `
bool isPerspectiveMatrix(mat4 m) {
  return m[2][3] == -1.0;
}
#include <logdepthbuf_pars_vertex>
`;

const logFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;

export const skyVertexShader = /* glsl */ `
varying vec3 vWorldPos;
${logVertex}
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  #include <logdepthbuf_vertex>
}
`;

function glslFloat(value: number): string {
  const text = value.toFixed(6);
  return text.includes(".") ? text : `${text}.0`;
}

/** Port of marchAtmosphere / gradeSunset. Numbers come from SCATTER. */
export function atmosphereFragmentShader(): string {
  const kR = SCATTER.rayleigh;
  return /* glsl */ `
precision highp float;
varying vec3 vWorldPos;
uniform vec3 sunDir;
uniform float altitudeKm;
uniform float planetRadius;
uniform float sceneToKm;
${logFragment}
const int PRIMARY = ${SCATTER.primarySteps};
const int LIGHT = ${SCATTER.lightSteps};
const float PI = 3.14159265;
const float KR = ${glslFloat(kR[0])};
const float KG = ${glslFloat(kR[1])};
const float KB = ${glslFloat(kR[2])};
const float KM = ${glslFloat(SCATTER.mie)};
const float HR = ${glslFloat(SCATTER.scaleRayleighKm)};
const float HM = ${glslFloat(SCATTER.scaleMieKm)};
const float G = ${glslFloat(SCATTER.mieG)};
const float ISUN = ${glslFloat(SCATTER.iSun)};
const float EXPOSURE = ${glslFloat(SCATTER.exposure)};
const float ATMOS_H = ${glslFloat(SCATTER.atmosphereKm)};

vec2 raySphere(vec3 ro, vec3 rd, float radius) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float sat(float x) { return clamp(x, 0.0, 1.0); }

float hermite(float edge0, float edge1, float x) {
  float t = sat((x - edge0) / (edge1 - edge0));
  return t * t * (3.0 - 2.0 * t);
}

void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 sun = normalize(sunDir);
  vec3 roKm = cameraPosition * sceneToKm;
  vec3 up = normalize(cameraPosition);
  float planetKm = max(planetRadius, 0.0001) * sceneToKm;
  float atmosKm = planetKm + ATMOS_H;
  float geoAlt = max(length(cameraPosition) - planetRadius, 0.0) * sceneToKm;
  float densityScale = exp(-clamp(altitudeKm - geoAlt, -20.0, 80.0) / HR);

  vec2 atmo = raySphere(roKm, rd, atmosKm);
  float t0 = max(atmo.x, 0.0);
  float t1 = atmo.y;
  vec2 planet = raySphere(roKm, rd, planetKm);
  if (planet.x > 0.001) t1 = min(t1, planet.x);

  vec3 raw = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  float viewEl = dot(rd, up);
  if (altitudeKm >= ${glslFloat(SCATTER.blackKm)} && viewEl > 0.0) {
    gl_FragColor = vec4(0.0);
    #include <logdepthbuf_fragment>
    return;
  }
  if (t1 > t0 && atmo.y > atmo.x) {
    float mu = dot(rd, sun);
    float mumu = mu * mu;
    float gg = G * G;
    float pRlh = 3.0 / (16.0 * PI) * (1.0 + mumu);
    float pMie = 3.0 / (8.0 * PI) * ((1.0 - gg) * (mumu + 1.0)) / (pow(1.0 + gg - 2.0 * mu * G, 1.5) * (2.0 + gg));
    float stepLen = (t1 - t0) / float(PRIMARY);
    float totalM = 0.0;
    vec3 totalR = vec3(0.0);
    for (int i = 0; i < PRIMARY; i++) {
      vec3 p = roKm + rd * (t0 + stepLen * (float(i) + 0.5));
      float height = max(length(p) - planetKm, 0.0);
      float dR = exp(-height / HR) * densityScale;
      float dM = exp(-height / HM) * densityScale;
      float odStepR = dR * stepLen;
      float odStepM = dM * stepLen;
      odR += odStepR;
      odM += odStepM;
      float jOdR = 0.0;
      float jOdM = 0.0;
      vec2 shadow = raySphere(p, sun, planetKm);
      if (shadow.x > 0.01 && shadow.x < shadow.y) {
        jOdR = 1e6;
        jOdM = 1e6;
      } else {
        vec2 sunHit = raySphere(p, sun, atmosKm);
        float sunFar = max(sunHit.y, 0.0);
        float jStep = sunFar / float(LIGHT);
        for (int j = 0; j < LIGHT; j++) {
          vec3 sp = p + sun * (jStep * (float(j) + 0.5));
          float sh = max(length(sp) - planetKm, 0.0);
          jOdR += exp(-sh / HR) * jStep * densityScale;
          jOdM += exp(-sh / HM) * jStep * densityScale;
        }
      }
      float tauR = odR + jOdR;
      float tauM = odM + jOdM;
      vec3 attn = exp(-(vec3(KM) * tauM + vec3(KR, KG, KB) * tauR));
      totalR += odStepR * attn;
      totalM += odStepM * (attn.r + attn.g + attn.b) / 3.0;
    }
    raw = ISUN * (pRlh * vec3(KR, KG, KB) * totalR + pMie * KM * vec3(totalM));
    float sunEl = asin(clamp(dot(sun, up), -1.0, 1.0));
    float warm = hermite(0.35, 0.92, mu) * hermite(0.28, -0.03, sunEl);
    vec3 mapped = vec3(1.0) - exp(-raw * EXPOSURE);
    mapped.r = min(1.0, mapped.r * (1.0 + warm * 0.4));
    mapped.g = min(1.0, mapped.g * (1.0 - warm * 0.45));
    mapped.b = min(1.0, mapped.b * (1.0 - warm * 0.7));
    float night = hermite(6.0 * PI / 180.0, -6.0 * PI / 180.0, sunEl);
    float alpha = (1.0 - exp(-(odR * 0.45 + odM * 0.35))) * (1.0 - night * 0.78);
    gl_FragColor = vec4(mapped, alpha);
  } else {
    gl_FragColor = vec4(0.0);
  }
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;
}

export const groundVertexShader = /* glsl */ `
varying vec3 vNormalW;
varying vec2 vLocal;
${logVertex}
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vLocal = position.xz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  #include <logdepthbuf_vertex>
}
`;

export function groundFragmentShader(): string {
  return /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec2 vLocal;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 fogColor;
uniform float azimuthRad;
uniform float coastBearingRad;
uniform float shoreM;
uniform float hasCoast;
uniform float marsh;
uniform float roads;
${logFragment}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  float eastM = vLocal.x * sin(azimuthRad) + vLocal.y * cos(azimuthRad);
  float northM = vLocal.x * cos(azimuthRad) - vLocal.y * sin(azimuthRad);
  vec2 p = vec2(eastM, northM);
  float along = eastM * sin(coastBearingRad) + northM * cos(coastBearingRad);
  float n = fbm(p * 0.01);
  float warp = fbm(p * 0.0025 + 4.0);
  float meander = sin(northM * 0.0035 + warp * 7.0);
  float channel = smoothstep(0.58, 0.8, fbm(vec2(eastM * 0.006 + meander * 18.0, northM * 0.009)));
  float pond = smoothstep(0.64, 0.8, fbm(p * 0.018 + 11.0));
  float water = max(channel * 0.9, pond * 0.75) * marsh;
  vec3 sand = mix(vec3(0.38, 0.29, 0.18), vec3(0.52, 0.42, 0.26), n);
  vec3 scrub = vec3(0.24, 0.28, 0.14);
  vec3 albedo = mix(sand, scrub, smoothstep(0.42, 0.72, fbm(p * 0.007 + 2.0)) * marsh * 0.75);
  albedo = mix(albedo, vec3(0.16, 0.14, 0.1), water);
  float ocean = hasCoast * smoothstep(shoreM - 20.0, shoreM + 180.0, along);
  float beach = hasCoast * smoothstep(shoreM - 380.0, shoreM - 30.0, along) * (1.0 - ocean);
  albedo = mix(albedo, vec3(0.58, 0.5, 0.34), beach);
  albedo = mix(albedo, vec3(0.1, 0.2, 0.26), ocean);
  float pad = 1.0 - smoothstep(32.0, 78.0, length(vLocal));
  albedo = mix(albedo, vec3(0.36, 0.34, 0.3), pad * (1.0 - ocean));
  water *= 1.0 - pad;
  float roadE = smoothstep(7.0, 3.2, abs(vLocal.y - 30.0)) * step(vLocal.x, 50.0);
  float roadN = smoothstep(6.0, 3.0, abs(vLocal.x + 46.0)) * step(-8.0, vLocal.y) * step(vLocal.y, 130.0);
  albedo = mix(albedo, vec3(0.12, 0.11, 0.1), max(roadE, roadN) * roads * (1.0 - ocean));

  float e = 3.0;
  float h = fbm(p * 0.02);
  float hx = fbm((p + vec2(e, 0.0)) * 0.02);
  float hz = fbm((p + vec2(0.0, e)) * 0.02);
  vec3 nrm = normalize(vNormalW + vec3((h - hx) * 0.35, 0.0, (h - hz) * 0.35));
  float ndl = clamp(dot(nrm, normalize(sunDir)), 0.0, 1.0);
  vec3 lit = albedo * sunColor * (0.24 + 0.76 * ndl);
  lit += vec3(0.15, 0.12, 0.08) * water * ndl;
  float dist = length(vLocal);
  lit = mix(lit, fogColor, smoothstep(900.0, 8500.0, dist) * 0.72);
  float alpha = 1.0 - smoothstep(${GROUND_FADE_START_M.toFixed(1)}, ${GROUND_FADE_END_M.toFixed(1)}, dist);
  gl_FragColor = vec4(lit, alpha);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;
}

export const structureVertexShader = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vColor;
${logVertex}
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    mat3 im = mat3(instanceMatrix);
    objectNormal /= vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
    objectNormal = im * objectNormal;
  #endif
  vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vColor = vec3(0.75);
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  #include <logdepthbuf_vertex>
}
`;

export const structureFragmentShader = /* glsl */ `
precision highp float;
varying vec3 vNormalW;
varying vec3 vColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
${logFragment}
void main() {
  float ndl = clamp(dot(normalize(vNormalW), normalize(sunDir)), 0.0, 1.0);
  vec3 color = vColor * sunColor * (0.32 + 0.68 * ndl);
  gl_FragColor = vec4(color, 1.0);
  #include <logdepthbuf_fragment>
  #include <colorspace_fragment>
}
`;

export const SCENE_TO_KM_VALUE = SCENE_TO_KM;
