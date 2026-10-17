import { describe, expect, it } from "vitest";
import { checkpointGesturesEnabled, noteCheckpointGesture } from "@/lib/rocket/gesture-gate";

describe("retired checkpoint gestures", () => {
  it("drops every move unless the debug gate is on, and the gate does not fly", () => {
    expect(checkpointGesturesEnabled({})).toBe(false);
    expect(noteCheckpointGesture("liftoff", false)).toBeNull();
    expect(noteCheckpointGesture("shake", false)).toBeNull();
    expect(noteCheckpointGesture(null, true)).toBeNull();
    expect(noteCheckpointGesture("lean", true)).toBe("lean");
    expect(checkpointGesturesEnabled({ NEXT_PUBLIC_ROCKET_GESTURES: "1" })).toBe(true);
  });
});
