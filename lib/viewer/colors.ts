// lib/viewer/colors.ts — scene colours for three.js (theme rule 4: no hex in components).
// Highlight glow uses --status-amber (#ffb547); UI --accent is off-white in 01 theme.
export const SCENE_COLORS = {
  bg: "#000000",
  accent: "#FFB547",
  rim: "hsl(214, 49%, 74%)",
} as const;
