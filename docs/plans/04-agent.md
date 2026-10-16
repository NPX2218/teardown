# 04 · Grok Client + Agent Implementation Plan

> **For agentic workers (Cursor Agent):** implement one task at a time, run the tests, stop for review. Steps use `- [ ]` checkboxes.

**Goal:** Ask "show me what lands back on Earth" and Grok answers while calling scene functions that move the model.
**Architecture:** The server route only talks to Grok (it holds the key). The browser runs the tool calls against the store, sends results back, and loops until Grok gives a final answer. Tool definitions and their handlers live in **one file** so they can't drift apart.
**Tech Stack:** xAI API (OpenAI-compatible chat completions with function calling), Next.js route handlers, zustand, vitest.
**Spec:** planning doc §2 feature 1, §3 "Shared contract" rule.
**Owner:** B. **Needs:** 01, 02, and `lib/engines.ts` from 08 Task 1 (pure math, ~15 min). If A hasn't merged it yet, B implements 08 Task 1 exactly as written and tells A.

## Global Constraints
See `00-index.md`.

---

### Task 0: Confirm the API (curl, ~20 min)

- [ ] **Step 1:** With your key, call `POST https://api.x.ai/v1/chat/completions` with one simple tool (e.g. `get_time`) and a prompt that should use it. Record in `docs/xai-notes.md`: the text model id you'll use (→ `XAI_TEXT_MODEL`), whether `tool_calls` come back in OpenAI format, typical latency.
- [ ] **Step 2:** Same file: the Grok Voice and Grok Imagine endpoints, request/response formats, latency, rate limits (05 and 09 depend on these). Check xAI's docs at kickoff; don't guess.
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
                     | "start_replay" | "start_flight" | "set_engines_out" | "imagine";
export function runTool(name: string, args: unknown): Promise<ToolResult>;
```
| Tool | Args (JSON schema) | Calls |
|---|---|---|
| `get_state` | none | returns `{ selectedId, explode, replay, flight, enginesOut, liftoffTW, verdict, partIds, missionIds }` (Task 6 adds `flightScore`) |
| `select_part` | `part_id: string` (enum of part ids) | `selectPart`, then `flyTo` |
| `set_explode` | `amount: number` 0..1 | `setExplode` |
| `fly_to` | `target: string` (part id or `"home"`) | `flyTo` |
| `start_tour` | none | `startTour` |
| `start_replay` | `mission_id: string` (enum of `MISSIONS` keys) | `startReplay` |
| `start_flight` | `mission_id: string` (enum of `MISSIONS` keys) | `startFlight` ("fly it yourself": the judge flies with the prop) |
| `set_engines_out` | `engines: integer[]` (0 = center, 1–8 = ring) | `setEnginesOut` |
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
- Create: `lib/grok.ts`, `lib/timeout.ts`, `lib/agent/types.ts`
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

**Interfaces — Produces:** `buildSystemPrompt(parts: PartsFile, missions: Record<string, Mission>): string`.
Prompt contents: you are the narrator and operator of a 3D Falcon 9 teardown; use tools to show things while you explain; answer in 1–3 spoken sentences; **never state a number that is not in the DATA below; if the data doesn't cover it, say so**; then the DATA: the parts JSON and each mission's name, booster, landing and events.

- [ ] **Step 1: Failing tests:** `P1` prompt contains every part id and the string `never state a number that is not in the DATA`; `P2` prompt contains each mission's name.
- [ ] **Step 2:** fail → **Step 3:** implement. Route: `POST { messages }` → prepend the system prompt → `grokChat(messages, TOOLS)` → return the assistant message as JSON. On error return `502 { error }`. → **Step 4:** pass.
- [ ] **Step 5: Verify:** `curl -X POST localhost:3000/api/agent -d '{"messages":[{"role":"user","content":"show me the landing legs"}]}'` returns a `select_part` tool call with `part_id: "legs"`.
- [ ] **Step 6:** Commit `feat: agent route`.

### Task 4: Client loop + fallback

**Files:**
- Create: `lib/agent/client.ts`
- Test: `lib/__tests__/fallback.test.ts`

**Interfaces — Produces:**
```ts
// Each round is one Grok call; 4 covers "select + explode + fly + answer" with margin.
// Arbitrary cap to bound latency and cost; raise only if real questions need more.
export const MAX_TOOL_ROUNDS = 4;
export function askAgent(text: string, history: ChatMessage[]): Promise<{ reply: string; history: ChatMessage[] }>;
export function fallbackIntent(text: string): { tool: ToolName; args: object } | null;
```
`askAgent`: POST `/api/agent`; for each `tool_calls` entry run `runTool` and append `{ role: "tool", tool_call_id, content: JSON.stringify(result) }`; repeat until a message has no tool calls or `MAX_TOOL_ROUNDS` is hit. On timeout or error: run `fallbackIntent(text)` if it matches and reply "I couldn't reach Grok, but here's the <part name>." (or "...so I started the launch."); otherwise "I couldn't reach Grok. Try again."
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

### Task 6 (Sat, after 07 Task 5): Grok knows how the judge flew

**Files:**
- Modify: `lib/agent/tools.ts`, `lib/agent/prompt.ts`
- Test: `lib/__tests__/tools.test.ts`

- [ ] **Step 1: Failing test** `A6 get_state includes the flight score`: register a fixture mission, `startFlight(id)`, record `liftoff 0` and `landing 480` → `runTool("get_state", {})` data has `flightScore.summary` containing "30 s early".
- [ ] **Step 2:** In `get_state`, add `flightScore: scoreFlight(MISSIONS[flight.missionId], flight.achieved)` when `flight.missionId` is set, else `null`.
- [ ] **Step 3:** Add to the system prompt: "When the judge finishes a flight, compare their times with the real booster using `flightScore`. Be encouraging and specific; only use the numbers it contains."
- [ ] **Step 4:** `npm test` → pass. **Verify:** say "let me fly it" → Grok calls `start_flight` and tells the judge to lift the rocket.
- [ ] **Step 5:** Commit `feat: agent comments on flights`.
