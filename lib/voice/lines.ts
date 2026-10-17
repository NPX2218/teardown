// lib/voice/lines.ts — fixed spoken lines (01 Task 5 seam). Owner: Anders.
// 07 and 11 import these instead of writing the strings themselves. Add keys; never rename them.
export const LINES = {
  reset: "Reset! Stand the rocket up and lift off when you're ready.",
  touchdown: "Touchdown! You did it!",
  goodQuestion: "Good question!",
  cantReachGrok: "I couldn't reach Grok. Try again.",
  didntHear: "I didn't hear you. Try again.",
} as const;
