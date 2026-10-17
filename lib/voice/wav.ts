// lib/voice/wav.ts — pull PCM samples out of a WAV container (05). Owner: Anders.

/** Returns the data chunk of a PCM WAV, or null when the bytes are not a RIFF wave. */
export function wavToPcm(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 44) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "data") return bytes.slice(start, Math.min(bytes.length, start + size));
    offset = start + size + (size % 2);
  }
  return null;
}
