// One engine-power source for the phone rumble, the vibration hook, and the plumes.
// Explore uses the slider. Flight uses the live throttle. Every other state is silent.
import type { AppMode } from "@/lib/flight/app-mode";
import { useAppMode } from "@/lib/flight/app-mode";
import { runningCount } from "@/lib/engines";
import { useScene } from "@/lib/store";
import type { FlightStatus } from "@/lib/types";
import { useExhibit } from "@/lib/viewer/exhibit";
import { engineBroadcast } from "@/lib/rocket/engine-power";
import type { RocketMessage } from "@/lib/types";

export interface EngineFeedbackSample {
  mode: AppMode;
  /** Exhibit attract loop. The illustration is quiet. */
  attract: boolean;
  /** Laptop tab hidden. The phone also holds its own speaker. */
  hidden: boolean;
  /** Explore slider, 0..1. Ignored outside explore. */
  explorePower: number;
  flightStatus: FlightStatus;
  /** Crash, fail, orbit, or any stored outcome. */
  hasOutcome: boolean;
  /** Laptop engine-power control or the phone tilt throttle. */
  flightThrottle: number;
  /** Kilograms left in the tanks. Empty tanks are engine-out. */
  propellantRemainingKg: number;
  /**
   * Merlin indexes that are out. The live sim has no engine-out control;
   * an empty list leaves thrust alone. Every Merlin out forces silence.
   */
  enginesOut?: readonly number[];
  connected: boolean;
}

export interface EngineFeedbackPorts {
  subscribeScene(listener: () => void): () => void;
  subscribeMode(listener: () => void): () => void;
  subscribeExhibit(listener: () => void): () => void;
  subscribeVisibility(listener: () => void): () => void;
}

function unit(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 0..1 power that may drive the phone. Anything else is 0. */
export function effectiveEnginePower(sample: EngineFeedbackSample): number {
  if (sample.attract || sample.hidden) return 0;
  if (sample.mode === "explore") return unit(sample.explorePower);
  if (sample.mode !== "mission") return 0;
  if (sample.hasOutcome || sample.flightStatus !== "flying") return 0;
  if (!(sample.propellantRemainingKg > 0)) return 0;
  if (sample.enginesOut && runningCount(sample.enginesOut) === 0) return 0;
  return unit(sample.flightThrottle);
}

/** The sample the link and the plumes read. One place, so the two cannot disagree. */
export function readEngineFeedback(hidden?: boolean): EngineFeedbackSample {
  const scene = useScene.getState();
  const flight = scene.flight;
  const tabHidden = hidden ?? (typeof document !== "undefined" && document.visibilityState === "hidden");
  return {
    mode: useAppMode.getState().mode,
    attract: useExhibit.getState().phase === "attract",
    hidden: tabHidden,
    explorePower: scene.enginePower,
    flightStatus: flight.status,
    hasOutcome: flight.outcome !== null,
    flightThrottle: flight.input.throttle,
    propellantRemainingKg: flight.readout?.propellantRemainingKg ?? 0,
    connected: scene.rocket.connected,
  };
}

export function readEffectiveEnginePower(hidden?: boolean): number {
  return effectiveEnginePower(readEngineFeedback(hidden));
}

/**
 * Publish the selected power. The phone rumble ramps; this does not stop the graph.
 * Unpaired laptops send nothing.
 */
export function publishEngineFeedback(
  sample: EngineFeedbackSample,
  previousKey: string,
): { message: RocketMessage | null; key: string } {
  return engineBroadcast({
    power: effectiveEnginePower(sample),
    connected: sample.connected,
    exploring: true,
  }, previousKey);
}

/** Route change and unmount. Forces silence even if the last sample was still thrusting. */
export function releaseEngineFeedback(
  connected: boolean,
  previousKey: string,
): { message: RocketMessage | null; key: string } {
  return engineBroadcast({ power: 0, connected, exploring: true }, previousKey);
}

/**
 * Scene, mode, exhibit, and visibility. Calling this twice would be two drivers;
 * the link calls it once. A second stop is a no-op.
 */
export function bindEngineFeedback(ports: EngineFeedbackPorts, push: () => void): () => void {
  const stopScene = ports.subscribeScene(push);
  const stopMode = ports.subscribeMode(push);
  const stopExhibit = ports.subscribeExhibit(push);
  const stopVisibility = ports.subscribeVisibility(push);
  push();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stopScene();
    stopMode();
    stopExhibit();
    stopVisibility();
  };
}
