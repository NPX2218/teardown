import { describe, expect, it } from "vitest";
import { lookAt, PITCH, PITCH_MAX, YAW_MAX } from "@/lib/mascot/gaze";

describe("lookAt", () => {
  it("turns toward a pointer and settles when the pointer leaves", () => {
    expect(lookAt(1, 0, true)).toEqual({ yaw: YAW_MAX, pitch: PITCH, mix: 1, spin: 0, wander: 0 });
    expect(lookAt(0, 1, true)).toEqual({ yaw: 0, pitch: PITCH - PITCH_MAX, mix: 1, spin: 0, wander: 0 });
    expect(lookAt(-1, -1, true).yaw).toBe(-YAW_MAX);
    expect(lookAt(0, 0, false)).toEqual({ yaw: 0, pitch: PITCH, mix: 0, spin: 0, wander: 1 });
  });
});
