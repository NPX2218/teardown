import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_SECRETS_URL } from "@/lib/voice/realtime";
import { mintClientSecret, synthesize, VoiceError, XAI_TTS_URL } from "@/lib/voice/xai";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("xAI voice server (05, no live provider)", () => {
  it("VX1 missing key does not call the network", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(synthesize("hello")).rejects.toMatchObject({ status: 503 });
    await expect(mintClientSecret()).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("VX2 a mocked TTS response is returned as bytes and the body matches the docs", async () => {
    vi.stubEnv("XAI_API_KEY", "super-secret-key");
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const bytes = await synthesize("Hello");
    expect(bytes.byteLength).toBe(4);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(XAI_TTS_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer super-secret-key");
    const body = JSON.parse(init.body as string) as { text: string; voice_id: string; language: string };
    expect(body).toEqual({ text: "Hello", voice_id: "eve", language: "en" });
  });

  it("VX3 an ephemeral token is returned and a token equal to the key is refused", async () => {
    vi.stubEnv("XAI_API_KEY", "super-secret-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "ephemeral-token", expires_at: 50 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: "super-secret-key", expires_at: 50 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(mintClientSecret()).resolves.toEqual({ value: "ephemeral-token", expiresAt: 50 });
    expect(fetchMock.mock.calls[0][0]).toBe(CLIENT_SECRETS_URL);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as { expires_after: { seconds: number } };
    expect(sent.expires_after.seconds).toBe(300);
    await expect(mintClientSecret()).rejects.toBeInstanceOf(VoiceError);
  });
});
