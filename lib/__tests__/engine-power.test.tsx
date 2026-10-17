import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EnginePowerSlider } from "@/components/viewer/EnginePowerSlider";
import { explorePlumeScale, PLUME_LENGTH } from "@/lib/viewer/engine-plume";
import { applyEngineTone, ENGINE_RAMP_S, engineTone } from "@/lib/rocket/engine-rumble";
import { engineBroadcast, enginePercent, enginePowerFromPercent } from "@/lib/rocket/engine-power";
import { decodeMessage } from "@/lib/rocket/protocol";
import { routePhoneMessage, type PhoneHandlers } from "@/lib/rocket/phone";

describe("engine power", () => {
  it("maps the slider percent onto 0..1 state", () => {
    expect(enginePowerFromPercent(0)).toBe(0);
    expect(enginePowerFromPercent(50)).toBe(0.5);
    expect(enginePowerFromPercent(100)).toBe(1);
    expect(enginePowerFromPercent(101)).toBeNull();
    expect(enginePercent(0.5)).toBe(50);
    expect(enginePercent(1)).toBe(100);
    const html = renderToStaticMarkup(<EnginePowerSlider />);
    expect(html).toContain("Engine power");
    expect(html).toContain('aria-valuetext="0 percent"');
    expect(html).toContain('data-engine-power="0"');
    expect(html).toContain(">0%<");
    expect(html).toContain('type="range"');
  });

  it("sends power to a paired phone and stays quiet when unpaired", () => {
    const quiet = engineBroadcast({ power: 0.4, connected: false, exploring: true }, "");
    expect(quiet.message).toBeNull();
    expect(quiet.key).toBe("off");

    const live = engineBroadcast({ power: 0.5, connected: true, exploring: true }, quiet.key);
    expect(live.message).toEqual({ k: "engine", power: 0.5 });

    const again = engineBroadcast({ power: 0.5, connected: true, exploring: true }, live.key);
    expect(again.message).toBeNull();

    const full = engineBroadcast({ power: 1, connected: true, exploring: true }, live.key);
    expect(full.message).toEqual({ k: "engine", power: 1 });

    const leftExplore = engineBroadcast({ power: 1, connected: true, exploring: false }, full.key);
    expect(leftExplore.message).toEqual({ k: "engine", power: 0 });

    expect(decodeMessage({ k: "engine", power: 0 })).toEqual({ k: "engine", power: 0 });
    expect(decodeMessage({ k: "engine", power: 0.5 })).toEqual({ k: "engine", power: 0.5 });
    expect(decodeMessage({ k: "engine", power: 1 })).toEqual({ k: "engine", power: 1 });
    expect(decodeMessage({ k: "engine", power: 1.2 })).toBeNull();
    expect(decodeMessage({ k: "engine", power: -0.1 })).toBeNull();
    expect(decodeMessage({ k: "engine" })).toBeNull();

    const seen: number[] = [];
    const handlers = {
      playSound() {},
      stopSound() {},
      vibrate() {},
      say() {},
      stopSay() {},
      listen() {},
      stopListen() {},
      showStatus() {},
      calibrate() {},
      setEngine(power: number) { seen.push(power); },
      applySettings() {},
    } satisfies PhoneHandlers;
    routePhoneMessage({ k: "engine", power: 0.25 }, handlers);
    expect(seen).toEqual([0.25]);
  });

  it("maps power onto phone gain and filter cutoff, with silence at 0", () => {
    const off = engineTone(0);
    const mid = engineTone(0.5);
    const full = engineTone(1);
    expect(off.gain).toBe(0);
    expect(mid.gain).toBeGreaterThan(0);
    expect(mid.gain).toBeLessThan(full.gain);
    expect(full.gain).toBeLessThanOrEqual(0.72);
    expect(mid.cutoffHz).toBeGreaterThan(off.cutoffHz);
    expect(full.cutoffHz).toBeGreaterThan(mid.cutoffHz);
    expect(full.oscHz).toBeGreaterThan(off.oscHz);
    expect(engineTone(Number.NaN).gain).toBe(0);

    const writes: Array<[number, number, number]> = [];
    applyEngineTone({
      now: 4,
      gain: { setTargetAtTime: (value, time, constant) => writes.push([value, time, constant]) },
      cutoff: { setTargetAtTime: (value) => writes.push([value, 0, 0]) },
      osc: { setTargetAtTime: (value) => writes.push([value, 0, 0]) },
    }, 0.5);
    expect(writes[0]).toEqual([mid.gain, 4, ENGINE_RAMP_S]);
    expect(writes[1]?.[0]).toBe(mid.cutoffHz);
    expect(writes[2]?.[0]).toBe(mid.oscHz);
  });

  it("scales plume length and brightness with power, and drops flicker when motion is reduced", () => {
    const off = explorePlumeScale(0, false);
    const mid = explorePlumeScale(0.5, false);
    const full = explorePlumeScale(1, false);
    const still = explorePlumeScale(1, true);
    expect(off).toEqual({ length: 0, brightness: 0, flicker: 0, radius: 0.05 });
    expect(mid.length).toBeCloseTo(PLUME_LENGTH * 0.5);
    expect(mid.brightness).toBe(0.5);
    expect(mid.flicker).toBe(0.5);
    expect(full.length).toBe(PLUME_LENGTH);
    expect(full.brightness).toBe(1);
    expect(full.flicker).toBe(1);
    expect(full.radius).toBeGreaterThan(mid.radius);
    expect(still.length).toBe(PLUME_LENGTH);
    expect(still.brightness).toBe(1);
    expect(still.flicker).toBe(0);
    expect(explorePlumeScale(Number.NaN, false).length).toBe(0);
  });
});
