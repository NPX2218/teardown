"use client";
// Mission patch popup. Shown as soon as a flight outcome lands. Owner: Anders.
// The picture is Grok Imagine. The numbers are HTML, never painted by the model.
import Image from "next/image";
import { motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getEmissionsView, subscribeEmissionsView } from "@/lib/emissions-seam";
import { IMAGINE_RESET_EVENT } from "@/lib/imagine/client";
import { assignFlightNumber, buildPatchCard, patchShareUrl, scenarioLabel, type PatchCard } from "@/lib/imagine/patch";
import { PATCH_OPEN_EVENT, requestMissionPatch } from "@/lib/imagine/patch-client";
import { BADGE_ROCKET_PATH, downloadPatchPng } from "@/lib/imagine/patch-png";
import { patchQrPath } from "@/lib/imagine/patch-qr";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import styles from "./MissionPatch.module.css";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export type PatchPhase = "loading" | "ready" | "error";

interface MissionPatchCardProps {
  card: PatchCard;
  phase: PatchPhase;
  imageUrl: string | null;
  shareUrl: string | null;
  localhostOnly?: boolean;
  onClose: () => void;
  onRetry: () => void;
}

function FallbackBadge() {
  return (
    <svg className={styles.badge} viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d={BADGE_ROCKET_PATH} fill="currentColor" />
    </svg>
  );
}

/** Shown while Grok Imagine draws: the badge sketched in outline, so it reads as "being drawn", not "broken". */
function DrawingBadge() {
  return (
    <svg className={styles.badge} viewBox="0 0 120 120" aria-hidden="true">
      <circle className={styles.orbit} cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 7" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <path
        className={styles.sketch}
        pathLength={1}
        d={BADGE_ROCKET_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MissionPatchCard({ card, phase, imageUrl, shareUrl, localhostOnly = false, onClose, onRetry }: MissionPatchCardProps) {
  const qr = phase === "ready" && shareUrl ? patchQrPath(shareUrl) : null;
  const [saving, setSaving] = useState<"idle" | "busy" | "failed">("idle");
  const download = () => {
    setSaving("busy");
    downloadPatchPng(card, phase === "ready" ? imageUrl : null).then(
      () => setSaving("idle"),
      () => setSaving("failed"),
    );
  };
  const facts = [
    ["Highest point", card.maxAltitude],
    ["How it ended", card.outcomeLabel],
    ["Scenario", card.scenarioName],
    ["Flight number", card.flightNumber],
    ["Carbon dioxide (estimated)", card.co2],
  ] as const;
  return (
    <motion.div
      className={`overlay__panel ${styles.panel}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionPresets.slow}
    >
      <button type="button" data-close className="btn btn-icon overlay__close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      <header className={styles.heading}>
        <p className={`eyebrow ${styles.kicker}`}>Mission patch</p>
        <h2 id="mission-patch-title" className={styles.title}>{card.title}</h2>
      </header>
      <div className={styles.body}>
        <div className={styles.frame} data-phase={phase}>
          {phase === "loading" && (
            <div className={styles.drawing} role="status">
              <DrawingBadge />
              <p className={styles.status}>Making your mission patch…</p>
              <p className={`caption ${styles.statusSub}`}>Grok Imagine is drawing it now</p>
            </div>
          )}
          {phase === "ready" && imageUrl && (
            <Image
              className={`fit ${styles.picture}`}
              src={imageUrl}
              alt={`Mission patch for ${card.title}`}
              width={1024}
              height={1024}
              unoptimized
            />
          )}
          {phase === "error" && <FallbackBadge />}
        </div>
        <div className={styles.details}>
          <dl className={styles.facts}>
            {facts.map(([label, value]) => (
              <div key={label} className={`stat ${styles.fact}`}>
                <dt className="stat__label">{label}</dt>
                <dd className="stat__value">{value}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.story}>
            {card.playfulBreakup && <span className="chip">Rapid unscheduled disassembly</span>}
            <p className={styles.reason}>{card.reason}</p>
            {card.playfulBreakup && (
              <p className={`small ${styles.reason}`}>The rocket broke apart. Space fans call that a rapid unscheduled disassembly.</p>
            )}
          </div>
          {phase === "error" && (
            <div role="alert" className={styles.alert}>
              <p className="small">Grok could not draw this patch. Your flight facts are still here.</p>
              <button type="button" className="btn btn-accent" onClick={onRetry}>Try again</button>
            </div>
          )}
          {phase !== "loading" && (
            <div className={styles.download}>
              <button type="button" className="btn" onClick={download} disabled={saving === "busy"}>
                {saving === "busy" ? "Saving…" : "Download PNG"}
              </button>
              {saving === "failed" && <p className="small" role="alert">Could not save the picture. Try again.</p>}
            </div>
          )}
          {qr && (
            <div className={styles.qrBlock}>
              <div className={styles.qr}>
                <svg className={styles.qrSvg} viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code for this mission patch">
                  <path d={qr.d} fill="currentColor" />
                </svg>
              </div>
              <div className={styles.qrText}>
                <p className={styles.qrTitle}>Take it with you</p>
                <p className="small">Scan to keep this patch on your phone.</p>
                {localhostOnly && (
                  <p className="small">A phone can&apos;t open this computer&apos;s private address. Ask a helper for the show link.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function subscribeFlight(fn: () => void): () => void {
  return useScene.subscribe(fn);
}

function flightOutcome() {
  return useScene.getState().flight.outcome;
}

/** The same estimate the on-screen emissions readout shows, so the patch never disagrees with it. */
function flightCo2Kg() {
  const view = getEmissionsView();
  const runId = useScene.getState().flight.outcome?.runId;
  return view.status === "estimate" && view.runId === runId ? view.kilograms : null;
}

function flightScenarioId() {
  return useScene.getState().flight.scenarioId;
}

export function MissionPatch() {
  // getState, not the store's server snapshot, so a flight that just ended is visible on the first paint.
  const outcome = useSyncExternalStore(subscribeFlight, flightOutcome, flightOutcome);
  const scenarioId = useSyncExternalStore(subscribeFlight, flightScenarioId, flightScenarioId);
  const co2Kg = useSyncExternalStore(subscribeEmissionsView, flightCo2Kg, flightCo2Kg);
  const numbers = useRef<Record<string, number>>({});
  const outcomeRef = useRef(outcome);
  outcomeRef.current = outcome;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closedByEffect = useRef(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [origin, setOrigin] = useState<string | null>(null);
  const [localhostOnly, setLocalhostOnly] = useState(false);
  const [view, setView] = useState<{ runId: string | null; phase: PatchPhase; imageUrl: string | null }>({
    runId: null,
    phase: "loading",
    imageUrl: null,
  });

  const viewRef = useRef(view);
  viewRef.current = view;

  const runId = outcome?.runId ?? null;
  const phase = view.runId === runId ? view.phase : "loading";
  const imageUrl = view.runId === runId ? view.imageUrl : null;

  const assigned = outcome ? assignFlightNumber(outcome.runId, numbers.current) : null;
  if (assigned) numbers.current = assigned.table;
  const card = outcome && assigned ? buildPatchCard(outcome, scenarioLabel(scenarioId), assigned.flightNumber, co2Kg) : null;
  const flightNumber = card?.flightNumber ?? null;
  const scenarioName = card?.scenarioName ?? null;
  const open = card !== null && outcome !== null && dismissed !== outcome.runId;
  const shareUrl = phase === "ready" && imageUrl && origin
    ? patchShareUrl(origin, imageUrl, process.env.NEXT_PUBLIC_ROCKET_ORIGIN)
    : null;

  useEffect(() => {
    const publicOrigin = process.env.NEXT_PUBLIC_ROCKET_ORIGIN;
    setOrigin(window.location.origin);
    setLocalhostOnly(
      process.env.NODE_ENV !== "production"
      && !publicOrigin
      && LOCAL_HOSTS.includes(window.location.hostname),
    );
  }, []);

  useEffect(() => {
    const onReset = () => setDismissed(useScene.getState().flight.outcome?.runId ?? "reset");
    const onOpen = () => setDismissed(null);
    window.addEventListener(IMAGINE_RESET_EVENT, onReset);
    window.addEventListener(PATCH_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(IMAGINE_RESET_EVENT, onReset);
      window.removeEventListener(PATCH_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-close]")?.focus();
    return () => {
      if (!dialog.open) return;
      closedByEffect.current = true;
      dialog.close();
    };
  }, [open]);

  useEffect(() => {
    const current = outcomeRef.current;
    if (!open || !current || flightNumber === null || scenarioName === null) return;
    const ctl = new AbortController();
    let cancelled = false;
    const run = current.runId;
    // Reopening a patch that already drew shows it again instead of paying for a new picture.
    if (viewRef.current.runId === run && viewRef.current.phase === "ready") return;
    setView({ runId: run, phase: "loading", imageUrl: null });
    void requestMissionPatch({ outcome: current, scenarioName, flightNumber }, ctl.signal).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setView({ runId: run, phase: "error", imageUrl: null });
        return;
      }
      setView({ runId: run, phase: "ready", imageUrl: result.url });
    });
    return () => {
      cancelled = true;
      ctl.abort();
    };
    // outcome identity changes when the sim commits, but one run should generate one patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId, flightNumber, scenarioName, attempt]);

  if (!open || !card) return null;

  const close = () => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      className={`overlay ${styles.dialog}`}
      aria-labelledby="mission-patch-title"
      data-slot="mission-patch"
      onClose={() => {
        if (closedByEffect.current) {
          closedByEffect.current = false;
          return;
        }
        if (outcome) setDismissed(outcome.runId);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <MissionPatchCard
        card={card}
        phase={phase}
        imageUrl={imageUrl}
        shareUrl={shareUrl}
        localhostOnly={localhostOnly}
        onClose={close}
        onRetry={() => {
          setView({ runId: outcome?.runId ?? null, phase: "loading", imageUrl: null });
          setAttempt((value) => value + 1);
        }}
      />
    </dialog>
  );
}
