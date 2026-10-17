"use client";
// components/ui/PairRocket.tsx — pairing card, QR and connection status for the phone rocket (11 Task 2). Owner: Neel.
// Rendered by PairSlot. Calls useRocket() once (the mount point of the Task 3/5 hook).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { attachLink, checkRocketTimeout, receiveRocketMessage } from "@/lib/rocket/commands";
import { openLink } from "@/lib/rocket/link";
import type { RocketLink } from "@/lib/rocket/link";
import { newPairCode } from "@/lib/rocket/protocol";
import { qrSvgPath, rocketUrl } from "@/lib/rocket/qr";
import { useRocket, zeroRocket } from "@/lib/rocket/useRocket";
import { useScene } from "@/lib/store";

// Retry the relay this often while it is unreachable, always with the SAME code. Arbitrary: tune on the day.
const RELAY_RETRY_MS = 5000;
// How long "Rocket connected" stays up before the card shrinks to the small status. Arbitrary: tune on the day.
const CONNECTED_TOAST_MS = 2000;
// How often the silence check runs. 250 ms keeps "QR is back" within DISCONNECT_MS + 250 ms (~2.25 s).
const TIMEOUT_CHECK_MS = 250;
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function PairRocket() {
  useRocket();
  const rocket = useScene((s) => s.rocket);
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [localhostOnly, setLocalhostOnly] = useState(false);
  const [relayDown, setRelayDown] = useState(false);
  const [open, setOpen] = useState(true); // false = collapsed to the "Connect rocket" chip
  const [justConnected, setJustConnected] = useState(false);
  const retryNow = useRef<() => void>(() => {});

  // Pair: one code per mount, one link, one 250 ms silence check. StrictMode mounts twice: `cancelled` makes the
  // first mount's late-resolving link close itself, and its cleanup detaches before the second mount attaches.
  useEffect(() => {
    let cancelled = false;
    let current: RocketLink | null = null;
    let connecting = false; // "Try now" while a join is in flight must not open a second link
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pairCode = newPairCode();
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

  if (rocket.connected) {
    return (
      <div style={SMALL_WRAP}>
        {live}
        {justConnected ? (
          <div className="card card--solid">
            <p className="lead">Rocket connected</p>
          </div>
        ) : (
          <div className="card">
            <span className="chip chip--ok">ROCKET ON</span>
            <button type="button" className="btn" onClick={zeroRocket}>
              Calibrate
            </button>
            <p className="small">Hold the rocket upright for 2 seconds, then tap Calibrate</p>
          </div>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <div style={SMALL_WRAP}>
        {live}
        <button type="button" className="chip" onClick={() => setOpen(true)}>
          Connect rocket
        </button>
      </div>
    );
  }

  return (
    <div style={CENTER_WRAP}>
      {live}
      <div className="card card--solid" style={CARD}>
        <p className="eyebrow">PAIR YOUR ROCKET</p>
        <p className="lead">Slide your phone into the rocket. Scan to connect.</p>
        {relayDown ? (
          <div>
            <span className="chip chip--bad">NO CONNECTION</span>
            <p className="small">The rocket can&apos;t connect right now. Trying again.</p>
            <button type="button" className="btn" onClick={tryNow}>
              Try now
            </button>
          </div>
        ) : qr && code ? (
          <>
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
            </div>
            <p className="display" aria-hidden="true">
              {code}
            </p>
          </>
        ) : null}
        {localhostOnly && !relayDown && (
          <div>
            <span className="chip chip--warn">LOCALHOST QR</span>
            <p className="small">Developer note: a phone can&apos;t open localhost. Use the tunnel or deployed URL, or set NEXT_PUBLIC_ROCKET_ORIGIN.</p>
          </div>
        )}
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
          Hide
        </button>
      </div>
    </div>
  );
}

// Layout uses tokens only. Centre card (theme 7.1: "centre card when no rocket is linked"); the wrapper ignores
// pointer events so the 3D scene stays draggable around the card.
const CENTER_WRAP = {
  position: "fixed",
  inset: 0,
  zIndex: "var(--z-hud)",
  display: "grid",
  placeItems: "center",
  padding: "var(--gutter)",
  pointerEvents: "none",
} as const;
const CARD = { pointerEvents: "auto", width: "min(24rem, 100%)", textAlign: "center" } as const;
// QR paper: white square, 16 px quiet zone (theme 7), at least 12 rem wide inside the card.
const PAPER = { background: "var(--qr-paper)", padding: "var(--sp-4)", minWidth: "12rem", margin: "0 auto" } as const;
// Compact status / reopen chip: below the nav at the left, clear of the lens switch (top-right) and HUDs (bottom).
const SMALL_WRAP = {
  position: "fixed",
  zIndex: "var(--z-hud)",
  left: "var(--gutter)",
  top: "calc(var(--sp-4) + var(--target) + var(--sp-3))",
} as const;
