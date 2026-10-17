// lib/imagine/client.ts — browser side of Grok Imagine (09 Task 3). Owner: Anders.
// requestImagine is the one entry point: the "Show in action" button, the `I` key and the agent's `imagine` tool all call it.
// runImagineTool returns as soon as the picture starts. It does not wait out 04's ask deadline, and it never fakes a picture.
import { IMAGE_TIMEOUT_MS } from "@/lib/imagine/prompt";
import { getImagineScene } from "@/lib/imagine/scene";
import { IMAGE_INPUT_SUPPORTED, JPEG_PREFIX, isShowableImageUrl } from "@/lib/imagine/shape";
import type { ToolResult } from "@/lib/types";

export const CLIENT_GRACE_MS = 2000;
export const CACHE_CHECK_TIMEOUT_MS = 2000;

// Same literal as 12's exhibit reset. 09 keeps its own copy so it does not import another lane.
export const IMAGINE_RESET_EVENT = "teardown:exhibit-reset";

export const CACHE_DIR = "/imagine";
export const cachedImagePath = (partId: string): string => `${CACHE_DIR}/${partId}.jpg`;

/** Kid-first text for the overlay when a picture fails. */
export const IMAGINE_FAILED_TEXT = "Grok couldn't draw this one. Try again, or pick another part.";

export type ImaginePhase = "idle" | "loading" | "error";
export interface ImagineStatus {
  phase: ImaginePhase;
  partId: string | null;
  error: string | null;
}
export const IDLE_STATUS: ImagineStatus = { phase: "idle", partId: null, error: null };

let status: ImagineStatus = IDLE_STATUS;
let generation = 0;
let inflight: AbortController | null = null;
const listeners = new Set<() => void>();

function setStatus(next: ImagineStatus): void {
  status = next;
  listeners.forEach((fn) => fn());
}

export const getImagineStatus = (): ImagineStatus => status;

export function subscribeImagine(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Forget the current request: its late answer is dropped and the status goes back to idle. */
export function cancelImagine(): void {
  generation += 1;
  inflight?.abort();
  inflight = null;
  if (status !== IDLE_STATUS) setStatus(IDLE_STATUS);
}

/** The picture was found but could not be drawn. */
export function failImagine(partId: string | null, error: string): void {
  getImagineScene().setImageUrl(null);
  setStatus({ phase: "error", partId, error });
}

async function findCachedImage(partId: string, signal: AbortSignal): Promise<string | null> {
  try {
    const path = cachedImagePath(partId);
    const res = await fetch(path, { method: "HEAD", signal: AbortSignal.any([signal, AbortSignal.timeout(CACHE_CHECK_TIMEOUT_MS)]) });
    return res.ok && (res.headers.get("content-type") ?? "").startsWith("image/") ? path : null;
  } catch {
    return null;
  }
}

function takeSnapshot(): string | undefined {
  if (!IMAGE_INPUT_SUPPORTED) return undefined;
  try {
    const snap = getImagineScene().snapshot?.();
    return typeof snap === "string" && snap.startsWith(JPEG_PREFIX) ? snap : undefined;
  } catch {
    return undefined;
  }
}

function checkImagineInput(prompt: unknown, partId: unknown): string | null {
  const known = getImagineScene().parts?.groups.some((group) => group.id === partId);
  if (typeof partId !== "string" || !known) return `unknown part: ${String(partId)}`;
  if (typeof prompt !== "string" || prompt.trim() === "") return "prompt must be a non-empty string";
  if (status.phase === "loading" || inflight !== null) return "already making a picture";
  return null;
}

/**
 * Checks public/imagine/<partId>.jpg first, else calls /api/imagine.
 * Success sets the scene image URL. Never throws. Never reports success without a showable URL.
 */
export async function requestImagine(
  prompt: string,
  partId: string,
  opts: { skipCache?: boolean } = {},
): Promise<ToolResult> {
  const bad = checkImagineInput(prompt, partId);
  if (bad) return { ok: false, error: bad };

  const mine = ++generation;
  const ctl = new AbortController();
  inflight = ctl;

  const done = (url: string): ToolResult => {
    inflight = null;
    getImagineScene().setImageUrl(url);
    setStatus({ phase: "idle", partId, error: null });
    return { ok: true, data: { url } };
  };
  const failed = (error: string): ToolResult => {
    inflight = null;
    setStatus({ phase: "error", partId, error });
    return { ok: false, error };
  };
  const cancelled: ToolResult = { ok: false, error: "cancelled" };

  const cached = opts.skipCache ? null : await findCachedImage(partId, ctl.signal);
  if (mine !== generation) return cancelled;
  if (cached) return done(cached);
  setStatus({ phase: "loading", partId, error: null });

  try {
    const image = takeSnapshot();
    const res = await fetch("/api/imagine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partId, prompt, ...(image ? { image } : {}) }),
      signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(IMAGE_TIMEOUT_MS + CLIENT_GRACE_MS)]),
    });
    const json: unknown = await res.json().catch(() => null);
    if (mine !== generation) return cancelled;
    if (!res.ok) {
      const reason = (json as { error?: unknown } | null)?.error;
      return failed(typeof reason === "string" ? reason : `imagine failed (${res.status})`);
    }
    const url = (json as { url?: unknown } | null)?.url;
    return isShowableImageUrl(url) ? done(url) : failed("imagine sent no picture");
  } catch (err) {
    if (mine !== generation) return cancelled;
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return failed(timedOut ? "timeout" : "could not reach imagine");
  }
}

/**
 * The agent's `imagine` tool. Validates arguments without coercing them, then STARTS the picture and returns at once.
 * The part card reads the same status. This stays off the voice listen socket.
 */
export async function runImagineTool(args: unknown): Promise<ToolResult> {
  const a = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  if (typeof a.prompt !== "string" || a.prompt.trim() === "") return { ok: false, error: "prompt must be a non-empty string" };
  if (typeof a.part_id !== "string") return { ok: false, error: "part_id must be a string" };
  const bad = checkImagineInput(a.prompt, a.part_id);
  if (bad) return { ok: false, error: bad };
  void requestImagine(a.prompt, a.part_id);
  return {
    ok: true,
    data: { started: true, partId: a.part_id, note: "The picture is on the screen soon; it may be a saved picture of this part." },
  };
}
