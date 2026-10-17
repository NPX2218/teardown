import { describe, expect, it } from "vitest";
import { OUTCOME_FACE_MS, SURPRISE_BEAT_MS, outcomeFace, type ResultStamp } from "@/lib/mascot/outcome";

const orbit = { runId: "run-1", result: "success" as const };

describe("outcomeFace", () => {
  it("rests when there is no result", () => {
    expect(outcomeFace({ runId: "run-1", result: null }, null, 0)).toEqual({ face: null, held: null, until: null });
    expect(outcomeFace({ runId: null, result: "success" }, null, 0)).toEqual({ face: null, held: null, until: null });
  });

  it("celebrates an orbit for the whole hold", () => {
    const first = outcomeFace(orbit, null, 1_000);
    expect(first.face).toBe("celebrate");
    expect(outcomeFace(orbit, first.held, 1_000 + OUTCOME_FACE_MS - 1).face).toBe("celebrate");
  });

  it("a crash or failure is surprised, then sad", () => {
    const crash = outcomeFace({ runId: "run-2", result: "failure" }, null, 0);
    expect(crash.face).toBe("surprised");
    expect(crash.until).toBe(SURPRISE_BEAT_MS);
    const later = outcomeFace({ runId: "run-2", result: "failure" }, crash.held, SURPRISE_BEAT_MS);
    expect(later.face).toBe("sad");
    expect(later.held).toBe(crash.held);
    expect(outcomeFace({ runId: "run-2", result: "failure" }, crash.held, OUTCOME_FACE_MS - 1).face).toBe("sad");
  });

  it("drops the face after six seconds and does not restart it", () => {
    const first = outcomeFace(orbit, null, 0);
    expect(first.face).toBe("celebrate");
    const later = outcomeFace(orbit, first.held, OUTCOME_FACE_MS);
    expect(later.face).toBeNull();
    expect(later.held).toBe(first.held);
    const again = outcomeFace(orbit, later.held, OUTCOME_FACE_MS + 10_000);
    expect(again.face).toBeNull();
    expect(again.held).toBe(first.held);
  });

  it("clears immediately when a new run starts", () => {
    const held: ResultStamp = { runId: "run-1", result: "success", at: 0 };
    expect(outcomeFace({ runId: "run-2", result: null }, held, 100)).toEqual({ face: null, held: null, until: null });
  });

  it("a new result on a new run starts a fresh hold", () => {
    const old: ResultStamp = { runId: "run-1", result: "failure", at: 0 };
    const next = outcomeFace({ runId: "run-2", result: "success" }, old, 500);
    expect(next.face).toBe("celebrate");
    expect(next.held).toEqual({ runId: "run-2", result: "success", at: 500 });
  });
});
