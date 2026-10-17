// lib/rocket/relay-mode.ts — which transport openLink uses. Owner: Neel.
// Supabase stays the production path. Dev and test can run with no keys.

export type RocketRelayMode = "supabase" | "local" | "broadcast";

export interface RelayEnv {
  NEXT_PUBLIC_ROCKET_RELAY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NODE_ENV?: string;
}

/** Direct `process.env.NEXT_PUBLIC_*` reads so Next can inline them in the browser bundle. */
export function currentRelayEnv(): RelayEnv {
  return {
    NEXT_PUBLIC_ROCKET_RELAY: process.env.NEXT_PUBLIC_ROCKET_RELAY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/**
 * Explicit NEXT_PUBLIC_ROCKET_RELAY (supabase | local | broadcast) wins.
 * With Supabase keys and no override, the mode stays supabase.
 * Dev and test with no keys fall back to BroadcastChannel. Production with no keys stays unconfigured.
 */
export function selectRelayMode(env: RelayEnv = currentRelayEnv()): RocketRelayMode | null {
  const raw = env.NEXT_PUBLIC_ROCKET_RELAY?.trim();
  if (raw === "supabase" || raw === "local" || raw === "broadcast") return raw;
  if (raw) return null;
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return "supabase";
  if (env.NODE_ENV === "production") return null;
  return "broadcast";
}
