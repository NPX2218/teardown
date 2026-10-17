import { afterEach, describe, expect, it, vi } from "vitest";
import { playBlob, playCapMs, playUrl, browserSpeak, fetchVoice } from "@/lib/voice/browser-audio";
import { AUDIO_MS_PER_CHAR, SPEAK_BASE_MS, SPEAK_MS_PER_CHAR, ROCKET_SAY_EXTRA_MS, sayCapMs } from "@/lib/voice/format";
import { hashLine } from "@/lib/voice/hash";
import type { RocketMessage } from "@/lib/voice/rocket-port";
import { createSpeaker, ROCKET_POLL_MS, type Playback, type PlaybackResult, type SpeakerDeps } from "@/lib/voice/speaker";
import { speakLine } from "@/lib/voice/speak";
import { TEXT_TIMEOUT_MS } from "@/lib/timeout";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

interface Play { kind: "url" | "blob" | "browser"; text: string; stopped: boolean; end(r?: PlaybackResult): void }

function fakeDeps(over: Partial<SpeakerDeps> = {}) {
  const log: string[] = [];
  const plays: Play[] = [];
  const state = { connected: false };
  const saidFns = new Map<string, () => void>();
  const sent: RocketMessage[] = [];
  let seq = 0;
  const mk = (kind: Play["kind"], text: string): Playback => {
    let resolve!: (r: PlaybackResult) => void;
    const done = new Promise<PlaybackResult>((r) => { resolve = r; });
    const play: Play = { kind, text, stopped: false, end: (r = "ended") => resolve(r) };
    plays.push(play);
    log.push(`${kind}:${text}`);
    return { done, stop() { play.stopped = true; resolve("ended"); } };
  };
  const deps: SpeakerDeps = {
    isRocketConnected: () => state.connected,
    sendToRocket: (m) => { sent.push(m); log.push(`send:${m.k}`); },
    onSaid: (id, fn) => { saidFns.set(id, fn); return () => { saidFns.delete(id); }; },
    nextRequestId: (key) => { seq += 1; return `${key.slice(0, 8)}-${seq}`; },
    minSayMs: 0,
    cachedUrl: async () => null,
    playUrl: (url, text) => mk("url", text + "@" + url),
    fetchVoice: async () => null,
    playBlob: (_b, text) => mk("blob", text),
    browserSpeak: (text) => mk("browser", text),
    ...over,
  };
  return { deps, log, plays, state, sent, said: (id: string) => saidFns.get(id)?.() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("speakLine ordering (01 SP1–SP3, kept by 05)", () => {
  it("SP1 a queued line plays after the line it follows", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const checkpoint = sp.speakLine("checkpoint", { via: "rocket" });
    const emissions = sp.speakLine("emissions", { via: "rocket", queue: true });
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint"]);
    f.plays[0].end();
    await checkpoint;
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint", "emissions"]);
    f.plays[1].end();
    await expect(emissions).resolves.toBeUndefined();
  });

  it("SP2 the time cap stops a stuck browser voice before releasing the queue", async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    let current: { onend: (() => void) | null; onerror: (() => void) | null } | null = null;
    vi.stubGlobal("window", {
      speechSynthesis: {
        get speaking() { return current !== null; },
        pending: false,
        speak(u: { text: string; onend: (() => void) | null; onerror: (() => void) | null }) { log.push(`speak:${u.text}`); current = u; },
        cancel() { log.push("cancel"); const c = current; current = null; c?.onerror?.(); },
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string; onend: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    });
    const p = browserSpeak("stuck");
    let ended: PlaybackResult | null = null;
    void p.done.then((r) => { ended = r; });
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * "stuck".length - 1);
    expect(ended).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toBe("ended");
    expect(log).toEqual(["speak:stuck", "cancel"]);
  });

  it("SP3 a line queued BEFORE the line it should follow is dropped", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const early = sp.speakLine("emissions", { queue: true });
    const checkpoint = sp.speakLine("checkpoint");
    await early;
    await flush();
    expect(f.plays.map((p) => p.text)).toEqual(["checkpoint"]);
    f.plays[0].end();
    await checkpoint;
  });
});

describe("speakLine routing (05 Task 1)", () => {
  it("SV21 500 chars fit the phone contract; 501 bypasses phone and remote voice", async () => {
    const fetchVoiceFn = vi.fn(async () => null);
    const f = fakeDeps({ fetchVoice: fetchVoiceFn });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const valid = sp.speakLine("x".repeat(500), { via: "rocket" });
    await flush();
    expect(f.sent[0]).toMatchObject({ k: "say", text: "x".repeat(500) });
    f.said((f.sent[0] as { id: string }).id);
    await valid;
    const long = sp.speakLine("x".repeat(501), { via: "rocket" });
    await flush();
    expect(f.sent).toHaveLength(1);
    expect(fetchVoiceFn).not.toHaveBeenCalled();
    expect(f.plays).toHaveLength(1);
    f.plays[0].end();
    await long;
  });

  it("SV1 via rocket + connected: sends one say and waits for said", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    let done = false;
    const p = sp.speakLine("Liftoff!", { via: "rocket" }).then(() => { done = true; });
    await flush();
    expect(f.sent).toHaveLength(1);
    const m = f.sent[0];
    expect(m).toMatchObject({ k: "say", cacheKey: hashLine("Liftoff!"), text: "Liftoff!" });
    const id = (m as { id: string }).id;
    expect(id.length).toBeGreaterThanOrEqual(1);
    expect(id.length).toBeLessThanOrEqual(32);
    expect(done).toBe(false);
    f.said(id);
    await p;
    expect(f.plays).toHaveLength(0);
    expect(f.sent.map((x) => x.k)).toEqual(["say"]);
  });

  it("SV2 via rocket but not connected: straight to the laptop, nothing sent", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    void sp.speakLine("Liftoff!", { via: "rocket" });
    await flush();
    expect(f.sent).toHaveLength(0);
    expect(f.plays.map((p) => p.text)).toEqual(["Liftoff!"]);
  });

  it("SV3 via screen never uses the rocket, even when connected", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    void sp.speakLine("explain", { via: "screen" });
    await flush();
    f.plays[0].end();
    void sp.speakLine("again");
    await flush();
    expect(f.sent).toHaveLength(0);
    expect(f.plays.map((p) => p.text)).toEqual(["explain", "again"]);
  });

  it("SV4 laptop order: a cached file plays first and Grok Voice is not called", async () => {
    const fetchVoiceFn = vi.fn(async () => null);
    const f = fakeDeps({ cachedUrl: async () => "/audio/x.mp3", fetchVoice: fetchVoiceFn });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["url"]);
    f.plays[0].end();
    await p;
    expect(fetchVoiceFn).not.toHaveBeenCalled();
  });

  it("SV5 each stage that fails falls to the next", async () => {
    const f = fakeDeps({ cachedUrl: async () => "/audio/x.mp3", fetchVoice: async () => new Blob([new Uint8Array(5)]) });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    f.plays[0].end("failed");
    await flush();
    f.plays[1].end("failed");
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["url", "blob", "browser"]);
    f.plays[2].end();
    await expect(p).resolves.toBeUndefined();
  });

  it("SV6 no cached file and Grok Voice down: browser voice speaks", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("hello");
    await flush();
    expect(f.plays.map((x) => x.kind)).toEqual(["browser"]);
    f.plays[0].end();
    await p;
  });

  it("SV7 phone says nothing back: after sayCapMs it sends stopSay, then speaks on the laptop", async () => {
    vi.useFakeTimers();
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const text = "Hold it steady!";
    const p = sp.speakLine(text, { via: "rocket" });
    await vi.advanceTimersByTimeAsync(sayCapMs(text) - 1);
    expect(f.plays).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    const say = f.sent[0] as { id: string };
    expect(f.sent[1]).toEqual({ k: "stopSay", id: say.id });
    expect(f.log).toEqual(["send:say", "send:stopSay", `browser:${text}`]);
    expect(f.plays.map((x) => x.text)).toEqual([text]);
    f.plays[0].end();
    await p;
  });

  it("SV8 the phone disconnects mid-line: within one poll it sends stopSay", async () => {
    vi.useFakeTimers();
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("Liftoff!", { via: "rocket" });
    await vi.advanceTimersByTimeAsync(100);
    f.state.connected = false;
    await vi.advanceTimersByTimeAsync(ROCKET_POLL_MS);
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay"]);
    expect(f.plays.map((x) => x.text)).toEqual(["Liftoff!"]);
    f.plays[0].end();
    await p;
  });

  it("SV9 a new non-queued line cuts a phone line before the new say", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const first = sp.speakLine("first line", { via: "rocket" });
    await flush();
    const firstId = (f.sent[0] as { id: string }).id;
    const second = sp.speakLine("second line", { via: "rocket" });
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay", "say"]);
    expect(f.sent[1]).toEqual({ k: "stopSay", id: firstId });
    const secondId = (f.sent[2] as { id: string }).id;
    expect(secondId).not.toBe(firstId);
    await first;
    f.said(secondId);
    await second;
  });

  it("SV10 a said for a different request id does not end the line", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    let done = false;
    const p = sp.speakLine("Liftoff!", { via: "rocket" }).then(() => { done = true; });
    await flush();
    f.said("someone-else-9");
    await flush();
    expect(done).toBe(false);
    f.said((f.sent[0] as { id: string }).id);
    await p;
  });

  it("SV11 stopSpeaking cuts the current line and drops queued lines", async () => {
    const f = fakeDeps();
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    const phone = sp.speakLine("phone line", { via: "rocket" });
    const queued = sp.speakLine("queued", { via: "screen", queue: true });
    await flush();
    sp.stopSpeaking();
    await phone;
    await queued;
    await flush();
    expect(f.sent.map((m) => m.k)).toEqual(["say", "stopSay"]);
    expect(f.plays).toHaveLength(0);
  });

  it("SV12 stopSpeaking silences a laptop line at once", async () => {
    const f = fakeDeps();
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("talking");
    await flush();
    sp.stopSpeaking();
    expect(f.plays[0].stopped).toBe(true);
    await p;
  });

  it("SV13 empty or blank text resolves at once and touches nothing", async () => {
    const cachedUrl = vi.fn(async () => null);
    const f = fakeDeps({ cachedUrl });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    await expect(sp.speakLine("", { via: "rocket" })).resolves.toBeUndefined();
    await expect(sp.speakLine("   \n", { queue: true })).resolves.toBeUndefined();
    expect(cachedUrl).not.toHaveBeenCalled();
    expect(f.sent).toHaveLength(0);
    expect(f.plays).toHaveLength(0);
  });

  it("SV14 never rejects: a throwing rocket, manifest or browser voice still resolves", async () => {
    const f = fakeDeps({
      sendToRocket: () => { throw new Error("socket closed"); },
      cachedUrl: async () => { throw new Error("manifest boom"); },
      fetchVoice: async () => { throw new Error("fetch boom"); },
      browserSpeak: () => { throw new Error("speech boom"); },
    });
    f.state.connected = true;
    const sp = createSpeaker(f.deps);
    await expect(sp.speakLine("hello", { via: "rocket" })).resolves.toBeUndefined();
  });

  it("SV15 a cut-off during the Grok fetch aborts the fetch", async () => {
    let seen: AbortSignal | undefined;
    const f = fakeDeps({
      fetchVoice: (_t, signal) => { seen = signal; return new Promise<Blob | null>(() => {}); },
    });
    const sp = createSpeaker(f.deps);
    const p = sp.speakLine("slow line");
    await flush();
    expect(seen?.aborted).toBe(false);
    void sp.speakLine("next line");
    expect(seen?.aborted).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });

  it("SV16 rocket cap covers phone startup plus 90 ms per character", () => {
    expect(sayCapMs("")).toBe(SPEAK_BASE_MS + ROCKET_SAY_EXTRA_MS);
    expect(sayCapMs("12345")).toBe(1500 + 90 * 5 + 4000);
  });
});

describe("speak.ts wiring (05 Task 1)", () => {
  it("with no browser and a disconnected rocket, a line resolves and does not throw", async () => {
    await expect(speakLine("Liftoff!")).resolves.toBeUndefined();
  });
});

describe("browser adapters (05 Task 1)", () => {
  class FakeAudio {
    static playResult: "ok" | "blocked" = "ok";
    static last: FakeAudio;
    src: string; duration = NaN; paused = false;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onloadedmetadata: (() => void) | null = null;
    constructor(src: string) { this.src = src; FakeAudio.last = this; }
    play(): Promise<void> {
      return FakeAudio.playResult === "ok" ? Promise.resolve() : Promise.reject(new DOMException("blocked", "NotAllowedError"));
    }
    pause() { this.paused = true; }
  }
  const stubAudio = () => { FakeAudio.playResult = "ok"; vi.stubGlobal("window", {}); vi.stubGlobal("Audio", FakeAudio); };

  it("BA1 playCapMs uses the text rule, or the real duration plus 1 s when that is longer", () => {
    expect(playCapMs("hi")).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
    expect(playCapMs("hi", 10)).toBe(11000);
    expect(playCapMs("hi", 0.1)).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
    expect(playCapMs("hi", NaN)).toBe(SPEAK_BASE_MS + SPEAK_MS_PER_CHAR * 2);
  });

  it("BA2 an autoplay-blocked file reports failed", async () => {
    stubAudio();
    FakeAudio.playResult = "blocked";
    await expect(playUrl("/audio/x.mp3", "hello").done).resolves.toBe("failed");
  });

  it("BA3 ended event resolves ended; error event resolves failed", async () => {
    stubAudio();
    const a = playUrl("/audio/x.mp3", "hello");
    FakeAudio.last.onended?.();
    await expect(a.done).resolves.toBe("ended");
    const b = playUrl("/audio/y.mp3", "hello");
    FakeAudio.last.onerror?.();
    await expect(b.done).resolves.toBe("failed");
  });

  it("BA4 a stuck element is paused by the cap; a known long duration extends it", async () => {
    vi.useFakeTimers();
    stubAudio();
    const stuck = playUrl("/audio/x.mp3", "hi");
    const el = FakeAudio.last;
    let r: PlaybackResult | null = null;
    void stuck.done.then((x) => { r = x; });
    await vi.advanceTimersByTimeAsync(SPEAK_BASE_MS + AUDIO_MS_PER_CHAR * 2);
    expect(el.paused).toBe(true);
    expect(r).toBe("ended");

    const long = playUrl("/audio/z.mp3", "hi");
    const el2 = FakeAudio.last;
    el2.duration = 10;
    el2.onloadedmetadata?.();
    let r2: PlaybackResult | null = null;
    void long.done.then((x) => { r2 = x; });
    await vi.advanceTimersByTimeAsync(10999);
    expect(r2).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(r2).toBe("ended");
  });

  it("BA5 stop pauses the element and a second stop is harmless", async () => {
    stubAudio();
    const p = playUrl("/audio/x.mp3", "hello");
    p.stop();
    p.stop();
    expect(FakeAudio.last.paused).toBe(true);
    await expect(p.done).resolves.toBe("ended");
  });

  it("BA6 playBlob makes an object URL and revokes it", async () => {
    stubAudio();
    const created: string[] = [];
    const revoked: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: () => { created.push("blob:1"); return "blob:1"; },
      revokeObjectURL: (u: string) => { revoked.push(u); },
    });
    const p = playBlob(new Blob([new Uint8Array(3)]), "hello");
    expect(FakeAudio.last.src).toBe("blob:1");
    FakeAudio.last.onended?.();
    await p.done;
    expect(created).toEqual(["blob:1"]);
    expect(revoked).toEqual(["blob:1"]);
  });

  it("BA7 with no browser, audio stages fail, the browser voice ends, and fetchVoice is null", async () => {
    await expect(playUrl("/a.mp3", "x").done).resolves.toBe("failed");
    await expect(playBlob(new Blob([new Uint8Array(1)]), "x").done).resolves.toBe("failed");
    await expect(browserSpeak("x").done).resolves.toBe("ended");
    await expect(fetchVoice("x", new AbortController().signal)).resolves.toBeNull();
  });

  it("BA8 fetchVoice posts text and returns null on failure, empty audio, or abort", async () => {
    vi.stubGlobal("window", {});
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const blob = await fetchVoice("hello", new AbortController().signal);
    expect(blob?.size).toBe(3);
    expect(f.mock.calls[0][0]).toBe("/api/voice");
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ text: "hello" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    expect(await fetchVoice("hello", new AbortController().signal)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([]), { status: 200 })));
    expect(await fetchVoice("hello", new AbortController().signal)).toBeNull();
    const ctl = new AbortController();
    ctl.abort();
    expect(await fetchVoice("hello", ctl.signal)).toBeNull();
  });

  it("BA9 fetchVoice gives up after the text timeout and cancels the request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    let sig: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => {
      sig = init?.signal ?? undefined;
      return new Promise<Response>((_r, rej) => sig?.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))));
    }));
    const p = fetchVoice("hello", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(TEXT_TIMEOUT_MS);
    expect(await p).toBeNull();
    expect(sig?.aborted).toBe(true);
  });
});
