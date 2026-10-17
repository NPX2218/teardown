// lib/mascot/voice-bridge.ts — subscribe to Anders's voice bus when it exists. Owner: Neel.
//
// lib/voice/activity.ts is not on this branch (it lands with PR #7,
// cursor/voice-realtime-dfdf @ 0d5977e). It exports onVoiceState, getMicStream,
// and getOutputNode. States: idle, listening, user-speaking, thinking, speaking.
//
// One line once both sides are in the same build:
//
//   import { onVoiceState } from "@/lib/voice/activity";
//   import { bindVoiceActivity } from "@/lib/mascot/voice-bridge";
//   bindVoiceActivity(onVoiceState);
//
// That mirrors the five states, attaches the mic analyser to snap.mic
// (getMicStream) and the speech analyser to snap.output (getOutputNode).
// No mic (phone hold): listening keeps the dots breathing.
// No output node (speechSynthesis or the phone speaker): speaking uses a
// synthetic mouth instead of analysed audio.
//
// The guide launcher also calls connectVoiceActivity(), which tries a runtime
// import and no-ops while the module is absent, so this branch still builds.
import { setMicLive, setSpeechLive, setVoiceState, type MascotVoice } from "./activity";
import { attachAnalyser } from "./analyser";

export interface VoiceActivityLike {
  state: MascotVoice;
  /** Laptop mic from getMicStream(). Null on a phone hold. */
  mic: MediaStream | null;
  /** Playback element from getOutputNode(). Null for speechSynthesis and the phone. */
  output: HTMLAudioElement | MediaStream | null;
}

interface VoiceModule {
  onVoiceState: (listener: (snap: VoiceActivityLike) => void) => () => void;
}

/**
 * Subscribe to onVoiceState. Re-attaches a meter only when the stream or
 * element identity changes, so a listening → user-speaking flip does not
 * restart the smoother.
 */
export function bindVoiceActivity(
  onVoiceState: (listener: (snap: VoiceActivityLike) => void) => () => void,
): () => void {
  let micSource: VoiceActivityLike["mic"] = null;
  let speechSource: VoiceActivityLike["output"] = null;
  let stopMic: (() => void) | null = null;
  let stopSpeech: (() => void) | null = null;

  const unsub = onVoiceState((snap) => {
    setVoiceState(snap.state);
    if (snap.mic !== micSource) {
      stopMic?.();
      stopMic = null;
      micSource = snap.mic;
      if (snap.mic) stopMic = attachAnalyser(snap.mic, "mic");
      else setMicLive(false);
    }
    if (snap.output !== speechSource) {
      stopSpeech?.();
      stopSpeech = null;
      speechSource = snap.output;
      if (snap.output) stopSpeech = attachAnalyser(snap.output, "speech");
      else setSpeechLive(false);
    }
  });

  return () => {
    unsub();
    stopMic?.();
    stopSpeech?.();
    stopMic = null;
    stopSpeech = null;
    micSource = null;
    speechSource = null;
    setMicLive(false);
    setSpeechLive(false);
  };
}

async function loadVoiceModule(): Promise<VoiceModule | null> {
  try {
    // A direct import() would fail this branch's build: the file is not here yet.
    const dynamicImport = new Function("spec", "return import(spec)") as (spec: string) => Promise<VoiceModule>;
    const mod = await dynamicImport("@/lib/voice/activity");
    if (!mod || typeof mod.onVoiceState !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

/** Try the optional voice module. Returns a stop function either way. */
export function connectVoiceActivity(): () => void {
  let stop = () => {};
  let cancelled = false;
  void loadVoiceModule().then((mod) => {
    if (cancelled || !mod) return;
    stop = bindVoiceActivity(mod.onVoiceState);
  });
  return () => {
    cancelled = true;
    stop();
  };
}
