// lib/viewer/colors.ts — scene colours for three.js (theme rule 4: no hex in components).
// Highlight glow uses --status-amber (#ffb547); UI --accent is off-white in 01 theme.
export const SCENE_COLORS = {
  bg: "#000000",
  accent: "#FFB547",
  rim: "hsl(214, 49%, 74%)",
} as const;

/** Globe colours for the flight scene. Three.js cannot read CSS variables. */
export const FLIGHT_SCENE = {
  ocean: "#143a66",
  land: "#6f8f62",
  landEdge: "#d9d6c8",
  ice: "#e7eef2",
  atmosphere: "#8eb4d6",
  pad: "#ffb547",
  path: "#f0f0fa",
  pathHit: "#ffb547",
  rocket: "#f4f4f8",
  flame: "#ff6308",
  /** Multiplies a texture without tinting it. */
  untinted: "#ffffff",
  concrete: "#8e9499",
  tower: "#d5dbe0",
  trench: "#3e444a",
  skyZenith: "#1d5eae",
  skyHorizon: "#c5dff6",
  sunDisc: "#ffe1a8",
  plumeCore: "#fff1c4",
  boom: "#e85d4c",
} as const;
