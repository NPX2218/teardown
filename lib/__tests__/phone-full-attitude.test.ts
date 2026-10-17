// REGRESSION GUARD for PR #34 follow-up, 2026-10-17: full pointing and twist must survive flight input.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stepPhoneAttitude, shapePhoneAttitude, phoneToFlightAttitude } from "@/lib/flight/phone-steering.helpers";
import { handleRocketMessage, resetRocketState, startRocketWatch, zeroRocket } from "@/lib/rocket/useRocket";
import { quatConj, quatMul } from "@/lib/rocket/orient";
import { launchControlledFlight } from "@/lib/flight/controls";
import { useScene } from "@/lib/store";
import { useAppMode } from "@/lib/flight/app-mode";
import { frameFor } from "../../scripts/sim-phone";
import type { Quat } from "@/lib/types";

const identity: Quat = [1, 0, 0, 0];
const initial = useScene.getState();
let stop: (() => void) | null = null;
const rotation = (axis: 1 | 2 | 3, degrees: number): Quat => {
  const angle = degrees * Math.PI / 360;
  const q: Quat = [Math.cos(angle), 0, 0, 0]; q[axis] = Math.sin(angle); return q;
};
function rotated(q: Quat, v: [number, number, number]): number[] {
  const a = quatMul(quatMul(q, [0, ...v]), quatConj(q)); return a.slice(1);
}
function hold(target: Quat, seconds: number): Quat {
  let q = identity;
  for (let i = 0; i < seconds * 20; i += 1) q = stepPhoneAttitude(q, target, 0.05);
  return q;
}

beforeEach(() => {
  useScene.setState(initial, true); useAppMode.setState({ mode: "mission" }); resetRocketState();
});
afterEach(() => { stop?.(); stop = null; });

describe("full phone orientation response (PR #34)", () => {
  it.each([90, 120, 180])("Q1: retains a held %s degree pointing target beyond the old cone (PR #34)", (degrees) => {
    const q = hold(rotation(1, degrees), 20);
    const nose = rotated(q, [0, 1, 0]);
    expect(nose[1]).toBeCloseTo(Math.cos(degrees * Math.PI / 180), 10);
    expect(nose[2]).toBeCloseTo(Math.sin(degrees * Math.PI / 180), 10);
  });
  it("Q2: has finer small-angle control without clipping large angles (PR #34)", () => {
    expect(2 * Math.acos(shapePhoneAttitude(rotation(1, 30))[0]) * 180 / Math.PI).toBeCloseTo(60 * (28 / 58) ** 2, 10);
    expect(shapePhoneAttitude(rotation(1, 1))).toEqual(identity);
    expect(2 * Math.acos(shapePhoneAttitude(rotation(1, 120))[0]) * 180 / Math.PI).toBeCloseTo(120, 10);
  });
  it("Q3: twist changes orientation without changing the nose (PR #34)", () => {
    const q = hold(rotation(2, 90), 10);
    expect(q[2]).toBeCloseTo(Math.SQRT1_2, 10);
    expect(rotated(q, [0, 1, 0])).toEqual([0, 1, 0]);
  });
  it("Q4: spends one shared twelve-degree budget when all axes move (PR #34)", () => {
    const target = quatMul(rotation(1, 120), rotation(2, 90));
    const q = hold(target, 1);
    expect(2 * Math.acos(q[0]) * 180 / Math.PI).toBeCloseTo(12, 10);
  });
  it("Q5: quaternion sign changes cannot produce a full-turn jump (PR #34)", () => {
    const q = rotation(1, 120);
    const next = stepPhoneAttitude(q, q.map((n) => -n) as Quat, 0.05);
    q.forEach((value, i) => expect(Math.abs(next[i])).toBeCloseTo(Math.abs(value), 12));
  });
  it("Q6: inverts all three phone axes in the flight coordinate frame (PR #34)", () => {
    const nose = rotated(phoneToFlightAttitude(rotation(1, 90)), [0, 1, 0]);
    expect(nose[0]).toBeCloseTo(-1, 12); expect(nose[1]).toBeCloseTo(0, 12);
    const side = rotated(phoneToFlightAttitude(rotation(3, 90)), [0, 1, 0]);
    expect(side[2]).toBeCloseTo(-1, 12);
    const twist = phoneToFlightAttitude(rotation(2, 90));
    expect(twist[2]).toBeCloseTo(-Math.SQRT1_2, 12);
  });
  it("Q10: reverses a combined orientation without losing full pointing or twist (PR #34 handset report)", () => {
    const physical = quatMul(quatMul(rotation(3, 25), rotation(1, 35)), rotation(2, 70));
    const remap: Quat = [Math.SQRT1_2, 0, Math.SQRT1_2, 0];
    const raw = quatMul(quatMul(quatConj(remap), physical), remap);
    const changed = phoneToFlightAttitude(raw);
    const undone = quatMul(changed, physical);
    expect(Math.abs(undone[0])).toBeCloseTo(1, 12);
    undone.slice(1).forEach((value) => expect(value).toBeCloseTo(0, 12));
    const inverted = phoneToFlightAttitude(rotation(1, 180));
    expect(inverted.every(Number.isFinite)).toBe(true);
  });
});

describe("full orientation through real phone handler (PR #34)", () => {
  function launch(): void {
    stop = startRocketWatch();
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().startFlight("classroom");
    handleRocketMessage(frameFor(0), 1000);
    expect(launchControlledFlight("mission").ok).toBe(true);
  }
  it("Q7: pointing past horizontal survives a sustained hold rather than aborting (PR #34)", () => {
    launch();
    for (let i = 0; i <= 300; i += 1) handleRocketMessage(frameFor(120), 1050 + i * 50);
    const flight = useScene.getState().flight;
    expect(flight.status).toBe("flying");
    expect(flight.input.attitudeQuat).toBeDefined();
    expect(rotated(flight.input.attitudeQuat!, [0, 1, 0])[1]).toBeLessThan(-0.49);
    zeroRocket();
    expect(useScene.getState().flight.input.attitudeQuat).toBeUndefined();
    expect(useScene.getState().flight.input.pitchRad).toBe(0);
  });
  it("Q8: a pure twist is retained although gravity stays upright (PR #34)", () => {
    launch();
    const q = rotation(2, 90);
    for (let i = 0; i <= 200; i += 1) handleRocketMessage({ k: "frame", q, grav: [0, -9.80665, 0], lin: [0, 0, 0] }, 1050 + i * 50);
    const attitude = useScene.getState().flight.input.attitudeQuat;
    expect(attitude).toBeDefined();
    expect(attitude![2]).toBeCloseTo(-Math.SQRT1_2, 8);
    expect(rotated(attitude!, [0, 1, 0])[1]).toBeCloseTo(1, 12);
  });
  it("Q9: replay Play cannot bypass the required phone after disconnect (PR #34)", () => {
    useScene.getState().startFlight("classroom");
    useScene.setState((s) => ({ flight: { ...s.flight, status: "paused" }, replay: { missionId: "practice", t: 10, playing: false }, missionTrackId: "practice" }));
    useScene.getState().resumeReplay();
    expect(useScene.getState().flight.status).toBe("paused");
    expect(useScene.getState().replay.playing).toBe(false);
    useScene.getState().setRocket({ connected: true, code: "ABCD" });
    useScene.getState().resumeReplay();
    expect(useScene.getState().flight.status).toBe("flying");
    expect(useScene.getState().flight.owners.pitch).toBe("phone");
    expect(useScene.getState().flight.input.attitudeQuat).toBeUndefined();
  });
});
