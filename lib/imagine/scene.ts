// lib/imagine/scene.ts — picture state on Neel's store. Owner: Anders.
// Show in action is hidden while a flight or a historical replay is active.
import type { ImaginePart } from "@/lib/imagine/catalog";
import { idleFlight } from "@/lib/flight/session";
import { isFlightActive, useScene } from "@/lib/store";

export interface ImagineScene {
  parts: { groups: ImaginePart[] } | null;
  selectedId: string | null;
  imageUrl: string | null;
  snapshot: (() => string) | null;
  flightActive: boolean;
  setImageUrl: (url: string | null) => void;
}

function setImageUrl(url: string | null): void {
  useScene.getState().setImageUrl(url);
}

function partList(): ImaginePart[] | null {
  const parts = useScene.getState().parts;
  if (!parts) return null;
  return parts.groups.map((group) => ({ id: group.id, name: group.name, role: group.role }));
}

function sameParts(left: ImaginePart[] | undefined, right: ImaginePart[] | null): boolean {
  if (!left || !right || left.length !== right.length) return left === right;
  return left.every((part, index) => part.id === right[index]?.id && part.name === right[index]?.name && part.role === right[index]?.role);
}

function readScene(previous: ImagineScene | null): ImagineScene {
  const store = useScene.getState();
  const groups = partList();
  const parts = previous && sameParts(previous.parts?.groups, groups) ? previous.parts : groups ? { groups } : null;
  return {
    parts,
    selectedId: store.selectedId,
    imageUrl: store.imageUrl,
    snapshot: store.snapshot,
    flightActive: isFlightActive(store),
    setImageUrl,
  };
}

let view = readScene(null);

function refresh(): ImagineScene {
  const next = readScene(view);
  if (
    view.selectedId === next.selectedId &&
    view.imageUrl === next.imageUrl &&
    view.flightActive === next.flightActive &&
    view.snapshot === next.snapshot &&
    view.parts === next.parts
  ) {
    return view;
  }
  view = next;
  return view;
}

export function getImagineScene(): ImagineScene {
  return refresh();
}

export function subscribeImagineScene(fn: () => void): () => void {
  return useScene.subscribe(() => {
    refresh();
    fn();
  });
}

export function resetImagineScene(): void {
  useScene.setState({
    selectedId: null,
    imageUrl: null,
    snapshot: null,
    replay: { missionId: null, t: 0, playing: false },
    flight: idleFlight(),
  });
  refresh();
}

/** Test helper. flightActive is derived with isFlightActive, not stored on its own. */
export function patchImagineScene(partial: Partial<Omit<ImagineScene, "setImageUrl">>): void {
  const store = useScene.getState();
  const next: Parameters<typeof useScene.setState>[0] = {};
  if (partial.selectedId !== undefined) next.selectedId = partial.selectedId;
  if (partial.imageUrl !== undefined) next.imageUrl = partial.imageUrl;
  if (partial.snapshot !== undefined) next.snapshot = partial.snapshot;
  if (partial.flightActive === true && !isFlightActive(store)) {
    next.replay = { missionId: "practice", t: 0, playing: false };
  }
  if (partial.flightActive === false) {
    next.replay = { missionId: null, t: 0, playing: false };
    next.flight = idleFlight();
  }
  useScene.setState(next);
  refresh();
}
