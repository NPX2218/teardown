import { describe, expect, it } from "vitest";
import { normalizeAssistant } from "@/lib/agent/normalize";

const wrap = (message: unknown) => ({ choices: [{ index: 0, message, finish_reason: "stop" }] });

describe("normalizeAssistant (04 Task 2)", () => {
  it("N1 plain answer", () => {
    expect(normalizeAssistant(wrap({ role: "assistant", content: "Hi!" }))).toEqual({ role: "assistant", content: "Hi!" });
  });

  it("N2 tool calls kept in OpenAI format; object arguments re-encoded", () => {
    const m = normalizeAssistant(wrap({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "select_part", arguments: "{\"part_id\":\"legs\"}" } },
        { id: "c2", type: "function", function: { name: "set_explode", arguments: { amount: 1 } } },
      ],
    }));
    expect(m).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", type: "function", function: { name: "select_part", arguments: "{\"part_id\":\"legs\"}" } },
        { id: "c2", type: "function", function: { name: "set_explode", arguments: "{\"amount\":1}" } },
      ],
    });
  });

  it("N3 malformed tool calls are dropped; an empty list removes the key", () => {
    const m = normalizeAssistant(wrap({ content: "ok", tool_calls: [{ id: 5 }, { id: "x", function: { name: "" } }] }));
    expect(m).toEqual({ role: "assistant", content: "ok" });
    expect("tool_calls" in m).toBe(false);
  });

  it("N4 junk throws", () => {
    expect(() => normalizeAssistant(null)).toThrow("bad grok response");
    expect(() => normalizeAssistant({ choices: [] })).toThrow("bad grok response");
    expect(() => normalizeAssistant(wrap({ content: null }))).toThrow("bad grok response");
    expect(() => normalizeAssistant({ error: { message: "rate limited" } })).toThrow("bad grok response");
  });
});
