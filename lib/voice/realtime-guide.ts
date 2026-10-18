// lib/voice/realtime-guide.ts — mascot Voice button on the grok-voice socket.
// Mints nothing itself: the browser posts /api/voice/session, then speaks with the ephemeral token.
// Only start_tour and set_level are registered. Flight tools stay on the text agent.
import { runTool, TOOLS } from "@/lib/agent/tools";
import {
  clearMicStream,
  holdVoiceState,
  micLevelFromSamples,
  noteMicLevel,
  setMicStream,
} from "@/lib/voice/activity";
import {
  browserSocketProtocols,
  bytesToBase64,
  REALTIME_PCM_RATE,
  realtimeUrl,
  type RealtimeConnectors,
} from "@/lib/voice/realtime";
import { defaultRealtimeConnect } from "@/lib/voice/realtime-connect";
import { GROK_VOICE } from "@/lib/voice/format";

const GUIDE_TOOL_NAMES = ["start_tour", "set_level"] as const;

export const VOICE_CONNECT_MESSAGE = "Voice didn't connect. Use Text, or try again.";
const MIC_BLOCKED = "The microphone is blocked. Allow it, or use Text.";
const MIC_MISSING = "This browser has no microphone. Use Text.";

export class VoiceUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceUnavailable";
  }
}

/** Flat realtime function tools. The chat TOOLS shape nests the schema under `function`. */
export function sessionUpdateForGuide(voice = GROK_VOICE): Record<string, unknown> {
  const tools = TOOLS.filter((tool) =>
    (GUIDE_TOOL_NAMES as readonly string[]).includes(tool.function.name),
  ).map((tool) => ({
    type: "function" as const,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
  return {
    type: "session.update",
    session: {
      voice,
      instructions:
        "You are the exhibit guide. When the visitor asks for a tour, call start_tour. When they ask how you should explain, call set_level with kid, curious, or engineer. Do not launch, steer, or award a flight.",
      turn_detection: { type: "server_vad" },
      audio: {
        input: { format: { type: "audio/pcm", rate: REALTIME_PCM_RATE } },
        output: { format: { type: "audio/pcm", rate: REALTIME_PCM_RATE } },
      },
      tools,
    },
  };
}

interface PendingCall {
  call_id: string;
  output: string;
}

function functionCall(event: unknown): { name: string; callId: string; arguments: unknown } | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; name?: unknown; call_id?: unknown; arguments?: unknown };
  if (e.type !== "response.function_call_arguments.done") return null;
  if (typeof e.name !== "string" || typeof e.call_id !== "string") return null;
  return { name: e.name, callId: e.call_id, arguments: e.arguments };
}

function audioDelta(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const e = event as { type?: unknown; delta?: unknown; audio?: unknown };
  if (e.type !== "response.output_audio.delta" && e.type !== "response.audio.delta") return null;
  if (typeof e.delta === "string") return e.delta;
  if (typeof e.audio === "string") return e.audio;
  return null;
}

let playbackCtx: AudioContext | null = null;
let playbackNext = 0;

/** Plays PCM16 deltas when a browser AudioContext exists. No-op in Node. */
function playPcm16(b64: string, playbackEndsAt: { ms: number }): void {
  if (typeof AudioContext === "undefined" || typeof atob !== "function") return;
  let binary: string;
  try { binary = atob(b64); } catch { return; }
  if (binary.length < 2) return;
  try {
    const ctx = playbackCtx ?? new AudioContext({ sampleRate: REALTIME_PCM_RATE });
    playbackCtx = ctx;
    const samples = binary.length >> 1;
    const buffer = ctx.createBuffer(1, samples, REALTIME_PCM_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i += 1) {
      const lo = binary.charCodeAt(i * 2);
      const hi = binary.charCodeAt(i * 2 + 1);
      let value = (hi << 8) | lo;
      if (value >= 0x8000) value -= 0x10000;
      channel[i] = value / 0x8000;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = Math.max(ctx.currentTime, playbackNext);
    source.start(start);
    playbackNext = start + buffer.duration;
    playbackEndsAt.ms = Math.max(playbackEndsAt.ms, performance.now() + buffer.duration * 1000);
  } catch {
    /* No output device. The tool result still goes back. */
  }
}

/** Cuts any Grok audio still queued. Closing the context stops every scheduled buffer. */
function stopGuidePlayback(): void {
  const ctx = playbackCtx;
  playbackCtx = null;
  playbackNext = 0;
  void ctx?.close().catch(() => {});
}

function pcm16FromFloat(data: Float32Array): Uint8Array {
  const out = new Uint8Array(data.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < data.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return out;
}

/** Streams the laptop mic as PCM appends until abort. Throws VoiceUnavailable when the mic cannot open. */
export async function streamMicTo(signal: AbortSignal, append: (pcm: Uint8Array) => void): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
    throw new VoiceUnavailable(MIC_MISSING);
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
    throw new VoiceUnavailable(name === "NotAllowedError" || name === "SecurityError" ? MIC_BLOCKED : MIC_MISSING);
  }
  if (signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  setMicStream(stream);
  const release = holdVoiceState("listening");
  let ctx: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  try {
    ctx = new AudioContext({ sampleRate: REALTIME_PCM_RATE });
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      if (signal.aborted) return;
      const data = ev.inputBuffer.getChannelData(0);
      noteMicLevel(micLevelFromSamples(data));
      append(pcm16FromFloat(data));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
    await new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    try { processor?.disconnect(); } catch { /* already stopped */ }
    try { source?.disconnect(); } catch { /* already stopped */ }
    stream.getTracks().forEach((track) => track.stop());
    await ctx?.close().catch(() => {});
    clearMicStream(stream);
    release();
  }
}

async function waitForPlayback(endsAt: number, signal?: AbortSignal): Promise<void> {
  const wait = endsAt - performance.now();
  if (wait <= 20) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, wait);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * One grok-voice socket. Sends session.update first, runs start_tour / set_level on
 * function-call events, then returns each result and asks for the spoken follow-up.
 */
export async function runRealtimeGuideSession(opts: {
  token: string;
  connect: RealtimeConnectors["connect"];
  signal?: AbortSignal;
  voice?: string;
  captureMic?: (signal: AbortSignal, append: (pcm: Uint8Array) => void) => Promise<void> | void;
}): Promise<void> {
  if (opts.signal?.aborted) return;
  const opened = opts.connect(realtimeUrl(), browserSocketProtocols(opts.token));
  const { socket, messages } = opened;
  const release = holdVoiceState("listening");
  const pending: PendingCall[] = [];
  const playbackEndsAt = { ms: 0 };
  let closed = false;
  let handedOff = false;
  const send = (event: unknown) => {
    if (closed) return;
    try { socket.send(JSON.stringify(event)); } catch { /* socket already gone */ }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    try { socket.close(); } catch { /* already closed */ }
  };
  const flush = async () => {
    if (pending.length === 0 || opts.signal?.aborted) return;
    const batch = pending.splice(0, pending.length);
    for (const call of batch) {
      send({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: call.call_id, output: call.output },
      });
    }
    await waitForPlayback(playbackEndsAt.ms, opts.signal);
    if (opts.signal?.aborted) return;
    send({ type: "response.create" });
  };

  const micAbort = new AbortController();
  const onAbort = () => {
    micAbort.abort();
    close();
  };
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  send(sessionUpdateForGuide(opts.voice ?? GROK_VOICE));

  const micTask = (async () => {
    if (!opts.captureMic) return;
    await opts.captureMic(micAbort.signal, (pcm) => {
      send({ type: "input_audio_buffer.append", audio: bytesToBase64(pcm) });
    });
  })();
  const micResult = micTask.then(
    () => undefined as unknown,
    (err: unknown) => {
      close();
      return err;
    },
  );

  try {
    for await (const raw of messages) {
      if (opts.signal?.aborted) break;
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { continue; }
      const call = functionCall(parsed);
      if (call) {
        const result = await runTool(call.name, call.arguments);
        // The tour narrates itself. If Grok keeps talking (and the mic keeps hearing the tour),
        // the two voices overlap, so a started tour ends this session.
        if (call.name === "start_tour" && result.ok) {
          stopGuidePlayback();
          handedOff = true;
          break;
        }
        pending.push({ call_id: call.callId, output: JSON.stringify(result) });
      }
      const delta = audioDelta(parsed);
      if (delta) playPcm16(delta, playbackEndsAt);
      const type = typeof parsed === "object" && parsed !== null ? (parsed as { type?: unknown }).type : undefined;
      if (type === "response.done") await flush();
    }
    if (!opts.signal?.aborted && !handedOff) await flush();
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    micAbort.abort();
    close();
    release();
  }
  const micErr = await micResult;
  if (micErr && !opts.signal?.aborted) throw micErr;
}

/** Voice button entry. Posts for an ephemeral token, then opens the guide socket. */
export async function startMascotVoice(opts: {
  signal: AbortSignal;
  connect?: RealtimeConnectors["connect"];
  fetcher?: typeof fetch;
  captureMic?: (signal: AbortSignal, append: (pcm: Uint8Array) => void) => Promise<void> | void;
  voice?: string;
}): Promise<void> {
  if (opts.signal.aborted) return;
  const fetcher = opts.fetcher ?? fetch;
  let res: Response;
  try {
    res = await fetcher("/api/voice/session", { method: "POST", signal: opts.signal });
  } catch {
    if (opts.signal.aborted) return;
    throw new VoiceUnavailable(VOICE_CONNECT_MESSAGE);
  }
  if (!res.ok) {
    let message = VOICE_CONNECT_MESSAGE;
    try {
      const body: unknown = await res.json();
      const error = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
      if (typeof error === "string" && error.trim() !== "") message = error;
    } catch { /* keep the generic line */ }
    throw new VoiceUnavailable(message);
  }
  let token = "";
  try {
    const body: unknown = await res.json();
    const value = typeof body === "object" && body !== null ? (body as { value?: unknown }).value : undefined;
    if (typeof value === "string") token = value;
  } catch { /* empty token below */ }
  if (token.trim() === "") throw new VoiceUnavailable(VOICE_CONNECT_MESSAGE);
  try {
    await runRealtimeGuideSession({
      token,
      connect: opts.connect ?? defaultRealtimeConnect,
      signal: opts.signal,
      voice: opts.voice,
      captureMic: opts.captureMic === undefined ? streamMicTo : opts.captureMic,
    });
  } catch (err) {
    if (opts.signal.aborted) return;
    if (err instanceof VoiceUnavailable) throw err;
    throw new VoiceUnavailable(VOICE_CONNECT_MESSAGE);
  }
}
