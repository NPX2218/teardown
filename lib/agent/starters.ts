// lib/agent/starters.ts — example questions a visitor can tap (04 Task 5). Owner: Anders.
// No engine-out question: that sandbox is retired. "Let's fly!" only opens the briefing.

export interface AgentStarter {
  label: string;
  text: string;
}

export function readAgentKiosk(search: string, bodyKiosk = false): boolean {
  return new URLSearchParams(search).get("kiosk") === "1" || bodyKiosk;
}

export const AGENT_STARTERS: readonly AgentStarter[] = [
  { label: "What lands back on Earth?", text: "What lands back on Earth?" },
  { label: "What do the grid fins do?", text: "What do the grid fins do?" },
  { label: "Why so many engines?", text: "Why does the booster have so many engines?" },
  { label: "How do we reach orbit?", text: "How does the rocket reach orbit?" },
  { label: "Let's fly!", text: "Let's fly!" },
];
