// lib/rocket/qr.ts — turns the pairing link into an SVG path (11 Task 2). Pure: no DOM, so it runs in vitest.
// The `qrcode` package only supplies the module matrix; PairRocket draws it as inline SVG (no canvas, no data URL).
import QRCode from "qrcode";

/** The page the phone opens. Tolerates a trailing slash on the origin; the code is URL-encoded. */
export function rocketUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/rocket?code=${encodeURIComponent(code)}`;
}

/**
 * `size` = modules per side. `d` = one square subpath per dark module ("M x y h1 v1 h-1 z"), to use in a
 * `<path d fill="currentColor">` inside `viewBox="0 0 size size"`. Medium error correction (15%) survives a
 * scuffed screen or a glare spot at a hackathon table.
 */
export function qrSvgPath(text: string): { size: number; d: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}
