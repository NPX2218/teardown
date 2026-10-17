export const SNAPSHOT_TYPE = "image/jpeg";
export const SNAPSHOT_QUALITY = 0.85;

export function makeSnapshot(canvas: { toDataURL(type: string, q: number): string }): () => string {
  return () => canvas.toDataURL(SNAPSHOT_TYPE, SNAPSHOT_QUALITY);
}
