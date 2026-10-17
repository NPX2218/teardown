// lib/imagine/patch-qr.ts — QR path for a mission patch link. Owner: Anders.
// The qrcode package only supplies the module matrix. The popup draws it as inline SVG.
import QRCode from "qrcode";

/** Medium error correction so a glare spot on the exhibit screen still scans. */
export function patchQrPath(text: string): { size: number; d: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}
