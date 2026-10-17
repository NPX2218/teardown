"use client";
import { useSyncExternalStore } from "react";
import { SENTINEL_REFERENCE_UNAVAILABLE } from "@/lib/flight/classroom";
import { useAppMode } from "@/lib/flight/app-mode";
import {
  formatKm,
  formatSpeed,
  fuelPercent,
  goalLine,
  hudFuelNotice,
  stageLabel,
} from "@/lib/flight/format";
import {
  clearHeldAxes,
  heldAxes,
  setPointerPitch,
  subscribeHeld,
} from "@/lib/flight/local-controls";
import { handoffPitchToLocal, resumeFlightExplicit } from "@/lib/flight/phone-pitch";
import { zeroRocket } from "@/lib/rocket/useRocket";
import { clearCameraNudge } from "./cameraNudge";
import { useScene } from "@/lib/store";
import type { FlightWarp } from "@/lib/types";
import { EmissionsPlacement } from "./EmissionsPlacement";
import styles from "./flight.module.css";

function useHeldPitch(): number {
  return useSyncExternalStore(subscribeHeld, () => heldAxes.pitch, () => 0);
}

export function FlightHud() {
  const flight = useScene((s) => s.flight);
  const phoneConnected = useScene((s) => s.rocket.connected);
  const view = useAppMode((s) => s.view);
  const heldPitch = useHeldPitch();
  const status = flight.status;
  const readout = flight.readout;
  const steering = status === "flying";
  const pitchOwned = flight.owners.pitch === "local";
  const throttleOwned = flight.owners.throttle === "local";
  const pitchDeg = Math.round(((flight.input.pitchRad * 180) / Math.PI) * 10) / 10;
  const fuel = readout && flight.fuel ? fuelPercent(readout.propellantRemainingKg, flight.fuel.stages) : 100;
  const notice = hudFuelNotice(readout, status);

  const mark = () => useScene.getState().markActivity(performance.now());
  const launch = () => {
    clearHeldAxes();
    useScene.getState().launchFlight();
    mark();
  };
  const pause = () => {
    clearHeldAxes();
    useScene.getState().pauseFlight();
    mark();
  };
  const resume = () => {
    resumeFlightExplicit();
    mark();
  };
  const pick = (id: string) => {
    clearHeldAxes();
    useScene.getState().startFlight(id);
    mark();
  };
  const steerPitch = (degrees: number) => {
    const runId = useScene.getState().flight.runId;
    if (!runId) return;
    useScene.getState().setFlightInput({ pitchRad: (degrees * Math.PI) / 180 }, "local", runId);
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

  return (
    <>
      <section id="flight-status" className={`hud ${styles.readout}`} data-status={status} data-sim-time={flight.simulatedTimeS} aria-label="Flight readout">
        {status === "ready" && (
          <div className={styles.stack}>
            <p className="hud__k">Your mission</p>
            <h2>Go up, then turn to build speed around Earth.</h2>
            <p>The goal is a path around Earth. The lowest point stays at least 200 km up. The highest point stays under 2,000 km. Then coast for 10 seconds with the engines off.</p>
            <p className={styles.note}>Earth is drawn to size. The rocket dot is bigger so you can see it.</p>
            <div className={styles.actions}>
              <button id="scenario-classroom" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom"} onClick={() => pick("classroom")}>Classroom launch</button>
              <button id="scenario-classroom-hop" type="button" className="btn" aria-pressed={flight.scenarioId === "classroom-hop"} onClick={() => pick("classroom-hop")}>Short hop</button>
              <button type="button" className="btn" disabled>Sentinel-6</button>
            </div>
            <p className={styles.note}>{SENTINEL_REFERENCE_UNAVAILABLE} These classroom rockets are practice vehicles, not a recorded flight.</p>
          </div>
        )}
        {readout && status !== "ready" && (
          <div className={styles.stack}>
            <div className="hud__row"><span className="hud__k">Height</span><span className="hud__v">{formatKm(readout.altitudeM)}</span></div>
            <div className="hud__row"><span className="hud__k">Sideways speed</span><span className="hud__v">{formatSpeed(readout.tangentialSpeedMps)}</span></div>
            <div className="hud__row"><span className="hud__k">Stage</span><span className="hud__v">{stageLabel(readout.activeStageId)}</span></div>
            <div className="hud__row"><span className="hud__k">Fuel</span><span className="hud__v">{fuel.toFixed(0)}%</span></div>
            <div className="hud__row"><span className="hud__k">Engine power</span><span className="hud__v">{Math.round(readout.throttle * 100)}%</span></div>
            <div className="hud__row"><span className="hud__k">Tilt</span><span className="hud__v">{pitchDeg.toFixed(0)}°</span></div>
            <div className="hud__row">
              <span className="hud__k">Lowest point</span>
              <span className="hud__v">{formatKm(readout.periapsisAltitudeM)}</span>
            </div>
            <p className={styles.note}>The lowest part of your path around Earth.</p>
            <div className="hud__row">
              <span className="hud__k">Highest point</span>
              <span className="hud__v">{formatKm(readout.apoapsisAltitudeM)}</span>
            </div>
            <p className={styles.note}>The highest part of your path around Earth.</p>
            <p>{goalLine(readout)}</p>
            {notice && <p className="hud__v hud__v--bad">{notice}</p>}
            <p className={styles.note}>Earth is drawn to size. The rocket dot is bigger so you can see it. The pale line is the coast if you cut thrust now.</p>
            <details className={styles.more}>
              <summary>More numbers</summary>
              <div className="hud__row"><span className="hud__k">Up speed</span><span>{formatSpeed(readout.radialSpeedMps)}</span></div>
              <div className="hud__row"><span className="hud__k">Full speed</span><span>{formatSpeed(readout.totalSpeedMps)}</span></div>
              <div className="hud__row"><span className="hud__k">Mission time</span><span>{flight.simulatedTimeS.toFixed(1)} s</span></div>
              <div className="hud__row"><span className="hud__k">Engines-off time</span><span>{(flight.state?.thrustOffS ?? 0).toFixed(1)} s</span></div>
            </details>
          </div>
        )}
        <EmissionsPlacement />
      </section>
      <section className={`hud ${styles.controls}`} aria-label="Flight controls">
        <div className={styles.stack}>
          {status === "ready" && (
            <button id="launch-flight" type="button" className="btn btn-accent btn-lg" onClick={launch}>Launch</button>
          )}
          {status === "flying" && (
            <button id="pause-flight" type="button" className="btn" onClick={pause}>Pause</button>
          )}
          {status === "paused" && (
            <button id="pause-flight" type="button" className="btn btn-accent" onClick={resume}>Resume</button>
          )}
          {status === "paused" && !phoneConnected && (
            <p className="hud__v hud__v--bad">Phone disconnected. Flight paused. Tap Resume to fly with the screen.</p>
          )}
          {flight.owners.pitch === "phone" && phoneConnected && (
            <p className={styles.note}>The phone tilts the rocket. Engine power stays on this screen.</p>
          )}
          <div className={styles.actions}>
            {phoneConnected && status !== "idle" && flight.owners.pitch !== "phone" && (
              <button type="button" className="btn" onClick={() => { zeroRocket(); mark(); }}>
                Use phone tilt
              </button>
            )}
            {flight.owners.pitch === "phone" && (
              <button id="handoff-pitch" type="button" className="btn" onClick={() => { handoffPitchToLocal(); mark(); }}>
                Use screen tilt
              </button>
            )}
          </div>
          <p className={styles.note}>0 tilt is straight up. A positive tilt turns downrange. Launch leaves the engines off until you set power.</p>
          <label className="range" htmlFor="pitch-control">
            Tilt
            <input
              id="pitch-control"
              type="range"
              min={-90}
              max={90}
              step={0.1}
              value={Math.max(-90, Math.min(90, pitchDeg))}
              data-keys-owned={heldPitch !== 0 ? "true" : "false"}
              disabled={!steering || !pitchOwned}
              onChange={(event) => steerPitch(Number(event.target.value))}
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className={`btn ${styles.hold}`}
              disabled={!steering || !pitchOwned}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setPointerPitch(-1);
                mark();
              }}
              onPointerUp={() => setPointerPitch(0)}
              onPointerCancel={() => setPointerPitch(0)}
              onLostPointerCapture={() => setPointerPitch(0)}
            >
              Tilt left
            </button>
            <button
              type="button"
              className={`btn ${styles.hold}`}
              disabled={!steering || !pitchOwned}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setPointerPitch(1);
                mark();
              }}
              onPointerUp={() => setPointerPitch(0)}
              onPointerCancel={() => setPointerPitch(0)}
              onLostPointerCapture={() => setPointerPitch(0)}
            >
              Tilt right
            </button>
          </div>
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
            <button type="button" className="btn" onClick={() => { clearCameraNudge(); useAppMode.getState().resetCamera(); }}>Reset view</button>
            {status !== "idle" && !flight.outcome && (
              <button id="retry-flight" type="button" className="btn" onClick={() => { clearHeldAxes(); useScene.getState().retryFlight(); mark(); }}>Try again</button>
            )}
            <button type="button" className="btn" onClick={() => useAppMode.getState().openExplore()}>Exit</button>
          </div>
        </div>
      </section>
    </>
  );
}
