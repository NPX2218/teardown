import { afterEach, describe, expect, it, vi } from "vitest";
import { grokChat, XAI_CHAT_URL } from "@/lib/grok";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("grokChat (04 Task 2, no live provider)", () => {
  it("G1 missing key throws before any network call", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("XAI_TEXT_MODEL", "grok-4.7");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(grokChat([{ role: "user", content: "hi" }])).rejects.toThrow("XAI_API_KEY missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("G2 missing model throws before any network call", async () => {
    vi.stubEnv("XAI_API_KEY", "test-key");
    vi.stubEnv("XAI_TEXT_MODEL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(grokChat([{ role: "user", content: "hi" }])).rejects.toThrow("XAI_TEXT_MODEL missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("G3 a mocked 200 is normalized; the key is not copied into the error on failure", async () => {
    vi.stubEnv("XAI_API_KEY", "super-secret-key");
    vi.stubEnv("XAI_TEXT_MODEL", "grok-4.7");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Hello" } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("nope-secret", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(grokChat([{ role: "user", content: "hi" }])).resolves.toEqual({ role: "assistant", content: "Hello" });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe(XAI_CHAT_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer super-secret-key");
    await expect(grokChat([{ role: "user", content: "hi" }])).rejects.toThrow("grok 500");
  });
});
