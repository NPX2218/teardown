import { describe, expect, it } from "vitest";
import { selectRelayMode } from "@/lib/rocket/relay-mode";

const KEYS = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};

describe("relay mode", () => {
  it("keeps supabase when the keys are set and nothing overrides them", () => {
    expect(selectRelayMode({ ...KEYS, NODE_ENV: "production" })).toBe("supabase");
    expect(selectRelayMode({ ...KEYS, NODE_ENV: "development" })).toBe("supabase");
  });

  it("uses broadcast in dev and test when the keys are missing", () => {
    expect(selectRelayMode({ NODE_ENV: "development" })).toBe("broadcast");
    expect(selectRelayMode({ NODE_ENV: "test" })).toBe("broadcast");
  });

  it("still rejects production when the keys are missing", () => {
    expect(selectRelayMode({ NODE_ENV: "production" })).toBeNull();
  });

  it("lets NEXT_PUBLIC_ROCKET_RELAY pick the transport, including over keys", () => {
    expect(selectRelayMode({ ...KEYS, NEXT_PUBLIC_ROCKET_RELAY: "local" })).toBe("local");
    expect(selectRelayMode({ ...KEYS, NEXT_PUBLIC_ROCKET_RELAY: "broadcast" })).toBe("broadcast");
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "supabase", NODE_ENV: "production" })).toBe("supabase");
    expect(selectRelayMode({ NEXT_PUBLIC_ROCKET_RELAY: "typo" })).toBeNull();
  });
});
