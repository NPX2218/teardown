import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grok", () => ({
  grokChat: vi.fn(),
}));

import { grokChat } from "@/lib/grok";
import { POST } from "@/app/api/agent/route";
import { TOOLS } from "@/lib/agent/tools";

const mocked = vi.mocked(grokChat);

function post(body: unknown, headers?: Record<string, string>): Promise<Response> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw,
  }));
}

describe("POST /api/agent", () => {
  it("R1 bad json is 400 and a mocked assistant message is returned as JSON", async () => {
    expect(await (await post("nope")).json()).toEqual({ error: "bad json" });
    mocked.mockResolvedValueOnce({ role: "assistant", content: "Legs fold out to land." });
    const res = await post({ messages: [{ role: "user", content: "show me the landing legs" }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "assistant", content: "Legs fold out to land." });
    const messages = mocked.mock.calls.at(-1)?.[0];
    expect(messages?.[0].role).toBe("system");
    expect(messages?.[0].content).toContain("10-year-old");
    expect(mocked.mock.calls.at(-1)?.[1]).toBe(TOOLS);
  });

  it("R2 provider errors become 502 without echoing the key", async () => {
    mocked.mockRejectedValueOnce(new Error("XAI_API_KEY missing"));
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "grok unavailable" });
  });

  it("R3 an oversized content-length is refused before Grok", async () => {
    mocked.mockClear();
    const res = await post({ messages: [{ role: "user", content: "hi" }] }, { "content-length": "999999" });
    expect(res.status).toBe(413);
    expect(mocked).not.toHaveBeenCalled();
  });
});
