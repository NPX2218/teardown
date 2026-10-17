import { useSyncExternalStore } from "react";
import type { PreparedModel } from "@/lib/viewer/prepareModel";

export const viewerRuntime: { model: PreparedModel | null; explode: number } = { model: null, explode: 0 };

const subscribers = new Set<() => void>();

export function setPreparedModel(m: PreparedModel | null): void {
  if (viewerRuntime.model === m) return;
  viewerRuntime.model = m;
  subscribers.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

export function usePreparedModel(): PreparedModel | null {
  return useSyncExternalStore(subscribe, () => viewerRuntime.model, () => null);
}
