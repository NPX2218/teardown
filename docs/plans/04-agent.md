# 04 · Grok Client + Agent Implementation Plan

**Scope revision — 2026-10-17:** the [current stage spec](../specs/04-agent.spec.md) and [07 migration contract](../specs/07-replay.spec.md#6-cross-stage-migration-contract) supersede conflicting instructions below for tool and flight-readout migration. The former checkpoint/stars mission and standalone Engines/Emissions surfaces are retired. Follow the revised [07 execution plan](07-replay.md); do not build legacy snippets verbatim.

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Ask "show me what lands back on Earth" and Grok answers while calling scene functions that move the model.
**Architecture:** The server route only talks to Grok (it holds the key). The browser runs the tool calls against the store, sends results back, and loops until Grok gives a final answer. Tool definitions and their handlers live in **one file** so they can't drift apart.
**Tech Stack:** xAI API (OpenAI-compatible chat completions with function calling), Next.js route handlers, zustand, vitest.
**Spec:** planning doc §2 feature 1; 01 Task 3 (the store actions are the tools).
**Owner:** Anders. **Needs:** 01 only (`lib/engines.ts` is written in 01 Task 5; the parts file and practice mission exist from 01).

## Global Constraints
See `00-index.md`.

---

### Task 0: Confirm the API (curl, ~20 min)

- [ ] **Step 1:** With your key, call `POST https://api.x.ai/v1/chat/completions` with one simple tool (e.g. `get_time`) and a prompt that should use it. Record in `docs/xai-notes.md`: the text model id you'll use (→ `XAI_TEXT_MODEL`), whether `tool_calls` come back in OpenAI format, typical latency.
- [ ] **Step 2:** Same file: the Grok Voice (text-to-speech), speech-to-text, and Grok Imagine endpoints, request/response formats, latency, rate limits (05 and 09 depend on these). Check xAI's docs at kickoff; don't guess.
- [ ] **Step 3:** Commit `docs: xai api notes`.

### Task 1: Tools and dispatcher

**Files:**
- Create: `lib/agent/tools.ts`
- Test: `lib/__tests__/tools.test.ts`

**Interfaces — Produces:**
```ts
// TOOLS and HANDLERS MUST stay in sync (tested by A1 below).
export const TOOLS: { type: "function"; function: { name: ToolName; description: string; parameters: object } }[];
export type ToolName = "get_state" | "select_part" | "set_explode" | "fly_to" | "start_tour"
                     | "start_replay" | "start_mission" | "set_engines_out" | "set_level" | "imagine";
export function runTool(name: string, args: unknown): Promise<ToolResult>;
```
| Tool | Args (JSON schema) | Calls |
|---|---|---|
| `get_state` | none | returns `{ selectedId, explode, replay, mission, rocketConnected, enginesOut, liftoffTW, verdict, level, partIds, missionIds }` (Task 6 adds `missionStars`) |
| `select_part` | `part_id: string` (enum of part ids) | `selectPart`, then `flyTo` |
| `set_explode` | `amount: number` 0..1 | `setExplode` |
| `fly_to` | `target: string` (part id or `"home"`) | `flyTo` |
| `start_tour` | none | `startTour` |
| `start_replay` | `mission_id: string` (enum of `MISSIONS` keys) | `startReplay` |
| `start_mission` | `mission_id: string` (enum of `MISSIONS` keys) | `startMission` (the guided mission flown with the phone rocket; if `rocketConnected` is false, Grok should first tell the visitor to scan the QR code) |
| `set_engines_out` | `engines: integer[]` (0 = center, 1–8 = ring) | `setEnginesOut` |
| `set_level` | `level: "kid" \| "curious" \| "engineer"` | `setLevel` (e.g. visitor says "explain it simpler" or "give me the details") |
| `imagine` | `prompt: string`, `part_id: string` | `requestImagine` from 09 (until 09 lands: `{ ok: false, error: "imagine not available yet" }`) |

`runTool` never throws: unknown tool, unparseable args, or a wrong type (e.g. `amount: "0.5"`) → `{ ok: false, error }`. No type coercion.

- [ ] **Step 1: Write failing tests**
  - `A1 TOOLS and handlers match`: every `TOOLS` name has a handler and every handler has a `TOOLS` entry. (REGRESSION GUARD: the two lists drifting apart is how agents call missing functions.)
  - `A2 unknown tool`: `runTool("launch_nukes", {})` → `{ ok: false, error: "unknown tool: launch_nukes" }`.
  - `A3 bad part`: `runTool("select_part", { part_id: "wings" })` → `ok: false`, store `selectedId` unchanged.
  - `A4 no coercion`: `runTool("set_explode", { amount: "0.5" })` → `ok: false`.
  - `A5 happy path`: `runTool("set_engines_out", { engines: [1, 2] })` → `ok: true`; store `enginesOut` is `[1, 2]`; `get_state` then reports `liftoffTW` ≈ 1.10.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: agent tools and dispatcher`.

### Task 2: Server-side Grok client

**Files:**
- Create: `lib/grok.ts`, `lib/timeout.ts`
- Modify: `lib/agent/types.ts` (created in 01 Task 5; confirm the shape below)
- Test: `lib/__tests__/timeout.test.ts`

**Interfaces — Produces:**
```ts
// lib/agent/types.ts (shared by server and client; types only)
export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
// lib/timeout.ts
export const TEXT_TIMEOUT_MS = 8000;   // see 00-index Global Constraints
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T>; // rejects Error("timeout")
// lib/grok.ts (server only; import "server-only")
export function grokChat(messages: ChatMessage[], tools?: typeof TOOLS): Promise<ChatMessage>; // the assistant message
```
- [ ] **Step 1: Failing tests** with `vi.useFakeTimers()`: `T1 rejects after 8 s` (never-resolving promise → rejects "timeout" after advancing 8000 ms); `T2 passes through` (resolved promise returns its value).
- [ ] **Step 2:** fail → **Step 3:** implement both files (`grokChat` uses `fetch`, `process.env.XAI_API_KEY`, `process.env.XAI_TEXT_MODEL`, wrapped in `withTimeout`) → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: grok client with timeout`.

### Task 3: System prompt + `/api/agent`

**Files:**
- Create: `lib/agent/prompt.ts`, `app/api/agent/route.ts`
- Test: `lib/__tests__/prompt.test.ts`

**Interfaces — Produces:** `buildSystemPrompt(parts: PartsFile, missions: Record<string, Mission>, level: ExplainLevel): string`.
Prompt contents: you are the guide of a museum exhibit whose motto is "bringing rocket science down to Earth", and you operate a 3D Falcon 9 teardown; use tools to show things while you explain; answer in 1–3 spoken sentences; **never state a number that is not in the DATA below; if the data doesn't cover it, say so**; explain jargon with the GLOSSARY; then the level block, then the DATA (parts JSON, glossary, each mission's name, booster, landing and events).

Level blocks (exact text is yours; these are the rules):
| Level | Rules |
|---|---|
| `kid` (default) | Talk to a curious 10-year-old. Short sentences, everyday words, one idea at a time, explain every technical word. Warm and excited, never babyish. |
| `curious` | Talk to an interested adult with no engineering background. Use correct terms, explained once. |
| `engineer` | Talk to an engineer. Use precise terms and all relevant numbers from the DATA. Still only facts from the DATA. |

- [ ] **Step 1: Failing tests:** `P1` prompt contains every part id and the string `never state a number that is not in the DATA`; `P2` prompt contains each mission's name; `P3` `kid` and `engineer` prompts differ, and the `kid` prompt contains `10-year-old`; `P4` prompt contains every glossary term.
- [ ] **Step 2:** fail → **Step 3:** implement. Route: `POST { messages, level }` (missing or unknown level → `"kid"`) → prepend the system prompt → `grokChat(messages, TOOLS)` → return the assistant message as JSON. On error return `502 { error }`. The client sends the store's `level`. → **Step 4:** pass.
- [ ] **Step 5: Verify:** `curl -X POST localhost:3000/api/agent -d '{"messages":[{"role":"user","content":"show me the landing legs"}]}'` returns a `select_part` tool call with `part_id: "legs"`.
- [ ] **Step 6:** Commit `feat: agent route`.

### Task 4: Client loop + fallback

**Files:**
- Modify: `lib/agent/client.ts` (replace the 01 Task 5 placeholder body; same signature)
- Test: `lib/__tests__/fallback.test.ts`

**Interfaces — Produces:**
```ts
// Each round is one Grok call; 4 covers "select + explode + fly + answer" with margin.
// Arbitrary cap to bound latency and cost; raise only if real questions need more.
export const MAX_TOOL_ROUNDS = 4;
export function askAgent(text: string, history: ChatMessage[]): Promise<{ ok: boolean; reply: string; history: ChatMessage[] }>;  // replaces the 01 placeholder
export function fallbackIntent(text: string): { tool: ToolName; args: object } | null;
```
`askAgent`: POST `/api/agent`; for each `tool_calls` entry run `runTool` and append `{ role: "tool", tool_call_id, content: JSON.stringify(result) }`; repeat until a message has no tool calls or `MAX_TOOL_ROUNDS` is hit. Returns `ok: true` when Grok answered. On timeout or error (`ok: false`): run `fallbackIntent(text)` if it matches and reply "I couldn't reach Grok, but here's the <part name>." (or "...so I started the launch."); otherwise "I couldn't reach Grok. Try again."
`fallbackIntent` rules: `/launch|lift ?off/` → `start_replay` (first mission); `/tour/` → `start_tour`; a part name or id mentioned → `select_part`.

- [ ] **Step 1: Failing tests:** `F1 "launch it"` → `start_replay`; `F2 "show me the grid fins"` → `select_part` `gridfins`; `F3 "what's the weather"` → `null`.
- [ ] **Step 2:** fail → **Step 3:** implement → **Step 4:** pass.
- [ ] **Step 5:** Commit `feat: agent client loop with keyword fallback`.

### Task 5: Text box (test harness before voice)

**Files:**
- Create: `components/voice/AgentBox.tsx`

- [ ] **Step 1:** Input + Send → `askAgent` → show the reply and a small log of tool calls ("→ select_part legs").
- [ ] **Step 2: Verify:** "show me what lands back on Earth" → legs and booster selected, reply explains landing. "what if two engines fail?" → `set_engines_out` with two engines, reply mentions T/W 1.10.
- [ ] **Step 3:** Commit `feat: agent text box`.

### Task 6 (Sat): Grok celebrates and coaches

**Files:**
- Modify: `lib/agent/tools.ts`, `lib/agent/prompt.ts`
- Test: `lib/__tests__/tools.test.ts`

- [ ] **Step 1: Failing test** `A6 get_state includes the mission stars`: `endMission({ stars: 3, reasons: ["Feather-soft landing!"] })` → `runTool("get_state", {})` data has `missionStars.stars === 3`.
- [ ] **Step 2:** In `get_state`, add `missionStars: mission.stars` (the store keeps it; Neel's 07 sets it when the mission ends, so this needs nothing from Neel's code).
- [ ] **Step 3:** Add to the system prompt: "When the visitor finishes the guided mission, celebrate using `missionStars` and its reasons. Be warm and specific; only use numbers from the DATA."
- [ ] **Step 4:** `npm test` → pass. **Verify:** say "let's fly" → Grok calls `start_mission` and tells the visitor to lift the rocket off the pad.
- [ ] **Step 4b: Coaching.** Add to the system prompt: "A message starting with COACH: means a visitor is stuck at a checkpoint. Reply with ONE encouraging sentence of at most 12 words telling them how to move the rocket. No numbers, no tool calls." Verify: `askAgent("COACH: checkpoint=lean, target=a small tilt, tilt=70°, motion=0.2, still=0 ms, waited=16 s. Give the visitor ONE short kid-level hint.", [])` returns one short sentence with no digits.
- [ ] **Step 5:** Commit `feat: agent celebrates missions`.
