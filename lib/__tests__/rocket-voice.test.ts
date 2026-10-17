import { describe, it, expect, vi } from "vitest";
import type { RocketMessage } from "@/lib/types";
import {
  LAPTOP_LISTEN_WAIT_MS, LISTEN_MAX_MS, LISTEN_NO_SPEECH_MS, LISTEN_POST_MS, MIC_PROMPT_MS, LISTEN_SILENCE_MS, ListenFail, RocketEar, RocketVoice, VOICE_START_BUDGET_MS,
  listenVerdict, type EarDeps, type MicState, type Playback, type Recording, type VoiceDeps,
} from "@/lib/rocket/voice";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** A playback the test ends by hand. */
function manualPlayback() {
  let end: () => void = () => {};
  const done = new Promise<void>((r) => { end = r; });
  const pb: Playback & { stopped: number; end(): void } = { done, stopped: 0, stop() { pb.stopped++; end(); }, end: () => end() };
  return pb;
}

function voiceDeps(over: Partial<VoiceDeps> = {}) {
  const sent: RocketMessage[] = [];
  const ducks: boolean[] = [];
  const spoken: string[] = [];
  const played: ArrayBuffer[] = [];
  const fetched: { url: string; timeoutMs: number }[] = [];
  const playbacks: ReturnType<typeof manualPlayback>[] = [];
  let clock = 1000;
  const deps: VoiceDeps = {
    send: (m) => { sent.push(m); },
    duck: (on) => { ducks.push(on); },
    cachedUrl: async (k) => (k === "cached123456" ? `/audio/${k}.mp3` : null),
    fetchBytes: async (url, _init, timeoutMs) => { fetched.push({ url, timeoutMs }); return new ArrayBuffer(url.length); },
    playBytes: async (b) => { played.push(b); const p = manualPlayback(); playbacks.push(p); return p; },
    speakText: (t) => { spoken.push(t); const p = manualPlayback(); playbacks.push(p); return p; },
    now: () => clock,
    ...over,
  };
  return { deps, sent, ducks, spoken, played, fetched, playbacks, tick: (ms: number) => { clock += ms; } };
}
const saids = (sent: RocketMessage[]) => sent.filter((m) => m.k === "said").map((m) => (m.k === "said" ? m.id : ""));

describe("rocket voice: say (10 Task 6)", () => {
  it("RV-S1 cached file is used when the manifest has the key; said sent once at the end", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "a-1", cacheKey: "cached123456", text: "Liftoff!" });
    await flush();
    expect(t.fetched.map((f) => f.url)).toEqual(["/audio/cached123456.mp3"]);
    expect(t.spoken).toEqual([]);
    expect(saids(t.sent)).toEqual([]);
    expect(v.currentId()).toBe("a-1");
    t.playbacks[0].end();
    await flush();
    expect(saids(t.sent)).toEqual(["a-1"]);
    expect(v.currentId()).toBeNull();
  });

  it("RV-S2 manifest miss → POST /api/voice with the text", async () => {
    const inits: RequestInit[] = [];
    const t = voiceDeps({ fetchBytes: async (url, init) => { inits.push(init); return new ArrayBuffer(url.length); } });
    new RocketVoice(t.deps).say({ id: "b-1", cacheKey: "abcdefabcdef", text: "Hold it steady!" });
    await flush();
    expect(inits).toHaveLength(1);
    expect(inits[0].method).toBe("POST");
    expect(JSON.parse(String(inits[0].body))).toEqual({ text: "Hold it steady!" });
    expect(t.played).toHaveLength(1);
  });

  it("RV-S3 cached and /api/voice both fail → the phone's own voice speaks", async () => {
    const t = voiceDeps({ fetchBytes: async () => { throw new Error("HTTP 500"); } });
    new RocketVoice(t.deps).say({ id: "c-1", cacheKey: "cached123456", text: "Max-Q!" });
    await flush();
    expect(t.spoken).toEqual(["Max-Q!"]);
    t.playbacks[0].end();
    await flush();
    expect(saids(t.sent)).toEqual(["c-1"]);
  });

  it("RV-S4 the start budget bounds the fetches; past it, go straight to speech", async () => {
    const t = voiceDeps();
    t.deps.cachedUrl = async () => { t.tick(VOICE_START_BUDGET_MS); return null; }; // manifest took the whole budget
    new RocketVoice(t.deps).say({ id: "d-1", cacheKey: "abcdefabcdef", text: "Flip!" });
    await flush();
    expect(t.fetched).toEqual([]);
    expect(t.spoken).toEqual(["Flip!"]);

    const u = voiceDeps();
    new RocketVoice(u.deps).say({ id: "d-2", cacheKey: "abcdefabcdef", text: "Flip!" });
    await flush();
    expect(u.fetched[0].timeoutMs).toBeLessThanOrEqual(VOICE_START_BUDGET_MS);
  });

  it("RV-S4b a manifest lookup that never answers can't block the line past the budget", async () => {
    vi.useFakeTimers();
    try {
      const t = voiceDeps({ cachedUrl: () => new Promise<string | null>(() => {}), now: () => Date.now() }); // fake timers move Date
      new RocketVoice(t.deps).say({ id: "d-3", cacheKey: "abcdefabcdef", text: "Hello" });
      await vi.advanceTimersByTimeAsync(VOICE_START_BUDGET_MS);
      await flush();
      // budget used up waiting for the manifest → straight to the phone's voice
      expect(t.fetched).toEqual([]);
      expect(t.spoken).toEqual(["Hello"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("RV-S5 a new say stops the current one; each id gets exactly one said, old first", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "e-1", cacheKey: "cached123456", text: "One" });
    await flush();
    v.say({ id: "e-2", cacheKey: "cached123456", text: "Two" });
    expect(t.playbacks[0].stopped).toBe(1);
    expect(saids(t.sent)).toEqual(["e-1"]);
    await flush();
    t.playbacks[1].end();
    await flush();
    expect(saids(t.sent)).toEqual(["e-1", "e-2"]);
  });

  it("RV-S6 stopSay: matching id or no id stops it; another id is ignored", async () => {
    const t = voiceDeps();
    const v = new RocketVoice(t.deps);
    v.say({ id: "f-1", cacheKey: "cached123456", text: "One" });
    await flush();
    v.stopSay("zz-9");
    expect(v.currentId()).toBe("f-1");
    v.stopSay("f-1");
    expect(saids(t.sent)).toEqual(["f-1"]);
    v.say({ id: "f-2", cacheKey: "cached123456", text: "Two" });
    await flush();
    v.stopSay();
    expect(saids(t.sent)).toEqual(["f-1", "f-2"]);
    v.stopSay(); // nothing playing: no extra said
    await flush();
    expect(saids(t.sent)).toEqual(["f-1", "f-2"]);
  });

  it("RV-S7 rumble ducks while talking and comes back, even when every source fails", async () => {
    const t = voiceDeps({
      fetchBytes: async () => { throw new Error("offline"); },
      speakText: () => ({ done: Promise.reject(new Error("no voice")), stop: () => {} }),
    });
    new RocketVoice(t.deps).say({ id: "g-1", cacheKey: "cached123456", text: "Hi" });
    await flush();
    expect(t.ducks).toEqual([true, false]);
    expect(saids(t.sent)).toEqual(["g-1"]);
  });

  it("RV-S8 audio that arrives after its line was stopped is stopped and ignored", async () => {
    let release: (b: ArrayBuffer) => void = () => {};
    const t = voiceDeps({ fetchBytes: () => new Promise<ArrayBuffer>((r) => { release = r; }) });
    const v = new RocketVoice(t.deps);
    v.say({ id: "h-1", cacheKey: "cached123456", text: "Late" });
    await flush();
    v.stopSay("h-1");
    release(new ArrayBuffer(4));
    await flush();
    expect(t.played).toHaveLength(0);
    expect(t.spoken).toHaveLength(0);
    expect(saids(t.sent)).toEqual(["h-1"]);
    expect(t.ducks).toEqual([true, false]);
  });
});

function earDeps(over: Partial<EarDeps> = {}, mic: MicState = "granted") {
  const sent: RocketMessage[] = [];
  const listening: boolean[] = [];
  const ducks: boolean[] = [];
  let resolveClip: (b: Blob | null) => void = () => {};
  const rec: Recording & { stopped: number } = {
    done: new Promise<Blob | null>((r) => { resolveClip = r; }),
    stopped: 0,
    stop() { rec.stopped++; resolveClip(new Blob(["partial"], { type: "audio/webm" })); },
  };
  const deps: EarDeps = {
    send: (m) => { sent.push(m); },
    setListening: (on) => { listening.push(on); },
    duck: (on) => { ducks.push(on); },
    blip: () => {},
    micState: () => mic,
    startRecording: async () => rec,
    postAudio: async () => "  why nine engines?  ",
    ...over,
  };
  return { deps, sent, listening, ducks, rec, finish: (b: Blob | null) => resolveClip(b) };
}

describe("rocket voice: listen (10 Task 6)", () => {
  it("RV-L1 mic denied at the start tap → listenError denied, no recording", async () => {
    const start = vi.fn();
    const t = earDeps({ startRecording: start }, "denied");
    new RocketEar(t.deps).listen();
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "denied" }]);
    expect(start).not.toHaveBeenCalled();
    // denied while recording (iPhone re-prompt) also maps to denied
    const u = earDeps({ startRecording: async () => { throw new ListenFail("denied"); } });
    new RocketEar(u.deps).listen();
    await flush();
    expect(u.sent).toEqual([{ k: "listenError", reason: "denied" }]);
    expect(u.listening).toEqual([true, false]);
  });

  it("RV-L2 no MediaRecorder or listening switched off → unsupported", async () => {
    const t = earDeps({ startRecording: async () => { throw new ListenFail("unsupported"); } });
    new RocketEar(t.deps).listen();
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "unsupported" }]);
    const off = earDeps();
    new RocketEar(off.deps, false).listen();
    await flush();
    expect(off.sent).toEqual([{ k: "listenError", reason: "unsupported" }]);
  });

  it("RV-L3 success → heard with trimmed text; UI and ducking reset", async () => {
    const t = earDeps();
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(new Blob(["audio"], { type: "audio/mp4" }));
    await flush();
    expect(t.sent).toEqual([{ k: "heard", text: "why nine engines?" }]);
    expect(t.listening).toEqual([true, false]);
    expect(t.ducks).toEqual([true, false]);
  });

  it("RV-L4 /api/listen fails or times out → network", async () => {
    const t = earDeps({ postAudio: async () => { throw new Error("aborted"); } });
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(new Blob(["audio"]));
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "network" }]);
  });

  it("RV-L5 nobody spoke or empty transcript → no-speech", async () => {
    const t = earDeps();
    new RocketEar(t.deps).listen();
    await flush();
    t.finish(null);
    await flush();
    expect(t.sent).toEqual([{ k: "listenError", reason: "no-speech" }]);
    const u = earDeps({ postAudio: async () => "   " });
    new RocketEar(u.deps).listen();
    await flush();
    u.finish(new Blob(["audio"]));
    await flush();
    expect(u.sent).toEqual([{ k: "listenError", reason: "no-speech" }]);
  });

  it("RV-L6 a second listen while listening is ignored", async () => {
    const start = vi.fn();
    const t = earDeps();
    const orig = t.deps.startRecording;
    t.deps.startRecording = () => { start(); return orig(); };
    const ear = new RocketEar(t.deps);
    ear.listen();
    ear.listen();
    await flush();
    expect(start).toHaveBeenCalledTimes(1);
    t.finish(new Blob(["a"]));
    await flush();
    expect(t.sent).toHaveLength(1);
  });

  it("RV-L7 stopListen ends the recording and still sends what was heard", async () => {
    const posted: Blob[] = [];
    const t = earDeps({ postAudio: async (b) => { posted.push(b); return "let's fly"; } });
    const ear = new RocketEar(t.deps);
    ear.listen();
    await flush();
    ear.stopListen();
    await flush();
    expect(t.rec.stopped).toBe(1);
    expect(posted).toHaveLength(1);
    expect(t.sent).toEqual([{ k: "heard", text: "let's fly" }]);
  });

  it("RV-L8 mic-level rule", () => {
    expect(listenVerdict(0, null, LISTEN_NO_SPEECH_MS - 1)).toBe("continue");
    expect(listenVerdict(0, null, LISTEN_NO_SPEECH_MS)).toBe("no-speech");
    expect(listenVerdict(0, 1000, 1000 + LISTEN_SILENCE_MS - 1)).toBe("continue");
    expect(listenVerdict(0, 1000, 1000 + LISTEN_SILENCE_MS)).toBe("stop");
    expect(listenVerdict(0, LISTEN_MAX_MS - 100, LISTEN_MAX_MS)).toBe("stop"); // still talking at the max
  });

  it("RV-L9 worst-case listen fits inside the laptop's wait (else a double answer)", () => {
    expect(MIC_PROMPT_MS + LISTEN_MAX_MS + LISTEN_POST_MS).toBeLessThanOrEqual(LAPTOP_LISTEN_WAIT_MS - 500);
  });
});
