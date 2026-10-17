/** GLSL for the flight FX. Colours arrive as uniforms from the theme tokens. */

// Match the logarithmic depth protocol enabled by FlightScene. Keeping both
// stages paired also leaves the standalone FX preview usable without log depth.
const logVertex = /* glsl */ `
bool isPerspectiveMatrix(mat4 m) {
  return m[2][3] == -1.0;
}
#include <logdepthbuf_pars_vertex>
`;
const logFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;

export const plumeVertex = /* glsl */ `
${logVertex}
varying float vAlong;
varying float vSeed;
void main() {
  vAlong = clamp(-position.y, 0.0, 1.0);
  vSeed = position.x * 4.0 + position.z;
  #ifdef USE_INSTANCING
    vec4 local = instanceMatrix * vec4(position, 1.0);
  #else
    vec4 local = vec4(position, 1.0);
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * local;
  #include <logdepthbuf_vertex>
}
`;

export const plumeFragment = /* glsl */ `
${logFragment}
uniform float uTime;
uniform float uBrightness;
uniform float uVacuum;
uniform float uFlicker;
uniform vec3 uHot;
uniform vec3 uFlame;
uniform vec3 uVacTint;
varying float vAlong;
varying float vSeed;
void main() {
  float hot = smoothstep(0.9, 0.05, vAlong);
  vec3 col = mix(uFlame, uHot, clamp(hot + 0.45, 0.0, 1.0));
  col = mix(col, uVacTint, uVacuum * (1.0 - hot) * 0.55);
  float flick = 1.0;
  if (uFlicker > 0.5) {
    flick = 0.84 + 0.16 * sin(uTime * 46.0 + vSeed * 13.0 + vAlong * 9.0);
  }
  float alpha = pow(1.0 - vAlong, 1.15) * (0.25 + 0.75 * hot) * uBrightness * flick;
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}
`;

export const sparkVertex = /* glsl */ `
${logVertex}
attribute float aSeed;
uniform float uTime;
uniform float uLength;
uniform float uRadius;
uniform float uFlicker;
varying float vAlpha;
void main() {
  float speed = 1.4 + aSeed * 1.6;
  float life = uFlicker > 0.5 ? fract(uTime * speed + aSeed) : aSeed;
  float ang = aSeed * 6.2831853;
  float spread = uRadius * life * 0.45;
  vec3 p = vec3(cos(ang) * spread, -life * uLength, sin(ang) * spread);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float localDistance = -mv.z / max(length(modelMatrix[0].xyz), 1e-12);
  gl_PointSize = max(1.0, (1.5 + (1.0 - life) * 4.5) * (28.0 / max(0.2, localDistance)));
  gl_Position = projectionMatrix * mv;
  vAlpha = (1.0 - life) * step(0.001, uLength);
  #include <logdepthbuf_vertex>
}
`;

export const sparkFragment = /* glsl */ `
${logFragment}
uniform vec3 uHot;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float a = smoothstep(0.5, 0.05, length(d)) * vAlpha;
  gl_FragColor = vec4(uHot, a);
  #include <logdepthbuf_fragment>
}
`;

export const smokeVertex = /* glsl */ `
${logVertex}
attribute float aSeed;
attribute vec3 aDir;
uniform float uTime;
uniform float uSmoke;
uniform float uSpread;
uniform float uOrange;
uniform float uReduced;
varying float vAlpha;
varying float vOrange;
varying vec2 vUv;
void main() {
  vUv = uv;
  float life = uReduced > 0.5 ? aSeed * 0.8 : fract(uTime * (0.11 + aSeed * 0.1) + aSeed);
  float spread = 4.0 + life * uSpread;
  float size = (42.0 + life * 130.0) * (0.8 + aSeed * 0.45);
  // 2026-10-17 skin-loss report: this smoke travels with the vehicle, so it
  // must trail the bells. A square billboard can reach size / sqrt(2) from
  // its centre; include that bound so camera rotation cannot lift it into the body.
  float trail = mix(14.0, 78.0, life) + size * sqrt(0.5);
  vec3 p = aDir * spread + vec3(0.0, -trail, 0.0);
  float dist = length(p.xz);
  vOrange = uOrange * (1.0 - smoothstep(8.0, 52.0, dist)) * (1.0 - life * 0.25);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * size * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
  vAlpha = uSmoke * (0.55 + 0.45 * sin(clamp(life, 0.0, 1.0) * 3.14159265));
  #include <logdepthbuf_vertex>
}
`;

export const smokeFragment = /* glsl */ `
${logFragment}
uniform vec3 uCream;
uniform vec3 uFlame;
uniform sampler2D uMap;
varying float vAlpha;
varying float vOrange;
varying vec2 vUv;
void main() {
  float sprite = texture2D(uMap, vUv).a;
  vec3 col = mix(uCream, uFlame, clamp(vOrange * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(col, sprite * vAlpha * 0.48);
  #include <logdepthbuf_fragment>
}
`;

/** Crash smoke. Smaller and darker than the pad billow, and it loops once. */
export const burstSmokeVertex = /* glsl */ `
${logVertex}
attribute float aSeed;
attribute vec3 aDir;
uniform float uTime;
uniform float uSmoke;
uniform float uReduced;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float life = uReduced > 0.5 ? aSeed : fract(uTime * (0.28 + aSeed * 0.35) + aSeed);
  float rise = mix(-1.6, 22.0, life);
  vec3 p = aDir * (1.5 + life * 26.0) + vec3(0.0, rise, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (3.0 + life * 16.0) * (0.55 + aSeed);
  mv.xy += position.xy * size * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
  vAlpha = uSmoke * (1.0 - life) * (1.0 - life);
  #include <logdepthbuf_vertex>
}
`;

export const burstSmokeFragment = /* glsl */ `
${logFragment}
uniform vec3 uColor;
uniform sampler2D uMap;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float sprite = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(uColor, sprite * vAlpha);
  #include <logdepthbuf_fragment>
}
`;

export const contrailVertex = /* glsl */ `
${logVertex}
attribute float aSeed;
attribute vec3 aDir;
uniform float uTime;
uniform float uLength;
uniform float uAmount;
uniform float uReduced;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  float along = aSeed;
  float wobble = uReduced > 0.5 ? 0.0 : sin(uTime * 0.45 + aSeed * 16.0) * (1.0 + along * 5.0);
  vec3 p = vec3(
    aDir.x * (1.2 + along * 6.0) + wobble,
    -along * uLength,
    aDir.z * (1.2 + along * 6.0)
  );
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = max(56.0, uLength * 0.062);
  mv.xy += position.xy * size * length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * mv;
  float body = smoothstep(0.0, 0.06, along) * (1.0 - smoothstep(0.88, 1.0, along));
  vAlpha = uAmount * (0.4 + 0.6 * body);
  #include <logdepthbuf_vertex>
}
`;

export const contrailFragment = /* glsl */ `
${logFragment}
uniform vec3 uCream;
uniform sampler2D uMap;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float sprite = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(uCream, sprite * vAlpha * 0.8);
  #include <logdepthbuf_fragment>
}
`;

export const fireballVertex = /* glsl */ `
${logVertex}
varying vec3 vNormalV;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}
`;

export const fireballFragment = /* glsl */ `
${logFragment}
uniform float uFire;
uniform float uFlash;
uniform vec3 uHot;
uniform vec3 uFlame;
varying vec3 vNormalV;
varying vec3 vView;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vView))), 1.4);
  vec3 col = mix(uFlame, uHot, fres);
  float alpha = (0.25 + 0.75 * fres) * max(uFire, uFlash);
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}
`;

export const debrisVertex = /* glsl */ `
${logVertex}
attribute vec3 aVel;
attribute float aSeed;
uniform float uAge;
uniform float uSpin;
varying float vAlpha;
void main() {
  float spin = aSeed * 12.0 + uAge * 4.0 * uSpin;
  float s = sin(spin);
  float c = cos(spin);
  vec3 rp = vec3(c * position.x - s * position.z, position.y, s * position.x + c * position.z);
  vec3 p = rp + aVel * uAge + vec3(0.0, -8.0 * uAge * uAge, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = 1.0;
  #include <logdepthbuf_vertex>
}
`;

export const debrisFragment = /* glsl */ `
${logFragment}
uniform vec3 uColor;
uniform float uFade;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uFade);
  #include <logdepthbuf_fragment>
}
`;

export const emberVertex = /* glsl */ `
${logVertex}
attribute vec3 aVel;
attribute float aSeed;
uniform float uAge;
uniform float uFade;
varying float vAlpha;
void main() {
  vec3 p = aVel * uAge + vec3(0.0, -6.0 * uAge * uAge, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float localDistance = -mv.z / max(length(modelMatrix[0].xyz), 1e-12);
  gl_PointSize = max(1.0, (2.0 + aSeed * 3.0) * (18.0 / max(0.15, localDistance)) * uFade);
  gl_Position = projectionMatrix * mv;
  vAlpha = uFade * (1.0 - smoothstep(1.4, 2.6, uAge));
  #include <logdepthbuf_vertex>
}
`;

export const emberFragment = /* glsl */ `
${logFragment}
uniform vec3 uHot;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float a = smoothstep(0.5, 0.05, length(d)) * vAlpha;
  gl_FragColor = vec4(uHot, a);
  #include <logdepthbuf_fragment>
}
`;

export const puffVertex = /* glsl */ `
${logVertex}
uniform float uScale;
varying float vAlpha;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uScale;
  gl_Position = projectionMatrix * mv;
  vAlpha = 1.0;
  #include <logdepthbuf_vertex>
}
`;

export const puffFragment = /* glsl */ `
${logFragment}
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;
varying float vAlpha;
varying vec2 vUv;
void main() {
  float sprite = texture2D(uMap, vUv).a;
  gl_FragColor = vec4(uColor, sprite * uOpacity * vAlpha);
  #include <logdepthbuf_fragment>
}
`;

export const fogVertex = /* glsl */ `
${logVertex}
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const fogFragment = /* glsl */ `
${logFragment}
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 d = vUv - vec2(0.5);
  float a = smoothstep(0.72, 0.15, length(d)) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <logdepthbuf_fragment>
}
`;
