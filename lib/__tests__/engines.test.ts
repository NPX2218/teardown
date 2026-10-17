import { describe, expect, it } from "vitest";
import { liftoffThrustKN, liftoffTW, liftoffVerdict, runningCount } from "@/lib/engines";

// Values from planning doc §2 engine-out table / 02 Task 1 vehicle block.
const F9 = { merlinThrustSlKN: 845, liftoffMassKg: 549054, merlinCount: 9 };

describe("engines (01 Task 5, 08 Task 1)", () => {
  it("T1 liftoff T/W matches the planning-doc table", () => {
    expect(liftoffTW(F9, [])).toBeCloseTo(1.41, 2);
    expect(liftoffTW(F9, [1])).toBeCloseTo(1.26, 2);
    expect(liftoffTW(F9, [1, 2])).toBeCloseTo(1.1, 2);
    expect(liftoffTW(F9, [1, 2, 3])).toBeCloseTo(0.94, 2);
    expect(liftoffThrustKN(F9, [1, 2])).toBe(5915);
  });

  it("T2 verdicts: yes / barely / no", () => {
    expect(liftoffVerdict(liftoffTW(F9, []))).toBe("yes");
    expect(liftoffVerdict(liftoffTW(F9, [1]))).toBe("yes");
    expect(liftoffVerdict(liftoffTW(F9, [1, 2]))).toBe("barely");
    expect(liftoffVerdict(liftoffTW(F9, [1, 2, 3]))).toBe("no");
    expect(liftoffVerdict(1)).toBe("no");
    expect(liftoffVerdict(NaN)).toBe("no");
  });

  it("T3 all engines off is 0, never NaN", () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(runningCount(all)).toBe(0);
    expect(liftoffTW(F9, all)).toBe(0);
    expect(liftoffTW({ ...F9, liftoffMassKg: 0 }, [])).toBe(0);
    expect(liftoffVerdict(liftoffTW(F9, all))).toBe("no");
  });

  it("T4 duplicates and junk indexes are ignored", () => {
    expect(runningCount([1, 1, 1])).toBe(8);
    expect(liftoffTW(F9, [2, 2, 1])).toBe(liftoffTW(F9, [1, 2]));
    expect(runningCount([12, -1, 1.5, NaN])).toBe(9);
  });
});
