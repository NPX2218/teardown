// lib/agent/starters.ts — kiosk flag for the Grok guide (04 Task 5). Owner: Anders.
// The tap-to-ask questions now live in lib/ui/guide-flow.ts (GUIDE_SUGGESTIONS).

export function readAgentKiosk(search: string, bodyKiosk = false): boolean {
  return new URLSearchParams(search).get("kiosk") === "1" || bodyKiosk;
}
