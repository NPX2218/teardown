// Painted geography for the globe when the NASA textures cannot be loaded. Not a surveyed coastline.
import { FLIGHT_SCENE } from "@/lib/viewer/colors";

interface Blob {
  lon: number;
  lat: number;
  rx: number;
  ry: number;
  ice?: boolean;
}

const LAND: Blob[] = [
  { lon: -100, lat: 45, rx: 78, ry: 52 },
  { lon: -80, lat: 25, rx: 28, ry: 18 },
  { lon: -62, lat: -15, rx: 32, ry: 68 },
  { lon: 20, lat: 7, rx: 48, ry: 68 },
  { lon: 10, lat: 48, rx: 28, ry: 22 },
  { lon: 80, lat: 48, rx: 100, ry: 42 },
  { lon: 100, lat: 20, rx: 40, ry: 28 },
  { lon: 134, lat: -25, rx: 32, ry: 22 },
  { lon: -42, lat: 72, rx: 22, ry: 18, ice: true },
];

export function drawEarthMap(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = FLIGHT_SCENE.ocean;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = FLIGHT_SCENE.ice;
  ctx.fillRect(0, 0, w, h * 0.07);
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
  for (const blob of LAND) {
    const x = ((blob.lon + 180) / 360) * w;
    const y = ((90 - blob.lat) / 180) * h;
    ctx.beginPath();
    ctx.ellipse(x, y, blob.rx, blob.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = blob.ice ? FLIGHT_SCENE.ice : FLIGHT_SCENE.land;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = FLIGHT_SCENE.landEdge;
    ctx.stroke();
  }
}
