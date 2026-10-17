import type { PartId } from "@/lib/types";

export const CLICK_DRAG_PX = 5;

export interface PickHit { object: { userData: Record<string, unknown> } }

export function pickPartId(hits: readonly PickHit[], selectedId: PartId | null): PartId | null {
  let first: PartId | null = null;
  for (const h of hits) {
    const id = h.object.userData.partId;
    if (typeof id !== "string") continue;
    if (selectedId === null || id === selectedId) return id;
    first ??= id;
  }
  return first;
}
