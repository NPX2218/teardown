// Laptop master level. Speech and cached audio read it when they start, and live elements follow later moves.

let master = 1;
const live = new Set<{ volume: number }>();

function unit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function masterLevel(): number {
  return master;
}

export function setMasterLevel(value: number): void {
  master = unit(value);
  live.forEach((node) => {
    node.volume = master;
  });
}

/** Keep this element on the master slider until release. */
export function trackMaster(node: { volume: number }): () => void {
  node.volume = master;
  live.add(node);
  return () => {
    live.delete(node);
  };
}
