import { describe, expect, it } from "vitest";
import { CLASSROOM_HOP, CLASSROOM_LAUNCH, CLASSROOM_SCENARIOS } from "@/lib/flight/classroom";
import { validateFlightScenario } from "@/lib/flight/scenario";
import { CLASSROOM_ORBIT_PROFILE, HOP_CRASH_PROFILE, flyProfile } from "@/lib/flight/profiles";

describe("recorded classroom profiles", () => {
  it("classroom presets validate as custom gameplay tuning", () => {
    for (const scenario of Object.values(CLASSROOM_SCENARIOS)) {
      expect(validateFlightScenario(scenario)).toEqual([]);
      expect(scenario.kind).toBe("custom");
      expect(scenario.historicalMissionId).toBeNull();
      for (const stage of scenario.stages) {
        expect(stage.propellantKg.classification).toBe("gameplay-tuning");
      }
    }
    expect(CLASSROOM_SCENARIOS["sentinel-6-reference"]).toBeUndefined();
  });

  it("the recorded classroom profile reaches orbit and the hop hits the ground", () => {
    const orbit = flyProfile(CLASSROOM_LAUNCH, CLASSROOM_ORBIT_PROFILE);
    expect(orbit.outcome?.kind).toBe("orbit");
    const crash = flyProfile(CLASSROOM_HOP, HOP_CRASH_PROFILE, 120);
    expect(crash.outcome?.kind).toBe("crashed");
    const straight = flyProfile(CLASSROOM_LAUNCH, HOP_CRASH_PROFILE, 700);
    expect(straight.outcome?.kind).not.toBe("orbit");
  });
});
