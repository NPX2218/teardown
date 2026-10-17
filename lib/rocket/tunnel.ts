// lib/rocket/tunnel.ts — pure helpers for scripts/tunnel.ts (`npm run tunnel`). Owner: Neel.
// The script, not these helpers, touches the network, the child process and .env.local.

export const ORIGIN_KEY = "NEXT_PUBLIC_ROCKET_ORIGIN";

// Quick-tunnel hostnames are random words; api.trycloudflare.com is cloudflared's own endpoint, never the tunnel.
const TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;

/** The public tunnel URL in one cloudflared log line, or null. */
export function parseTunnelUrl(line: string): string | null {
  return line.match(TUNNEL_URL)?.[0] ?? null;
}

/**
 * Public env for a phone on any network, with no Supabase: the QR opens the app tunnel, and both the laptop
 * and the phone join the local dev relay (`npm run relay:dev`) through its own tunnel. Keys match relay-mode.ts.
 */
export function tunnelEnv(appUrl: string, relayUrl: string): Record<string, string> {
  return {
    [ORIGIN_KEY]: appUrl,
    NEXT_PUBLIC_ROCKET_RELAY: "local",
    NEXT_PUBLIC_ROCKET_RELAY_URL: relayUrl.replace(/^https:/, "wss:"),
  };
}

/** Sets `key=value` in dotenv text: replaces the existing line, else appends. Other lines are untouched. */
export function upsertEnvLine(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, line);
  const sep = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${line}\n`;
}
