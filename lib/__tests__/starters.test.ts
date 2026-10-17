import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAgentKiosk } from "@/lib/agent/starters";

describe("agent starters (04 Task 5)", () => {
  it("ST2 kiosk parsing matches the flag contract", () => {
    expect(readAgentKiosk("?kiosk=1")).toBe(true);
    expect(readAgentKiosk("?kiosk=true")).toBe(false);
    expect(readAgentKiosk("", true)).toBe(true);
    expect(readAgentKiosk("?kiosk=0", false)).toBe(false);
  });

  it("ST3 the Grok guide panel (which replaced the Ask the rocket box, 2026-10-17) has no raw hex colors", () => {
    const src = readFileSync(new URL("../../components/ui/GuidePanel.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("ST4 kiosk hides typing in the guide but keeps the question chips", () => {
    const src = readFileSync(new URL("../../components/ui/GuidePanel.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/\{!kiosk && <form/);
    expect(src).toMatch(/GUIDE_SUGGESTIONS\.map/);
  });
});
