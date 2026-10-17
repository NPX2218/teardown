"use client";
import { motion } from "motion/react";
import { motionPresets } from "@/lib/ui/motion";
import { MISSIONS } from "@/data/missions/index";
import { historicalMissions, missionById } from "@/lib/flight/mission-select";
import { referenceTrajectoryNote } from "@/lib/replay";
import { useAppMode } from "@/lib/flight/app-mode";
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
  const phoneConnected = useScene((s) => s.rocket.connected);
  const playMode = useScene((s) => s.playMode);
  const missionTrackId = useScene((s) => s.missionTrackId);
  const warningLevel = useScene((s) => s.warningLevel);
  const guidanceNote = useScene((s) => s.guidanceNote);
  const view = useAppMode((s) => s.view);
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
      {!controlsOnly && <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={motionPresets.out} id="flight-status" className={`hud ${styles.readout}`} data-status={status} data-warning={warningLevel} data-sim-time={flight.simulatedTimeS} aria-label="Flight readout">
        {status === "ready" && (
          <div className={styles.stack}>
            <p className="hud__k">Your mission</p>
            <h2>{playMode === "mission" ? "Pick a mission. Make the flight your own." : "Go up, then turn to build speed around Earth."}</h2>
            <div className={styles.actions} role="group" aria-label="Choose your flight">
              <button type="button" className="btn" aria-pressed={playMode === "free"} onClick={() => useAppMode.getState().selectMission(null)}>Custom flight</button>
              <button type="button" className="btn" aria-pressed={playMode === "mission"} onClick={() => useAppMode.getState().selectMission(missionTrackId ?? historical[0]?.id ?? "practice")}>Mission</button>
            </div>
            <div className={styles.actions}>
              <button id="scenario-classroom" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom"} onClick={() => pick("classroom")}>Classroom launch</button>
              <button id="scenario-classroom-hop" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom-hop"} onClick={() => pick("classroom-hop")}>Short hop</button>
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
        <EmissionsPlacement />
      </motion.section>}
      <section className={`hud ${styles.controls}`} aria-label="Flight controls">
        <div className={styles.stack}>
          {status === "ready" && (
            <button id="launch-flight" type="button" className="btn btn-accent btn-lg" onClick={launch} disabled={!phoneConnected}>Launch</button>
          )}
          {status === "paused" && (
            <button id="pause-flight" type="button" className="btn btn-accent" onClick={resume} disabled={!phoneConnected}>Resume</button>
          )}
          {status === "flying" && <button id="pause-flight" type="button" className="btn" onClick={pause}>Pause flight</button>}
          {!phoneConnected && (status === "ready" || status === "paused") && (
            <p className={styles.note} role="status">{status === "paused" ? "Phone disconnected. Reconnect your phone to resume." : "Waiting for your phone. Connect it to launch."}</p>
          )}
          {phoneConnected && (
            <>
              <p className={styles.note}>Hold the rocket upright to start. Tilt it gently to steer. Set engine power below.</p>
              <button type="button" className="btn" onClick={() => { zeroRocket(); mark(); }}>Calibrate phone</button>
            </>
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
          <details className={styles.more} open={!compact}>
          <summary>Flight options</summary>
          <details className={styles.more}>
            <summary>How tilt works</summary>
            <p className={styles.note}>Point the phone rocket where you want to fly. Start upright, then lean gently. Launch leaves the engines off until you set power.</p>
          </details>
          <div className={styles.actions} role="group" aria-label="Time scale">
            {([1, 4, 8] as const).map((value) => (
              <button id={`warp-${value}`} key={value} type="button" className="btn" aria-pressed={flight.warp === value} onClick={() => warp(value)}>
                {value}×
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <button type="button" className="btn" aria-pressed={view === "overview"} onClick={() => useAppMode.getState().setView("overview")}>Earth view</button>
            <button type="button" className="btn" aria-pressed={view === "follow"} onClick={() => useAppMode.getState().setView("follow")}>Follow rocket</button>
            <button type="button" className="btn" onClick={() => { clearCameraNudge(); resetChaseOrbit(); useAppMode.getState().resetCamera(); }}>Reset view</button>
            {!compact && status !== "idle" && !flight.outcome && (
              <button id="retry-flight" type="button" className="btn" onClick={() => { clearHeldAxes(); useScene.getState().retryFlight(); mark(); }}>Try again</button>
            )}
            <button type="button" className="btn" onClick={() => useAppMode.getState().openExplore()}>Exit</button>
          </div>
          </details>
          {compact && <button id="retry-flight" type="button" className="btn" onClick={() => { clearHeldAxes(); useScene.getState().retryFlight(); mark(); }}>Try again</button>}
        </div>
      </section>
    </>
  );
}
