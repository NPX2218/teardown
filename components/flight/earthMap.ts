// Plain globe for the moment before the NASA textures load (or if they cannot load).
// A calm block of ocean blue with a faint haze toward the poles. The painted blob continents it replaced
// read as a toy before the real Earth arrived (2026-10-17 feedback).
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

// Pole haze strength. Arbitrary: just enough that the globe reads round, not flat.
const POLE_HAZE_ALPHA = 0.08;

export function drawEarthMap(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = FLIGHT_SCENE.ocean;
  ctx.fillRect(0, 0, w, h);
  const haze = ctx.createLinearGradient(0, 0, 0, h);
  haze.addColorStop(0, `rgba(255, 255, 255, ${POLE_HAZE_ALPHA})`);
  haze.addColorStop(0.3, "rgba(255, 255, 255, 0)");
  haze.addColorStop(0.7, "rgba(255, 255, 255, 0)");
  haze.addColorStop(1, `rgba(255, 255, 255, ${POLE_HAZE_ALPHA})`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);
}
