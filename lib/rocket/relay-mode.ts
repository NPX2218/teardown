// lib/rocket/relay-mode.ts — which transport openLink uses. Owner: Neel.
// The exhibit runs on the local relay through a cloudflared tunnel (npm run tunnel). Supabase was removed 2026-10-17.

export type RocketRelayMode = "local" | "broadcast";

export interface RelayEnv {
  NEXT_PUBLIC_ROCKET_RELAY?: string;
  NODE_ENV?: string;
}

/** Direct `process.env.NEXT_PUBLIC_*` reads so Next can inline them in the browser bundle. */
export function currentRelayEnv(): RelayEnv {
  return {
    NEXT_PUBLIC_ROCKET_RELAY: process.env.NEXT_PUBLIC_ROCKET_RELAY,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/**
 * Explicit NEXT_PUBLIC_ROCKET_RELAY (local | broadcast) wins.
 * Dev and test with nothing set fall back to BroadcastChannel (same browser only). Production stays unconfigured.
 */
export function selectRelayMode(env: RelayEnv = currentRelayEnv()): RocketRelayMode | null {
  const raw = env.NEXT_PUBLIC_ROCKET_RELAY?.trim();
  if (raw === "local" || raw === "broadcast") return raw;
  if (raw) return null;
  if (env.NODE_ENV === "production") return null;
  return "broadcast";
}
