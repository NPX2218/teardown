import { describe, expect, it } from "vitest";
import { OUTCOME_FACE_MS, outcomeFace, type OutcomeStamp } from "@/lib/mascot/outcome";

const orbit = { runId: "run-1", outcome: { kind: "orbit" as const, runId: "run-1" } };

describe("outcomeFace", () => {
  it("rests when there is no result", () => {
    expect(outcomeFace({ runId: "run-1", outcome: null }, null, 0)).toEqual({ kind: null, held: null });
    expect(outcomeFace({ runId: null, outcome: null }, null, 0)).toEqual({ kind: null, held: null });
  });

  it("shows orbit, a crash, and a failure while the hold is open", () => {
    expect(outcomeFace(orbit, null, 1_000).kind).toBe("orbit");
    expect(outcomeFace({ runId: "run-2", outcome: { kind: "crashed", runId: "run-2" } }, null, 0).kind).toBe("crashed");
    expect(outcomeFace({ runId: "run-3", outcome: { kind: "failed", runId: "run-3" } }, null, 0).kind).toBe("failed");
  });

  it("drops the face after six seconds and does not restart it", () => {
    const first = outcomeFace(orbit, null, 0);
    expect(first.kind).toBe("orbit");
    const later = outcomeFace(orbit, first.held, OUTCOME_FACE_MS);
    expect(later.kind).toBeNull();
    expect(later.held).toBe(first.held);
    const again = outcomeFace(orbit, later.held, OUTCOME_FACE_MS + 10_000);
    expect(again.kind).toBeNull();
    expect(again.held).toBe(first.held);
  });

  it("clears immediately when a new run starts", () => {
    const held: OutcomeStamp = { runId: "run-1", kind: "orbit", at: 0 };
    expect(outcomeFace({ runId: "run-2", outcome: null }, held, 100)).toEqual({ kind: null, held: null });
    expect(outcomeFace({ runId: "run-2", outcome: { kind: "orbit", runId: "run-1" } }, held, 100)).toEqual({
      kind: null,
      held: null,
    });
  });

  it("a new result on a new run starts a fresh hold", () => {
    const old: OutcomeStamp = { runId: "run-1", kind: "failed", at: 0 };
    const next = outcomeFace({ runId: "run-2", outcome: { kind: "orbit", runId: "run-2" } }, old, 500);
    expect(next.kind).toBe("orbit");
    expect(next.held).toEqual({ runId: "run-2", kind: "orbit", at: 500 });
  });
});
