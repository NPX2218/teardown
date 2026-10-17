import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_STARTERS, readAgentKiosk } from "@/lib/agent/starters";

describe("agent starters (04 Task 5)", () => {
  it("ST2 kiosk parsing matches the flag contract", () => {
    expect(readAgentKiosk("?kiosk=1")).toBe(true);
    expect(readAgentKiosk("?kiosk=true")).toBe(false);
    expect(readAgentKiosk("", true)).toBe(true);
    expect(readAgentKiosk("?kiosk=0", false)).toBe(false);
  });

  it("ST1 three to five short, kid-friendly, digit-free questions", () => {
    expect(AGENT_STARTERS.length).toBeGreaterThanOrEqual(3);
    expect(AGENT_STARTERS.length).toBeLessThanOrEqual(5);
    expect(new Set(AGENT_STARTERS.map((q) => q.label)).size).toBe(AGENT_STARTERS.length);
    for (const q of AGENT_STARTERS) {
      expect(q.label.trim().length).toBeGreaterThan(0);
      expect(q.text.trim().length).toBeGreaterThan(0);
      expect(q.label.length).toBeLessThanOrEqual(32);
      expect(q.label + q.text).not.toMatch(/\d/);
    }
    expect(AGENT_STARTERS.map((q) => q.text).join(" ")).not.toMatch(/engines stop/i);
  });

  it("ST3 the text box source has no raw hex colors", () => {
    const src = readFileSync(new URL("../../components/voice/AgentBox.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
