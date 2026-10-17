import { describe, expect, it } from "vitest";
import { selectRelayMode } from "@/lib/rocket/relay-mode";

describe("relay mode", () => {
  it("uses broadcast in dev and test when nothing is set", () => {
    expect(selectRelayMode({ NODE_ENV: "development" })).toBe("broadcast");
    expect(selectRelayMode({ NODE_ENV: "test" })).toBe("broadcast");
  });

  it("rejects production when nothing is set", () => {
    expect(selectRelayMode({ NODE_ENV: "production" })).toBeNull();
  });

  it("lets NEXT_PUBLIC_ROCKET_RELAY pick the transport", () => {
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "local", NODE_ENV: "production" })).toBe("local");
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "broadcast" })).toBe("broadcast");
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "typo" })).toBeNull();
  });

  it("M1: supabase is no longer a transport (removed 2026-10-17; the tunnel + local relay replaced it)", () => {
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "supabase", NODE_ENV: "development" })).toBeNull();
  });
});
