import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALIBRATE_DELAY_S, SUCCESS_SHOW_MS, startCalibration } from "@/lib/rocket/calibrate";

function steps() {
  const log: string[] = [];
  return {
    log,
    cb: {
      tick: (n: number) => log.push(`tick ${n}`),
      calibrate: () => log.push("calibrate"),
      success: (shown: boolean) => log.push(shown ? "shown" : "hidden"),
    },
  };
}

describe("startCalibration", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("C1: counts down 3 s, calibrates, shows success, then hides it", () => {
    const { log, cb } = steps();
    startCalibration(cb);
    expect(log).toEqual(["tick 3"]);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["tick 3", "tick 2", "tick 1"]);
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["tick 3", "tick 2", "tick 1", "calibrate", "shown"]);
    vi.advanceTimersByTime(SUCCESS_SHOW_MS);
    expect(log.at(-1)).toBe("hidden");
  });

  it("C2: calibrates exactly once, only after the full delay", () => {
    const { log, cb } = steps();
    startCalibration(cb);
    vi.advanceTimersByTime(CALIBRATE_DELAY_S * 1000 - 1);
    expect(log).not.toContain("calibrate");
    vi.advanceTimersByTime(10_000);
    expect(log.filter((s) => s === "calibrate")).toHaveLength(1);
  });

  it("C3: cancel (unmount or disconnect) stops everything, nothing fires later", () => {
    const { log, cb } = steps();
    const cancel = startCalibration(cb);
    vi.advanceTimersByTime(1500);
    cancel();
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual(["tick 3", "tick 2"]);
  });
});
