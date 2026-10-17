"use client";
// app/rocket/page.tsx — the phone inside the model rocket (10 Tasks 2, 3, 4, 6). Owner: Neel.
// The phone is only a sensor and a speaker: all game logic stays on the laptop.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SOUND_IDS, type RocketFrame, type RocketMessage, type ShellStatusLevel, type ShellStatusWord, type SoundId } from "@/lib/types";
import { cameraInsetSide } from "@/lib/rocket/mount";
import { isIOS, requestMotionPermission, usePhoneSensors, type SensorDebug } from "@/lib/rocket/usePhoneSensors";
import { holdEngineRumble, resumeEngineRumble, setEngineRumble, stopEngineRumble } from "@/lib/rocket/engine-rumble";
import {
  getAudioContext, loopingNow, playSound, preloadSounds, setPlaybackSession, stopSound, subscribeSounds, unlockAudio,
  vibrate,
} from "@/lib/rocket/sound";
import {
  PHONE_LISTEN_ENABLED, RocketEar, RocketVoice, browserEarDeps, browserVoiceDeps, primeMic, primeSpeech,
} from "@/lib/rocket/voice";
import { RETRY_MS, hasStatusWord, parsePairCode, routePhoneMessage, statusWord, type LinkState } from "@/lib/rocket/phone";
import { openLink, type RocketLink } from "@/lib/rocket/link";
import { Credits } from "@/components/ui/Credits";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import css from "./rocket.module.css";

// Sounds that make the flame flicker harder (plan 10 Task 4 Step 4).
const RUMBLES: readonly SoundId[] = ["liftoff_rumble", "maxq_rumble", "entry_burn"];
const NO_LOOPS: SoundId[] = []; // stable server snapshot for useSyncExternalStore

/** Fullscreen first (a user gesture), then landscape-primary. Android Chrome supports both. */
async function lockLandscape(): Promise<void> {
  const root = document.documentElement;
  if (!document.fullscreenElement && typeof root.requestFullscreen === "function") {
    try { await root.requestFullscreen(); } catch { /* already fullscreen, or the browser refused */ }
  }
  const orientation = screen.orientation as ScreenOrientation & { lock?: (kind: string) => Promise<void> };
  if (typeof orientation.lock !== "function") return;
  try {
    await orientation.lock("landscape-primary");
  } catch {
    try { await orientation.lock("landscape"); } catch { /* desktop, or the lock was denied */ }
  }
}

type Phase = "start" | "starting" | "running" | "denied" | "insecure";

export default function RocketPage() {
  const [phase, setPhase] = useState<Phase>("start");
  const [linkState, setLinkState] = useState<LinkState>("nocode");
  const linkStateRef = useRef<LinkState>("nocode");   // read by the visibility handler without re-subscribing
  linkStateRef.current = linkState;
  const hiddenAt = useRef(0);                           // when the page last went hidden
  const [code, setCode] = useState<string | null>(null);
  const [debugOn, setDebugOn] = useState(false);
  const [wakeOk, setWakeOk] = useState(true);
  const [silentHint, setSilentHint] = useState(false);
  const [audioAsleep, setAudioAsleep] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastSound, setLastSound] = useState<SoundId | null>(null);
  const [ios, setIos] = useState(false);              // read after mount (no server/client mismatch)
  const [noSession, setNoSession] = useState(false);  // iPhone without navigator.audioSession → silent switch can mute us
  const [shellWord, setShellWord] = useState<ShellStatusWord | null>(null);
  const [shellLevel, setShellLevel] = useState<ShellStatusLevel>("ok");
  const [flashing, setFlashing] = useState(false);
  const [orientAngle, setOrientAngle] = useState(0);
  const flashTimer = useRef<number | null>(null);

  const linkRef = useRef<RocketLink | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const openingRef = useRef(false);
  const aliveRef = useRef(true);

  const send = useCallback((m: RocketMessage) => linkRef.current?.send(m), []);
  // Made once (lazy state), and they send through whatever link is current.
  const [voice] = useState(() => new RocketVoice(browserVoiceDeps(send)));
  const [ear] = useState(() => new RocketEar(browserEarDeps(send, setListening)));

  const reduce = useReducedMotion();
  const looping = useSyncExternalStore(subscribeSounds, loopingNow, () => NO_LOOPS);
  const rumbling = looping.some((id) => RUMBLES.includes(id));

  // Read ?code= and ?debug=1 once; mark the page as an exhibit surface.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setCode(parsePairCode(q.get("code")));
    setDebugOn(q.get("debug") === "1");
    setIos(isIOS());
    setNoSession(isIOS() && !("audioSession" in navigator));
    if (!window.isSecureContext) setPhase("insecure");
    document.body.classList.add("kiosk");
    const readAngle = () => setOrientAngle(screen.orientation?.angle ?? 0);
    readAngle();
    screen.orientation?.addEventListener("change", readAngle);
    return () => {
      document.body.classList.remove("kiosk");
      screen.orientation?.removeEventListener("change", readAngle);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const onMessage = useCallback((m: RocketMessage) => {
    // Hidden page: ignore new work (the visibility handler already stopped everything); stop commands still run.
    if (document.visibilityState === "hidden" && (m.k === "say" || m.k === "sound" || m.k === "listen" || m.k === "vibrate")) return;
    routePhoneMessage(m, {
      playSound: (id, opts) => { playSound(id, opts); if (hasStatusWord(id)) setLastSound(id); },
      stopSound: (id) => { stopSound(id); if (id === undefined) setLastSound(null); }, // "stop all" = new flight
      vibrate,
      say: () => {},
      stopSay: () => {},
      listen: () => ear.listen(),
      stopListen: () => ear.stopListen(),
      showStatus: (word, level, flash) => {
        setShellWord(word);
        setShellLevel(level);
        // Vibration is muffled inside the shell and missing on iOS. The colour flash is the backup.
        if (level === "bad") vibrate([200, 80, 200, 80, 600]);
        else if (level === "warn" && word !== "HOLD") vibrate([120]);
        if (flash) {
          setFlashing(true);
          if (flashTimer.current) window.clearTimeout(flashTimer.current);
          flashTimer.current = window.setTimeout(() => setFlashing(false), 1200);
        }
      },
      calibrate: () => {
        setShellWord("HOLD");
        setShellLevel("warn");
      },
      setEngine: (power) => setEngineRumble(power),
    });
  }, [ear]);

  /** Close any old link and join the exhibit's channel again. Safe to call often. */
  const connect = useCallback(async () => {
    if (!code || openingRef.current) return;
    openingRef.current = true;
    linkRef.current?.close();
    linkRef.current = null;
    setLinkState("connecting");
    try {
      const l = await openLink(code, "phone", onMessage);
      if (!aliveRef.current) { l.close(); return; } // page left while joining
      linkRef.current = l;
      setLastSound(null);
      setLinkState("connected");
    } catch {
      if (aliveRef.current) setLinkState("offline"); // swallow: the retry timer below tries again
    } finally {
      openingRef.current = false;
    }
  }, [code, onMessage]);

  const running = phase === "running";

  // No paired laptop, or the link dropped: the phone speaker goes quiet. The last power is kept.
  useEffect(() => {
    if (!running) return;
    holdEngineRumble("link", linkState !== "connected");
  }, [running, linkState]);

  // Join after the start tap; retry while offline.
  useEffect(() => {
    if (!running || !code) return;
    void connect();
  }, [running, code, connect]);
  useEffect(() => {
    if (!running || linkState !== "offline") return;
    const t = setInterval(() => void connect(), RETRY_MS);
    return () => clearInterval(t);
  }, [running, linkState, connect]);

  const requestWake = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) { setWakeOk(false); return; }
      if (wakeRef.current && !wakeRef.current.released) return;
      const lock = await navigator.wakeLock.request("screen");
      wakeRef.current = lock;
      // The browser may drop it (low battery): ask again if we are still on screen.
      lock.addEventListener("release", () => {
        if (aliveRef.current && document.visibilityState === "visible") void requestWake();
      });
      setWakeOk(true);
    } catch {
      setWakeOk(false); // swallow: show the "Set Auto-Lock to Never" hint
    }
  }, []);

  // Phone locked / tab hidden → stop talking and sounds. Back → wake lock, audio, fresh link.
  // Network gone → OFFLINE at once (the retry timer takes over); back → reconnect.
  useEffect(() => {
    if (!running) return;
    const ctx = getAudioContext();
    const checkAudio = () => setAudioAsleep(!!ctx && ctx.state !== "running");
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        voice.stopSay();
        ear.stopListen();
        stopSound();
        holdEngineRumble("hidden", true);
        return;
      }
      holdEngineRumble("hidden", false);
      void requestWake();
      // Android usually resumes without a tap; iPhone often needs the wake button.
      void ctx?.resume().catch(() => {}).finally(checkAudio);
      if (linkStateRef.current !== "connected" || Date.now() - hiddenAt.current > 3000) void connect(); // relay sockets often die while locked; a brief app switch on a healthy link does not need a rejoin
    };
    const onOnline = () => void connect();
    const onOffline = () => setLinkState("offline");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    ctx?.addEventListener("statechange", checkAudio); // iPhone reports "interrupted" late (calls, Siri)
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      ctx?.removeEventListener("statechange", checkAudio);
    };
  }, [running, connect, requestWake, voice, ear]);

  // Leaving the page: close the link and release the wake lock.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      voice.stopSay();   // client navigation must not leave narration, recording or ducking running
      ear.stopListen();
      stopSound();
      stopEngineRumble();
      linkRef.current?.close();
      linkRef.current = null;
      void wakeRef.current?.release().catch(() => {});
    };
  }, [voice, ear]);

  const onFrame = useCallback((f: RocketFrame) => {
    linkRef.current?.send({ k: "frame", q: f.q, lin: f.lin, grav: f.grav });
  }, []);
  const { debug, noSensors } = usePhoneSensors(onFrame, running);

  /** The one tap. Order matters on iPhone: everything that needs the tap runs before the first await. */
  const start = async () => {
    setPhase("starting");
    unlockAudio();                                    // Web Audio needs a tap
    resumeEngineRumble();                             // same tap unlocks the synthesized rumble
    const sessionOk = setPlaybackSession();           // iPhone: play even with the silent switch on
    setSilentHint(ios && !sessionOk);
    primeSpeech();                                    // no-op: Grok speech stays on the laptop
    const motion = requestMotionPermission();         // iPhone: both motion prompts inside the tap
    void lockLandscape();                             // Android: landscape-primary after fullscreen, inside the tap
    // Start the mic prompt inside the tap too (iPhone drops user activation after a slow await); join both.
    // An unanswered mic prompt must not block the rocket: give it 8 s (the text timeout rule), then go on.
    const mic = PHONE_LISTEN_ENABLED
      ? Promise.race([primeMic(), new Promise<void>((res) => setTimeout(res, 8000))])
      : Promise.resolve();
    const [motionResult] = await Promise.all([motion, mic]);
    if (motionResult === "denied") { setPhase("denied"); return; }
    void requestWake();
    void preloadSounds();                             // missing files stay silent; early loops start when loaded
    setAudioAsleep(false);
    setPhase("running");
  };

  const wakeAudio = async () => {
    const ctx = unlockAudio(); // resume inside this tap
    try { await ctx?.resume(); } catch { /* checked below */ }
    setAudioAsleep(!!ctx && ctx.state !== "running");
  };

  const word = shellWord && linkState === "connected" && !listening
    ? shellWord
    : linkState === "connected" && !listening && !shellWord
      ? "HOLD"
      : statusWord(linkState, listening, lastSound);
  const level: ShellStatusLevel = linkState === "offline" || linkState === "nocode"
    ? "bad"
    : shellWord && linkState === "connected"
      ? shellLevel
      : word === "HOLD" ? "warn" : "ok";
  const camera = cameraInsetSide(orientAngle);

  // ---------------- render ----------------
  if (phase === "insecure") {
    return (
      <main className={`phone ${css.shell}`} data-camera={camera} data-level={level}>
        <div />
        <section className={`card phone__status ${css.band}`}>
          <p className="lead">Open this page with https:// so the phone can feel motion.</p>
        </section>
        <Credits />
      </main>
    );
  }

  if (phase === "start" || phase === "starting") {
    return (
      <main className={`phone ${css.shell}`} data-camera={camera} data-level={level}>
        <div />
        <section className={`phone__status stack ${css.band}`}>
          <button className="btn btn-accent btn-lg attract" onClick={() => void start()} disabled={phase === "starting"}>
            Tap to start your rocket
          </button>
          {noSession && (
            <p className="card"><span className="chip chip--warn">Turn off silent mode so the rocket can talk</span></p>
          )}
        </section>
        <Credits />
      </main>
    );
  }

  if (phase === "denied") {
    return (
      <main className={`phone ${css.shell}`} data-camera={camera} data-level={level}>
        <div />
        <section className={`card phone__status stack ${css.band}`}>
          <p className="lead">
            {ios
              ? "Motion is off. Close Safari, scan the code again and tap Allow. Older iPhones: Settings → Safari → Motion & Orientation Access."
              : "Motion is off. Allow motion sensors for this site, then tap Try again."}
          </p>
          <button className="btn btn-accent" onClick={() => void start()}>Try again</button>
        </section>
        <Credits />
      </main>
    );
  }

  return (
    <main className={`phone ${css.shell}`} data-camera={camera} data-level={level}>
      <header className={css.edge} aria-live="polite">
        {linkState === "connected" && <span className="chip chip--ok">Connected to exhibit {code}</span>}
        {linkState === "connecting" && <span className="chip">Connecting…</span>}
        {linkState === "offline" && <span className="chip chip--bad">OFFLINE · Can&apos;t reach the exhibit. Check Wi-Fi.</span>}
        {linkState === "nocode" && <span className="chip chip--warn">Scan the QR code on the exhibit screen to connect.</span>}
        {!wakeOk && <span className="chip chip--warn">Set Auto-Lock to Never</span>}
        {silentHint && <span className="chip chip--warn">Turn off silent mode</span>}
      </header>

      <section className={`phone__status ${css.band}`}>
        {noSensors ? (
          <div className="card stack">
            <span className="chip chip--bad">NO SENSORS</span>
            <p className="lead">This phone can&apos;t feel motion. Try another phone.</p>
            {!ios && <p className="small">Android: Chrome menu → Site settings → Motion sensors → Allow.</p>}
          </div>
        ) : (
          <>
            {linkState === "connected" && shellWord === "LIFTOFF" && <Flame rumbling={rumbling} reduce={reduce} />}
            <p
              className={`${css.word} ${css[level]} ${listening && !reduce ? css.pulse : ""}`}
              role="status"
            >
              {word}
            </p>
          </>
        )}
        {linkState === "offline" && <button className="btn" onClick={() => void connect()}>Try again</button>}
      </section>
      {flashing && <div className={`${css.flash} ${css[level]}`} aria-hidden="true" />}

      <footer>
        {debugOn && <DebugPanel debug={debug} ear={ear} />}
        <Credits />
      </footer>

      {audioAsleep && !shellWord && (
        <button className={`btn btn-accent btn-lg ${css.wake}`} onClick={() => void wakeAudio()}>Tap to wake the rocket</button>
      )}
    </main>
  );
}

function Flame({ rumbling, reduce }: { rumbling: boolean; reduce: boolean }) {
  // Orange flame in var(--flame). Flickers (harder while a rumble loops); a steady glow under reduced motion.
  const cls = reduce ? css.flame : `${css.flame} ${rumbling ? css.hard : css.soft}`;
  return (
    <svg className={cls} viewBox="0 0 100 160" width="160" height="256" aria-hidden="true">
      <path d="M50 0 C80 50 95 90 50 160 C5 90 20 50 50 0 Z" fill="var(--flame)" />
      <path d="M50 50 C65 80 70 110 50 150 C30 110 35 80 50 50 Z" fill="var(--accent)" />
    </svg>
  );
}

const LOOPED: readonly SoundId[] = ["liftoff_rumble", "maxq_rumble", "entry_burn", "music_launch"]; // plan 10 Task 3

function DebugPanel({ debug, ear }: { debug: SensorDebug; ear: RocketEar }) {
  const g = debug.grav?.map((v) => v.toFixed(1)).join(", ") ?? "none";
  return (
    <div className="card stack small">
      <p>tilt {Number.isNaN(debug.tiltDeg) ? "?" : debug.tiltDeg.toFixed(0)}° · up {debug.upAccel.toFixed(2)} m/s² · {debug.fps} fps</p>
      <p>grav [{g}] · sign {debug.sign ?? "?"} (face up should read about 0, 0, -9.8)</p>
      <div className="row">
        {SOUND_IDS.map((id) => (
          <button key={id} className="btn" onClick={() => playSound(id, { loop: LOOPED.includes(id) })}>{id}</button>
        ))}
        <button className="btn" onClick={() => stopSound()}>Stop all</button>
        <button className="btn" onClick={() => vibrate([400, 100, 400])}>Vibrate</button>
        <button className="btn" onClick={() => ear.listen()}>Listen</button>
      </div>
    </div>
  );
}
