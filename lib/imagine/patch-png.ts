// lib/imagine/patch-png.ts — mission patch card as a downloadable PNG. Owner: Anders.
// Drawn with Canvas 2D so the export needs no screenshot library. Browser only.
import type { PatchCard } from "@/lib/imagine/patch";

/** Fallback badge rocket in a 120x120 box. The popup's SVG and the PNG share it. */
export const BADGE_ROCKET_PATH = "M60 22 L70 74 L60 66 L50 74 Z M50 68 L40 84 L56 74 Z M70 68 L80 84 L64 74 Z";

/** 4:5 portrait: shares cleanly to phones and social posts without cropping. */
const W = 1080;
const H = 1350;
const PAD = 80;
const COLORS = { bg: "#0a0a0a", text: "#ffffff", text2: "rgba(255,255,255,0.6)", text3: "rgba(255,255,255,0.38)", line: "rgba(255,255,255,0.12)" };

export function patchFileName(card: Pick<PatchCard, "flightNumber">): string {
  return `teardown-flight-${card.flightNumber}-patch.png`;
}

/** Greedy word wrap. Long words stay whole on their own line. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
  return kept;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 120, size / 120);
  ctx.strokeStyle = COLORS.text;
  ctx.fillStyle = COLORS.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(60, 60, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill(new Path2D(BADGE_ROCKET_PATH));
  ctx.restore();
}

/** Renders the card. A missing or failed picture falls back to the line-art badge. */
export async function renderPatchPng(card: PatchCard, imageUrl: string | null): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  await document.fonts?.ready;
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const set = (size: number, weight = 400) => { ctx.font = `${weight} ${size}px ${font}`; };

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  set(30, 500);
  ctx.fillStyle = COLORS.text2;
  ctx.fillText("Mission patch", PAD, PAD + 30);
  set(64, 500);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(card.title, PAD, PAD + 106);

  // Patch picture, centred.
  const pic = 560;
  const picX = (W - pic) / 2;
  const picY = 240;
  const img = imageUrl ? await loadImage(imageUrl) : null;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(picX, picY, pic, pic, 24);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.clip();
  if (img) ctx.drawImage(img, picX, picY, pic, pic);
  else drawBadge(ctx, picX + pic * 0.18, picY + pic * 0.18, pic * 0.64);
  ctx.restore();

  // Stats: 2x2 grid, then CO₂ across the full width.
  const top = picY + pic + 56;
  const colW = (W - PAD * 2) / 2;
  const rowH = 104;
  const facts: [string, string][] = [
    ["Highest point", card.maxAltitude],
    ["How it ended", card.outcomeLabel],
    ["Scenario", card.scenarioName],
    ["Flight number", String(card.flightNumber)],
    ["Carbon dioxide (estimated)", card.co2],
  ];
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  facts.forEach(([label, value], i) => {
    const row = Math.floor(i / 2);
    const col = i === 4 ? 0 : i % 2;
    const x = PAD + col * colW + (col === 1 ? 32 : 0);
    const y = top + row * rowH;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    if (col === 1) {
      ctx.beginPath();
      ctx.moveTo(PAD + colW, y);
      ctx.lineTo(PAD + colW, y + rowH);
      ctx.stroke();
    }
    set(24);
    ctx.fillStyle = COLORS.text3;
    ctx.fillText(label, x, y + 38);
    set(36, 500);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(value, x, y + 82, (i === 4 ? colW * 2 : colW) - 32);
  });
  const bottom = top + 3 * rowH;
  ctx.beginPath();
  ctx.moveTo(PAD, bottom);
  ctx.lineTo(W - PAD, bottom);
  ctx.stroke();

  set(26);
  ctx.fillStyle = COLORS.text2;
  wrapLines(card.reason, W - PAD * 2, (s) => ctx.measureText(s).width, 2)
    .forEach((line, i) => ctx.fillText(line, PAD, bottom + 52 + i * 36));

  set(22, 500);
  ctx.fillStyle = COLORS.text3;
  ctx.fillText("TEARDOWN", PAD, H - 48);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not make the PNG."))), "image/png");
  });
}

export async function downloadPatchPng(card: PatchCard, imageUrl: string | null): Promise<void> {
  const blob = await renderPatchPng(card, imageUrl);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = patchFileName(card);
  link.click();
  // Revoke after the click has handed the blob to the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
