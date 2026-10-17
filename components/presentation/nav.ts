/**
 * Deck navigation. These keys exist only while /presentation is mounted.
 * They are not the flight keys (M, L, T, E, V, I, 2). Space here reveals the
 * next line. It does not complete a checkpoint or award an orbit.
 */

export interface DeckPos {
  index: number;
  reveal: number;
}

export type DeckAction =
  | "advance"
  | "retreat"
  | "home"
  | "end"
  | "fullscreen"
  | "notes"
  | "close";

/** Flight shortcuts this route must ignore. Compared after lower-casing. */
export const FLIGHT_KEYS = ["m", "l", "t", "e", "v", "i", "2"] as const;

export function actionFor(key: string): DeckAction | null {
  const lower = key.toLowerCase();
  if ((FLIGHT_KEYS as readonly string[]).includes(lower)) return null;
  if (key === "ArrowRight" || key === "ArrowDown" || key === "PageDown" || key === " ") {
    return "advance";
  }
  if (key === "ArrowLeft" || key === "ArrowUp" || key === "PageUp") return "retreat";
  if (key === "Home") return "home";
  if (key === "End") return "end";
  if (lower === "f") return "fullscreen";
  if (lower === "n") return "notes";
  if (key === "Escape") return "close";
  return null;
}

export function advance(pos: DeckPos, beatCounts: readonly number[], reduced: boolean): DeckPos {
  const beats = beatCounts[pos.index] ?? 1;
  if (!reduced && pos.reveal < beats) return { index: pos.index, reveal: pos.reveal + 1 };
  if (pos.index >= beatCounts.length - 1) return { index: pos.index, reveal: beats };
  const next = pos.index + 1;
  return { index: next, reveal: reduced ? beatCounts[next] : 1 };
}

export function retreat(pos: DeckPos, beatCounts: readonly number[], reduced: boolean): DeckPos {
  const beats = beatCounts[pos.index] ?? 1;
  if (!reduced && pos.reveal > 1) return { index: pos.index, reveal: pos.reveal - 1 };
  if (pos.index <= 0) return { index: 0, reveal: reduced ? beats : 1 };
  const prev = pos.index - 1;
  return { index: prev, reveal: beatCounts[prev] };
}

export function openingReveal(beatCount: number, reduced: boolean, directLink: boolean): number {
  if (reduced || directLink) return beatCount;
  return 1;
}
