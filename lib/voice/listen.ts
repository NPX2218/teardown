// lib/voice/listen.ts — microphone → transcript (05 Task 3). Owner: Anders.
// Screen audio goes to the realtime socket with an ephemeral token. The API key stays on the server.
import {
  clearMicStream,
  holdVoiceState,
  micLevelFromSamples,
  noteMicLevel,
  setMicStream,
} from "@/lib/voice/activity";
import { runListenSession, REALTIME_PCM_RATE, type RealtimeConnectors } from "@/lib/voice/realtime";
import { defaultRealtimeConnect } from "@/lib/voice/realtime-connect";
import { onRocketMessage, sendToRocket } from "@/lib/voice/rocket-port";
import { TEXT_TIMEOUT_MS } from "@/lib/timeout";

const ROCKET_LISTEN_MS = 10_000;

export async function listenOnRocket(signal?: AbortSignal): Promise<string> {
  // The phone holds the microphone. This side only announces "listening".
  const release = holdVoiceState("listening");
  try {
    return await listenOnRocketOnce(signal);
  } finally {
    release();
  }
}

function listenOnRocketOnce(signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      offHeard();
      offErr();
      signal?.removeEventListener("abort", onAbort);
      try { sendToRocket({ k: "stopListen" }); } catch { /* phone is gone */ }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject("no-speech")), ROCKET_LISTEN_MS);
    const offHeard = onRocketMessage("heard", (m) => {
      if (m.k === "heard" && m.text.trim() !== "") finish(() => resolve(m.text.trim()));
    });
    const offErr = onRocketMessage("listenError", (m) => {
      if (m.k === "listenError") finish(() => reject(m.reason));
    });
    const onAbort = () => finish(() => reject("no-speech"));
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      sendToRocket({ k: "listen" });
    } catch {
      finish(() => reject("network"));
    }
  });
}

function floatToPcm16(chunks: Float32Array[]): Uint8Array {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(length * 2);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

async function capturePcm(signal?: AbortSignal): Promise<Uint8Array> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    throw "unsupported";
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw "denied";
    throw "unsupported";
  }
  setMicStream(stream);
  const release = holdVoiceState("listening");
  let ctx: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  const chunks: Float32Array[] = [];
  try {
    ctx = new AudioContext({ sampleRate: REALTIME_PCM_RATE });
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      const data = ev.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      noteMicLevel(micLevelFromSamples(data));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      const stop = () => {
        clearTimeout(timer);
        resolve();
      };
      if (signal?.aborted) stop();
      else signal?.addEventListener("abort", stop, { once: true });
    });
  } finally {
    try { processor?.disconnect(); } catch { /* already stopped */ }
    try { source?.disconnect(); } catch { /* already stopped */ }
    stream.getTracks().forEach((t) => t.stop());
    await ctx?.close().catch(() => {});
    clearMicStream(stream);
    release();
  }
  return floatToPcm16(chunks);
}

export async function listenOnScreen(
  signal?: AbortSignal,
  connect: RealtimeConnectors["connect"] = defaultRealtimeConnect,
): Promise<string> {
  const pcm = await capturePcm(signal);
  if (pcm.byteLength < 2) throw "no-speech";
  // The mic is closed. The transcript request is the start of thinking.
  const release = holdVoiceState("thinking");
  try {
    const res = await fetch("/api/voice/session", { method: "POST" });
    if (!res.ok) throw "network";
    const body: unknown = await res.json();
    const token = typeof body === "object" && body !== null ? (body as { value?: unknown }).value : undefined;
    if (typeof token !== "string" || token === "") throw "network";
    try {
      return await runListenSession({ token, pcm, connect, timeoutMs: TEXT_TIMEOUT_MS });
    } catch (err) {
      if (err === "no-speech" || err === "network" || err === "denied" || err === "unsupported") throw err;
      throw "network";
    }
  } finally {
    release();
  }
}

export async function listenOnce(source: "rocket" | "screen", signal?: AbortSignal): Promise<string> {
  return source === "rocket" ? listenOnRocket(signal) : listenOnScreen(signal);
}
