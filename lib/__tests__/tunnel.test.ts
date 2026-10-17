import { describe, expect, it } from "vitest";
import { ORIGIN_KEY, parseTunnelUrl, tunnelEnv, upsertEnvLine } from "@/lib/rocket/tunnel";

describe("tunnelEnv", () => {
  it("R1: points the QR at the app tunnel and the link at the relay tunnel over wss (no Supabase)", () => {
    expect(tunnelEnv("https://app-a.trycloudflare.com", "https://relay-b.trycloudflare.com")).toEqual({
      NEXT_PUBLIC_ROCKET_ORIGIN: "https://app-a.trycloudflare.com",
      NEXT_PUBLIC_ROCKET_RELAY: "local",
      NEXT_PUBLIC_ROCKET_RELAY_URL: "wss://relay-b.trycloudflare.com",
    });
  });
});

describe("parseTunnelUrl", () => {
  it("T1: finds the quick-tunnel URL in a cloudflared log line", () => {
    const line = "2026-10-17T16:15:58Z INF |  https://ddr-expects-mysql-gold.trycloudflare.com                |";
    expect(parseTunnelUrl(line)).toBe("https://ddr-expects-mysql-gold.trycloudflare.com");
  });

  it("T2: ignores the api.trycloudflare.com endpoint and unrelated lines", () => {
    expect(parseTunnelUrl("INF Requesting new quick Tunnel on trycloudflare.com...")).toBeNull();
    expect(parseTunnelUrl("ERR failed to reach https://api.trycloudflare.com/tunnel")).toBeNull();
  });
});

describe("upsertEnvLine", () => {
  it("E1: replaces an existing value and keeps every other line", () => {
    const before = "GROK_KEY=abc\nNEXT_PUBLIC_ROCKET_ORIGIN=https://old.trycloudflare.com\nSUPABASE=x\n";
    expect(upsertEnvLine(before, ORIGIN_KEY, "https://new.trycloudflare.com")).toBe(
      "GROK_KEY=abc\nNEXT_PUBLIC_ROCKET_ORIGIN=https://new.trycloudflare.com\nSUPABASE=x\n",
    );
  });

  it("E2: appends when the key is missing, adding a newline if the file lacks one", () => {
    expect(upsertEnvLine("GROK_KEY=abc", ORIGIN_KEY, "https://a.trycloudflare.com")).toBe(
      "GROK_KEY=abc\nNEXT_PUBLIC_ROCKET_ORIGIN=https://a.trycloudflare.com\n",
    );
    expect(upsertEnvLine("", ORIGIN_KEY, "https://a.trycloudflare.com")).toBe(
      "NEXT_PUBLIC_ROCKET_ORIGIN=https://a.trycloudflare.com\n",
    );
  });

  it("E3: does not touch a commented-out or prefixed key", () => {
    const before = "# NEXT_PUBLIC_ROCKET_ORIGIN=https://x\nOLD_NEXT_PUBLIC_ROCKET_ORIGIN=y\n";
    expect(upsertEnvLine(before, ORIGIN_KEY, "https://z")).toBe(`${before}NEXT_PUBLIC_ROCKET_ORIGIN=https://z\n`);
  });
});
