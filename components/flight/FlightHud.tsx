"use client";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { motionPresets } from "@/lib/ui/motion";
import { useReducedMotion } from "@/components/ui/useReducedMotion";
import { getEmissionsView, subscribeEmissionsView } from "@/lib/emissions-seam";
import { formatEmissionsReadout } from "@/lib/emissions-format";
import { MISSIONS } from "@/data/missions/index";
import { historicalMissions, missionById } from "@/lib/flight/mission-select";
import { referenceTrajectoryNote } from "@/lib/replay";
import { useAppMode } from "@/lib/flight/app-mode";
import { setMissionHud } from "@/lib/flight/mission-hud";
import { useSettings } from "@/lib/settings/prefs";
import {
  formatKm,
  formatSpeed,
  fuelPercent,
  goalLine,
  hudFuelNotice,
  stageLabel,
} from "@/lib/flight/format";
import { clearHeldAxes } from "@/lib/flight/local-controls";
import { launchControlledFlight } from "@/lib/flight/controls";
import { FLIGHT_PACING } from "@/lib/flight/pacing.helpers";
import { resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { zeroRocket } from "@/lib/rocket/useRocket";
import { clearCameraNudge } from "./cameraNudge";
import { resetChaseOrbit } from "./chaseOrbit";
import { useScene } from "@/lib/store";
import type { FlightWarp } from "@/lib/types";
import { EmissionsPlacement } from "./EmissionsPlacement";
import styles from "./flight.module.css";

export function FlightHud({ controlsOnly = false }: { controlsOnly?: boolean }) {
  const flight = useScene((s) => s.flight);
  const reduce = useReducedMotion();
  const emissions = useSyncExternalStore(subscribeEmissionsView, getEmissionsView, getEmissionsView);
  const emissionsCopy = formatEmissionsReadout(emissions);
  const collapseTransition = reduce ? { duration: 0 } : motionPresets.out;
  const phoneConnected = useScene((s) => s.rocket.connected);
  const playMode = useScene((s) => s.playMode);
  const missionTrackId = useScene((s) => s.missionTrackId);
  const warningLevel = useScene((s) => s.warningLevel);
  const guidanceNote = useScene((s) => s.guidanceNote);
  const view = useAppMode((s) => s.view);
  const mode = useAppMode((s) => s.mode);
  const hudOn = useSettings().hud;
  const status = flight.status;
  const readout = flight.readout;
  const steering = status === "flying";
  // Keep engine power and pause close while the phone controls the flight attitude.
  const compact = status === "flying";
  const throttleOwned = flight.owners.throttle === "local";
  const pitch = flight.state?.pitchRad ?? flight.input.pitchRad;
  const yaw = flight.state?.yawRad ?? flight.input.yawRad ?? 0;
  const tiltDeg = Math.acos(Math.min(1, Math.max(-1, Math.cos(pitch) * Math.cos(yaw)))) * 180 / Math.PI;
  const fuel = readout && flight.fuel ? fuelPercent(readout.propellantRemainingKg, flight.fuel.stages) : 100;
  const notice = hudFuelNotice(readout, status);

  const mark = () => useScene.getState().markActivity(performance.now());
  const launch = () => {
    clearHeldAxes();
    // Same path as the lift gesture: a connected phone gets pitch, so tilting steers after a button launch too.
    launchControlledFlight();
    mark();
  };
  const pause = () => {
    clearHeldAxes();
    if (useAppMode.getState().mode === "replay") useScene.getState().pauseReplay();
    else useScene.getState().pauseFlight();
    mark();
  };
  const resume = () => {
    const resumed = resumeFlightExplicit();
    if (resumed.ok && useAppMode.getState().mode === "replay") useScene.getState().resumeReplay();
    mark();
  };
  const retry = () => {
    clearHeldAxes();
    useScene.getState().retryFlight();
    mark();
  };
  const pick = (id: string) => {
    clearHeldAxes();
    useScene.getState().startFlight(id);
    mark();
  };
  const steerThrottle = (percent: number) => {
    const runId = useScene.getState().flight.runId;
    if (!runId) return;
    useScene.getState().setFlightInput({ throttle: percent / 100 }, "local", runId);
    mark();
  };
  const warp = (value: FlightWarp) => {
    useScene.getState().setFlightWarp(value);
    mark();
  };
  const historical = historicalMissions(MISSIONS);
  const tracked = missionById(MISSIONS, missionTrackId);
  const readyNote = playMode === "mission" ? (tracked ? referenceTrajectoryNote(tracked) : "Reference trajectory unavailable") : null;
  const guide = flight.guide;

  return (
    <>
      {!controlsOnly && <motion.section initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={collapseTransition} id="flight-status" className={`hud ${styles.readout}`} data-status={status} data-compact={compact} data-warning={warningLevel} data-sim-time={flight.simulatedTimeS} data-altitude-m={readout?.altitudeM ?? undefined} aria-label="Flight readout">
        <AnimatePresence initial={false}>
          {!compact && <motion.div key="readout-details" className={styles.collapsible} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={collapseTransition}>
        {status === "ready" && (
          <div className={styles.stack}>
            <p className="hud__k">Your mission</p>
            <h2>{playMode === "mission" ? "Choose an optional mission guide." : "Fly your rocket."}</h2>
            <div className={styles.actions} role="group" aria-label="Choose your flight">
              <button type="button" className="btn" aria-pressed={playMode === "free"} onClick={() => useAppMode.getState().selectMission(null)}>Custom flight</button>
              <button type="button" className="btn" aria-pressed={playMode === "mission"} onClick={() => useAppMode.getState().selectMission(missionTrackId ?? historical[0]?.id ?? "practice")}>Mission</button>
            </div>
            {playMode === "mission" && (
              <>
              <div className={styles.actions} role="group" aria-label="Mission guide">
                {historical.length > 0
                  ? historical.map((mission) => (
                    <button key={mission.id} type="button" className="btn" aria-pressed={missionTrackId === mission.id} onClick={() => useAppMode.getState().selectMission(mission.id)}>
                      {mission.name}
                    </button>
                  ))
                  : <button type="button" className="btn" disabled>Sentinel-6</button>}
                <button type="button" className="btn" aria-pressed={missionTrackId === "practice"} onClick={() => useAppMode.getState().selectMission("practice")}>Practice sample</button>
              </div>
              <p className={styles.note}>{readyNote ? "Follow the published milestones, or fly your own way." : "Use the reference path as a guide, or fly your own way."}</p>
              {tracked && <p className={styles.note}>{tracked.kind === "practice" ? "Simulated practice route, not a historical flight." : "Published mission milestones. You fly a practice vehicle."} {tracked.source && <a href={tracked.source}>Mission source</a>}</p>}
              {readyNote && <p className={styles.note}>{readyNote}</p>}
              </>
            )}
            <details className={styles.more}>
              <summary>About this flight</summary>
              <p>Launch upright, then turn gently to build speed around Earth.</p>
              <p>The goal is a path around Earth. The lowest point stays at least 200 km up. The highest point stays under 2,000 km. Then coast for 10 seconds with the engines off.</p>
              <p className={styles.note}>Earth is drawn to size. The rocket dot is bigger so you can see it.</p>
              <p className={styles.note}>You fly a simulated classroom rocket. Mission guides use the data each source actually provides.</p>
            </details>
          </div>
        )}
        {readout && status !== "ready" && (
          <div className={styles.stack}>
            <div className="hud__row"><span className="hud__k">Height</span><span className="hud__v">{formatKm(readout.altitudeM)}</span></div>
            <div className="hud__row"><span className="hud__k">Sideways speed</span><span className="hud__v">{formatSpeed(readout.tangentialSpeedMps)}</span></div>
            <div className="hud__row"><span className="hud__k">Stage</span><span className="hud__v">{stageLabel(readout.activeStageId)}</span></div>
            <div className="hud__row"><span className="hud__k">Fuel</span><span className="hud__v">{fuel.toFixed(0)}%</span></div>
            <div className="hud__row"><span className="hud__k">Engine power</span><span className="hud__v">{Math.round(readout.throttle * 100)}%</span></div>
            <div className="hud__row"><span className="hud__k">Tilt</span><span className="hud__v">{tiltDeg.toFixed(0)}°</span></div>
            <div className="hud__row">
              <span className="hud__k">Lowest point</span>
              <span className="hud__v">{formatKm(readout.periapsisAltitudeM)}</span>
            </div>
            <div className="hud__row">
              <span className="hud__k">Highest point</span>
              <span className="hud__v">{formatKm(readout.apoapsisAltitudeM)}</span>
            </div>
            <p>{goalLine(readout)}</p>
            {notice && <p className="hud__v hud__v--bad">{notice}</p>}
            {playMode === "mission" && guidanceNote && <p className={styles.note}>{guidanceNote}</p>}
            <details className={styles.more}>
              <summary>More numbers</summary>
              {playMode === "mission" && guide && guide.milestones.length > 0 && (
                <p className={styles.note}>Milestones: {guide.milestones.join(", ")}</p>
              )}
              <p className={styles.note}>The lowest part of your path around Earth. The highest part is the top of that path. Earth is drawn to size. The rocket dot is bigger so you can see it. The pale line is the coast if you cut thrust now.</p>
              <div className="hud__row"><span className="hud__k">Up speed</span><span>{formatSpeed(readout.radialSpeedMps)}</span></div>
              <div className="hud__row"><span className="hud__k">Full speed</span><span>{formatSpeed(readout.totalSpeedMps)}</span></div>
              <div className="hud__row"><span className="hud__k">Mission time</span><span>{flight.simulatedTimeS.toFixed(1)} s</span></div>
              <div className="hud__row"><span className="hud__k">Engines-off time</span><span>{(flight.state?.thrustOffS ?? 0).toFixed(1)} s</span></div>
            </details>
          </div>
        )}
          </motion.div>}
        </AnimatePresence>
        {compact ? (
          <section data-slot="emissions" data-emissions-surface="embedded" className={styles.compactEmissions} aria-label="Estimated carbon dioxide">
            <p className="hud__k">Carbon dioxide so far</p>
            <p className="hud__v hud__v--clock">{emissions.status === "estimate" ? "≈ " : ""}{emissionsCopy.valueText}</p>
          </section>
        ) : <EmissionsPlacement />}
      </motion.section>}
      <section className={`hud ${styles.controls}`} data-compact={compact} data-motion={reduce ? "reduce" : "full"} aria-label="Flight controls">
        <div className={styles.stack}>
          <div className={styles.controlTop}>
            {status === "ready" && <button id="launch-flight" type="button" className="btn btn-accent btn-lg" onClick={launch} disabled={!phoneConnected}>Launch</button>}
            {status === "paused" && <button id="pause-flight" type="button" className="btn btn-accent" onClick={resume} disabled={!phoneConnected}>Resume</button>}
            {status === "flying" && <button id="pause-flight" type="button" className="btn" onClick={pause}>Pause flight</button>}
            {(status === "flying" || status === "paused") && !flight.outcome && <button id="retry-flight" type="button" className="btn" onClick={retry}>Try again</button>}
          </div>
          <AnimatePresence initial={false}>
            {!compact && <motion.div key="phone-setup" className={styles.collapsible} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={collapseTransition}>
              <div className={styles.stack}>
                {!phoneConnected && (status === "ready" || status === "paused") && (
                  <p className={styles.note} role="status">{status === "paused" ? "Phone disconnected. Reconnect your phone to resume." : "Waiting for your phone. Connect it to launch."}</p>
                )}
                {phoneConnected && <>
                  <button type="button" className="btn" onClick={() => { zeroRocket(); mark(); }}>Calibrate phone</button>
                  <p className={styles.note}>Hold the rocket upright to start. Tilt it gently to steer. Set engine power below.</p>
                </>}
              </div>
            </motion.div>}
          </AnimatePresence>
          {mode === "mission" && (
            <label className={styles.hudSelect}>
              HUD
              <select
                id="mission-hud"
                aria-label="HUD"
                value={hudOn ? "on" : "off"}
                onChange={(event) => {
                  setMissionHud(event.target.value === "on", window.localStorage);
                  mark();
                }}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
          )}
          <label className="range" htmlFor="throttle-control">
            Engine power
            <input
              id="throttle-control"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(flight.input.throttle * 100)}
              disabled={!steering || !throttleOwned}
              onChange={(event) => steerThrottle(Number(event.target.value))}
            />
          </label>
          <AnimatePresence initial={false}>
            {!compact && <motion.div key="flight-options" className={styles.collapsible} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={collapseTransition}>
              <div className={styles.stack}>
                <div className={styles.actions} role="group" aria-label="Flight pacing">
                  {([["Presentation", FLIGHT_PACING.presentation], ["Realistic", FLIGHT_PACING.realistic]] as const).map(([label, value]) => (
                    <button id={`warp-${value}`} key={value} type="button" className="btn" aria-pressed={flight.warp === value} onClick={() => warp(value)}>{label} · {value}×</button>
                  ))}
                </div>
                <details className={styles.more}>
                  <summary>Flight options</summary>
                  <div className={styles.stack}>
                  <div className={styles.actions} role="group" aria-label="Rocket preset">
                    <button id="scenario-classroom" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom"} onClick={() => pick("classroom")}>Orbit flight</button>
                    <button id="scenario-classroom-hop" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom-hop"} onClick={() => pick("classroom-hop")}>Short hop</button>
                  </div>
                  <p className={styles.note}>Orbit flight has fuel to reach space. Short hop is a brief, low-fuel practice launch that returns to Earth. Both use simulated rockets.</p>
                  <details className={styles.more}>
                    <summary>How tilt works</summary>
                    <p className={styles.note}>Point the phone rocket where you want to fly. Start upright, then lean gently. Launch leaves the engines off until you set power.</p>
                  </details>
                  <div className={styles.actions}>
                    <button type="button" className="btn" aria-pressed={view === "overview"} onClick={() => useAppMode.getState().setView("overview")}>Earth view</button>
                    <button type="button" className="btn" aria-pressed={view === "follow"} onClick={() => useAppMode.getState().setView("follow")}>Follow rocket</button>
                    <button type="button" className="btn" onClick={() => { clearCameraNudge(); resetChaseOrbit(); useAppMode.getState().resetCamera(); }}>Reset view</button>
                    <button type="button" className="btn" onClick={() => useAppMode.getState().openExplore()}>Exit</button>
                  </div>
                  </div>
                </details>
              </div>
            </motion.div>}
          </AnimatePresence>
        </div>
      </section>
    </>
  );
}
