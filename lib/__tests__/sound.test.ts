import { describe, it, expect, vi, afterEach } from "vitest";
import { DUCK_LEVEL, SoundBank, vibrate, type AudioCtxLike, type SourceLike } from "@/lib/rocket/sound";

class FakeSource implements SourceLike {
  buffer: unknown = null; loop = false; onended: (() => void) | null = null;
  started = 0; stopped = 0;
  connect() { return undefined; }
  start() { this.started++; }
  stop() { this.stopped++; }
}
function fakeCtx() {
  const sources: FakeSource[] = [];
  const gainCalls: number[] = [];
  const ctx: AudioCtxLike = {
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: { value: 1, setTargetAtTime: (v: number) => { gainCalls.push(v); } }, connect: () => undefined }),
    createBufferSource: () => { const s = new FakeSource(); sources.push(s); return s; },
    decodeAudioData: async (d: ArrayBuffer) => ({ decoded: d.byteLength }),
  };
  return { ctx, sources, gainCalls };
}
const loadAll = async () => new ArrayBuffer(8);

describe("rocket sounds (10 Task 3)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("SN1 play before preload does nothing and never throws", () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    expect(() => b.play("liftoff_rumble")).not.toThrow();
    expect(sources).toHaveLength(0);
  });

  it("SN2 a missing file is skipped; the others still play", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, async (url) => {
      if (url === "/sounds/countdown.mp3") return null;            // 404
      if (url === "/sounds/success.mp3") throw new Error("offline"); // network error
      return new ArrayBuffer(8);
    });
    await expect(b.preload()).resolves.toBeUndefined();
    expect(b.has("countdown")).toBe(false);
    expect(b.has("success")).toBe(false);
    b.play("countdown");
    expect(sources).toHaveLength(0);
    b.play("separation_clunk");
    expect(sources).toHaveLength(1);
    expect(sources[0].started).toBe(1);
  });

  it("SN3 stopSound(id) stops only that id; stopSound() stops everything", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    b.play("liftoff_rumble", { loop: true });
    b.play("music_launch", { loop: true });
    expect(b.looping().sort()).toEqual(["liftoff_rumble", "music_launch"]);
    b.stop("liftoff_rumble");
    expect(sources[0].stopped).toBe(1);
    expect(sources[1].stopped).toBe(0);
    expect(b.looping()).toEqual(["music_launch"]);
    b.stop();
    expect(sources[1].stopped).toBe(1);
    expect(b.looping()).toEqual([]);
  });

  it("SN4 playing a loop that is already looping restarts it once (no stacking)", async () => {
    const { ctx, sources } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    b.play("maxq_rumble", { loop: true });
    b.play("maxq_rumble", { loop: true });
    expect(sources[0].stopped).toBe(1);
    expect(sources[1].stopped).toBe(0);
    expect(b.looping()).toEqual(["maxq_rumble"]);
    // one-shot effects may overlap (two clunks are fine)
    b.play("separation_clunk"); b.play("separation_clunk");
    expect(sources[2].stopped + sources[3].stopped).toBe(0);
  });

  it("SN5 ducking: 0.3 while any key is on, back to 1 when all are off; listeners hear changes", async () => {
    const { ctx, gainCalls } = fakeCtx();
    const b = new SoundBank(ctx, loadAll);
    await b.preload();
    const fn = vi.fn();
    b.subscribe(fn);
    b.duck("voice", true);
    b.duck("ear", true);
    b.duck("voice", false);
    b.duck("ear", false);
    expect(gainCalls).toEqual([DUCK_LEVEL, DUCK_LEVEL, DUCK_LEVEL, 1]);
    b.setUserGain(0.5);
    expect(gainCalls.at(-1)).toBe(0.5);
    b.duck("voice", true);
    expect(gainCalls.at(-1)).toBeCloseTo(DUCK_LEVEL * 0.5);
    b.play("success");
    expect(fn).toHaveBeenCalled();
  });

  it("SN6 vibrate is a no-op without navigator.vibrate and calls it when present", () => {
    vi.stubGlobal("navigator", {});
    expect(() => vibrate([400, 100, 400])).not.toThrow();
    const v = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate: v });
    vibrate([400, 100, 400]);
    expect(v).toHaveBeenCalledWith([400, 100, 400]);
  });

  it("SN7 a loop asked for while loading starts when its file arrives; stop cancels it", async () => {
    const { ctx, sources } = fakeCtx();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    const b = new SoundBank(ctx, async () => { await gate; return new ArrayBuffer(8); });
    const loading = b.preload();
    b.play("liftoff_rumble", { loop: true });
    b.play("music_launch", { loop: true });
    b.play("separation_clunk");          // one-shot: dropped
    b.stop("music_launch");               // cancelled before it loaded
    release();
    await loading;
    expect(sources).toHaveLength(1);
    expect(b.looping()).toEqual(["liftoff_rumble"]);
  });
});
