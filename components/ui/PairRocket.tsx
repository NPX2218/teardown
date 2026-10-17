"use client";
// components/ui/PairRocket.tsx — pairing card, QR and connection status for the phone rocket (11 Task 2). Owner: Neel.
// Rendered by PairSlot. Calls useRocket() once (the mount point of the Task 3/5 hook).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { attachLink, checkRocketTimeout, receiveRocketMessage } from "@/lib/rocket/commands";
import { openLink } from "@/lib/rocket/link";
import type { RocketLink } from "@/lib/rocket/link";
import { newPairCode } from "@/lib/rocket/protocol";
import { demoPairCode, parseFlags } from "@/lib/viewer/exhibit";
import { qrSvgPath, rocketUrl } from "@/lib/rocket/qr";
import { useRocket, zeroRocket } from "@/lib/rocket/useRocket";
import { startCalibration } from "@/lib/rocket/calibrate";
import { useAppMode } from "@/lib/flight/app-mode";
import { useScene } from "@/lib/store";
import { motionPresets } from "@/lib/ui/motion";
import styles from "./pair.module.css";

// Retry the relay this often while it is unreachable, always with the SAME code. Arbitrary: tune on the day.
const RELAY_RETRY_MS = 5000;
// How long "Rocket connected" stays up before the card shrinks to the small status. Arbitrary: tune on the day.
const CONNECTED_TOAST_MS = 2000;
// How often the silence check runs. 250 ms keeps "QR is back" within DISCONNECT_MS + 250 ms (~2.25 s).
const TIMEOUT_CHECK_MS = 250;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function PairRocket() {
  useRocket();
  const rocket = useScene((s) => s.rocket);
  const mode = useAppMode((s) => s.mode);
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [localhostOnly, setLocalhostOnly] = useState(false);
  // Calibrate: seconds left (3..1) while counting down, then a short "Calibration successful" line.
  const [calLeft, setCalLeft] = useState<number | null>(null);
  const [calOk, setCalOk] = useState(false);
  const cancelCal = useRef<(() => void) | null>(null);
  const calibrate = useCallback(() => {
    cancelCal.current?.();
    setCalOk(false);
    cancelCal.current = startCalibration({
      tick: setCalLeft,
      calibrate: () => {
        setCalLeft(null);
        zeroRocket();
      },
      success: setCalOk,
    });
  }, []);
  // A disconnect or unmount mid-countdown must not calibrate a rocket that is gone.
  useEffect(() => {
    if (rocket.connected) return;
    cancelCal.current?.();
    setCalLeft(null);
    setCalOk(false);
  }, [rocket.connected]);
  useEffect(() => () => cancelCal.current?.(), []);
  const [relayDown, setRelayDown] = useState(false);
  const [open, setOpen] = useState(true); // false = collapsed to the "Connect rocket" chip
  const [pinned, setPinned] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const retryNow = useRef<() => void>(() => {});

  // Pair: one code per mount, one link, one 250 ms silence check. StrictMode mounts twice: `cancelled` makes the
  // first mount's late-resolving link close itself, and its cleanup detaches before the second mount attaches.
  useEffect(() => {
    let cancelled = false;
    let current: RocketLink | null = null;
    let connecting = false; // "Try now" while a join is in flight must not open a second link
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pairCode = demoPairCode(parseFlags(window.location.search), safeStorage()) ?? newPairCode();
    // Public, browser-safe setting: the page the phone should open (a tunnel or the deployed URL).
    const publicOrigin = process.env.NEXT_PUBLIC_ROCKET_ORIGIN;
    setCode(pairCode);
    setOrigin(publicOrigin || window.location.origin);
    // Developer hint only: never shown on the exhibit build.
    setLocalhostOnly(process.env.NODE_ENV !== "production" && !publicOrigin && LOCAL_HOSTS.includes(window.location.hostname));
    useScene.getState().setRocket({ connected: false, code: pairCode });

    const connect = (): void => {
      if (connecting || current) return;
      clearTimeout(retryTimer);
      connecting = true;
      openLink(pairCode, "laptop", (m) => {
        if (!cancelled) receiveRocketMessage(m, performance.now());
      }).then(
        (l) => {
          connecting = false;
          if (cancelled) {
            l.close();
            return;
          }
          current = l;
          attachLink(l);
          setRelayDown(false);
        },
        () => {
          connecting = false;
          if (cancelled) return;
          setRelayDown(true);
          retryTimer = setTimeout(connect, RELAY_RETRY_MS);
        },
      );
    };
    retryNow.current = connect;
    connect();
    const tick = setInterval(() => checkRocketTimeout(performance.now()), TIMEOUT_CHECK_MS);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(tick);
      attachLink(null);
      current?.close();
    };
  }, []);

  // Connected: brief "Rocket connected", then the small status. Disconnected: card open again, QR visible.
  const wasConnected = useRef(false);
  useEffect(() => {
    if (rocket.connected === wasConnected.current) return;
    wasConnected.current = rocket.connected;
    setJustConnected(rocket.connected);
    if (!rocket.connected) setOpen(true);
  }, [rocket.connected]);
  // The toast timer lives in its own effect keyed on justConnected, so a StrictMode re-run re-arms it
  // instead of leaving "Rocket connected" up forever.
  useEffect(() => {
    if (!justConnected) return;
    const t = setTimeout(() => setJustConnected(false), CONNECTED_TOAST_MS);
    return () => clearTimeout(t);
  }, [justConnected]);

  const showCard = !rocket.connected && (pinned || (open && mode === "explore"));
  useEffect(() => {
    document.body.dataset.pairOpen = showCard ? "1" : "0";
    return () => {
      delete document.body.dataset.pairOpen;
    };
  }, [showCard]);

  const qr = useMemo(() => (code && origin ? qrSvgPath(rocketUrl(origin, code)) : null), [code, origin]);
  const tryNow = useCallback(() => retryNow.current(), []);

  const statusText = rocket.connected
    ? "Rocket connected"
    : relayDown
      ? "The rocket can't connect right now. Trying again."
      : "Waiting for your rocket";

  // aria-live status: always mounted so changes are announced (same words as the screen).
  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {statusText}
    </p>
  );

  // One surface per state. Each grows out of the top-right corner where the "Connect rocket" button sits
  // (bottom edge on phones, see pair.module.css). Opacity and scale only: no layout work, the 3D scene never re-renders.
  const view = rocket.connected ? (justConnected ? "toast" : "status") : showCard ? "card" : "button";
  let surface: ReactNode;
  if (view === "toast") {
    surface = (
      <div className="card card--solid">
        <p className="lead">Rocket connected</p>
      </div>
    );
  } else if (view === "status") {
    surface = (
      <div className="card">
        <span className="chip chip--ok">Rocket on</span>
        <button type="button" className="btn" onClick={calibrate} disabled={calLeft !== null}>
          {calLeft !== null ? `Calibrating in ${calLeft}` : "Calibrate"}
        </button>
        <AnimatePresence>
          {calOk && (
            <motion.p
              key="cal-ok"
              className={styles.calOk}
              role="status"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0, transition: motionPresets.out }}
              exit={{ opacity: 0, y: -4, transition: motionPresets.ui }}
            >
              Calibration successful
            </motion.p>
          )}
        </AnimatePresence>
        <p className="small">Tap Calibrate, then stand the rocket upright within 3 seconds</p>
      </div>
    );
  } else if (view === "button") {
    surface = (
      <button type="button" className={`btn btn-icon ${styles.linkBtn}`} aria-label="Connect rocket" onClick={() => { setPinned(true); setOpen(true); }}>
        <svg className={styles.linkIcon} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="4" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M14 16h2v2h-2zM18 14h2v6h-6v-2h4z" fill="currentColor" />
        </svg>
        <span className={styles.linkLabel}>Connect rocket</span>
      </button>
    );
  } else {
    surface = (
      <div className={styles.panel}>
        <header className={styles.head}>
          <h2 className={styles.title}>Pair your rocket</h2>
          <p className={styles.statusRow}>
            <span className={`${styles.dot} ${relayDown ? styles.dotBad : ""}`} aria-hidden="true" />
            <span className={styles.statusText}>{relayDown ? "No connection" : "Waiting for your rocket"}</span>
          </p>
        </header>
        <ol className={styles.steps}>
          <li>Scan the code with your phone camera.</li>
          <li>Slide your phone into the rocket.</li>
        </ol>
        {relayDown ? (
          <div className={styles.relay}>
            <p className="small">The rocket can&apos;t connect right now. Trying again.</p>
            <button type="button" className="btn" onClick={tryNow}>
              Try now
            </button>
          </div>
        ) : qr && code ? (
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...motionPresets.out, delay: 0.06 }}>
            <div className={styles.finder}>
              <i className={`${styles.corner} ${styles.tl}`} aria-hidden="true" />
              <i className={`${styles.corner} ${styles.tr}`} aria-hidden="true" />
              <i className={`${styles.corner} ${styles.bl}`} aria-hidden="true" />
              <i className={`${styles.corner} ${styles.br}`} aria-hidden="true" />
              <div style={PAPER}>
                <svg
                  className="fit"
                  viewBox={`0 0 ${qr.size} ${qr.size}`}
                  role="img"
                  aria-label={`QR code to connect your rocket. Pairing code ${code.split("").join(" ")}`}
                  shapeRendering="crispEdges"
                  style={{ display: "block", width: "100%", color: "var(--bg)" }}
                >
                  <path d={qr.d} fill="currentColor" />
                </svg>
                <span className={styles.scan} aria-hidden="true" />
              </div>
            </div>
            <div className={styles.codeBlock} aria-hidden="true">
              <span className={styles.codeLabel}>Pairing code</span>
              <span className={styles.cells}>
                {code.split("").map((ch, i) => (
                  <span key={i} className={styles.cell}>
                    {ch}
                  </span>
                ))}
              </span>
            </div>
          </motion.div>
        ) : null}
        {localhostOnly && !relayDown && (
          <div>
            <span className="chip chip--warn">Localhost QR</span>
            <p className="small">Developer note: a phone can&apos;t open localhost. Use the tunnel or deployed URL, or set NEXT_PUBLIC_ROCKET_ORIGIN.</p>
          </div>
        )}
        <footer className={styles.foot}>
          <button type="button" className={styles.ghost} onClick={() => { setOpen(false); setPinned(false); }}>
            Hide
          </button>
        </footer>
      </div>
    );
  }

  return (
    <>
      {live}
      <AnimatePresence initial={false}>
        <motion.div
          key={view}
          className={view === "card" ? styles.center : styles.chipWrap}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1, transition: motionPresets.out }}
          exit={{ opacity: 0, scale: 0.98, transition: motionPresets.ui }}
        >
          {surface}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

// QR paper: white square with a 16 px quiet zone (the finder brackets sit outside it). Clips the scan line.
const PAPER = { position: "relative", overflow: "hidden", background: "var(--qr-paper)", padding: "var(--sp-4)", borderRadius: "var(--radius-xs)" } as const;
