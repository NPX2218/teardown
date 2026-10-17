import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASK_DEADLINE_MS,
  askAgent,
  cancelAgent,
  CLIENT_ROUND_TIMEOUT_MS,
  fallbackIntent,
  MAX_TOOL_ROUNDS,
  resetAgentForTests,
} from "@/lib/agent/client";
import type { ChatMessage } from "@/lib/agent/types";
import { MISSIONS } from "@/lib/agent/fixtures/exhibit";
import { LINES } from "@/lib/voice/lines";
import { getScene, resetScene } from "@/lib/agent/scene";

beforeEach(() => {
  resetScene();
  resetAgentForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const s = () => getScene();
const reply = (message: object) => new Response(JSON.stringify(message), { status: 200 });
const toolCall = (id: string, name: string, args: object) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

describe("fallbackIntent (04 Task 4)", () => {
  it("F14 Let's fly opens the briefing, not a physics launch", () => {
    expect(fallbackIntent("Let's fly!")).toEqual({ tool: "start_mission", args: {} });
    expect(fallbackIntent("Why do rockets fly?")).toBeNull();
  });

  it("F1 launch it starts historical replay", () => {
    const ids = Object.keys(MISSIONS);
    const expected = ids.find((id) => id !== "practice") ?? "practice";
    expect(fallbackIntent("launch it")).toEqual({ tool: "start_replay", args: { mission_id: expected } });
    expect(fallbackIntent("Lift off!")?.tool).toBe("start_replay");
  });

  it("F2 show me the grid fins selects that part", () => {
    expect(fallbackIntent("show me the grid fins")).toEqual({ tool: "select_part", args: { part_id: "gridfins" } });
    expect(fallbackIntent("where are the LEGS?")).toEqual({ tool: "select_part", args: { part_id: "legs" } });
    expect(fallbackIntent("take the tour")).toEqual({ tool: "start_tour", args: {} });
  });

  it("F3 weather matches nothing", () => {
    expect(fallbackIntent("what's the weather")).toBeNull();
    expect(fallbackIntent("resources")).toBeNull();
  });

  it("F3b questions only select parts", () => {
    expect(fallbackIntent("what is a launch pad?")).toBeNull();
    expect(fallbackIntent("Why do the landing legs fold?")).toEqual({ tool: "select_part", args: { part_id: "legs" } });
    expect(fallbackIntent("how long is the tour")).toBeNull();
    expect(fallbackIntent("show me a grid fin")).toEqual({ tool: "select_part", args: { part_id: "gridfins" } });
  });
});

describe("askAgent (04 Task 4)", () => {
  it("F4 retired coach text never calls the network or starts a replay", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askAgent("COACH: checkpoint=liftoff, target=lift it up, tilt=3°.", []);
    expect(r.ok).toBe(false);
    expect(r.reply).toBe("Checkpoint hints are not part of this exhibit.");
    expect(r.history).toEqual([]);
    expect(s().replay.missionId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F5 tool call, then an answer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(toolCall("c1", "select_part", { part_id: "legs" })))
      .mockResolvedValueOnce(reply({ role: "assistant", content: "These are the landing legs!" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askAgent("show me what lands back on Earth", []);
    expect(r.ok).toBe(true);
    expect(r.reply).toBe("These are the landing legs!");
    expect(s().selectedId).toBe("legs");
    expect(r.history.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    const sent = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string) as { messages: ChatMessage[]; level: string };
    expect(sent.level).toBe("kid");
    expect(sent.messages).toHaveLength(3);
  });

  it("F6 Grok down uses keywords and leaves history unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const history: ChatMessage[] = [{ role: "user", content: "hi" }, { role: "assistant", content: "Hello!" }];
    const r = await askAgent("show me the grid fins", history);
    expect(r).toEqual({ ok: false, reply: "I couldn't reach Grok, but here are the grid fins.", history });
    expect(s().selectedId).toBe("gridfins");

    const r2 = await askAgent("what's the weather", []);
    expect(r2.reply).toBe(LINES.cantReachGrok);
    const r3 = await askAgent("launch it", []);
    expect(r3.reply).toBe("I couldn't reach Grok, so I started the launch.");
    expect(s().replay.missionId).toBe(Object.keys(MISSIONS).find((id) => id !== "practice") ?? "practice");

    resetScene();
    const r4 = await askAgent("Let's fly!", []);
    expect(r4.reply).toBe("I couldn't reach Grok, so I opened the flight briefing.");
    expect(s().flight.status).toBe("ready");
    expect(s().flight.outcome).toBeNull();
  });

  it("F7 stops after MAX_TOOL_ROUNDS", async () => {
    let n = 0;
    const fetchMock = vi.fn(() => Promise.resolve(reply(toolCall(`c${++n}`, "set_explode", { amount: 1 }))));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askAgent("pull it apart", []);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(r).toMatchObject({ ok: true, reply: "Take a look!" });
    expect(s().explode).toBe(1);
  });

  it("F8 empty text never calls the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await askAgent("   ", [])).toEqual({ ok: false, reply: "I didn't catch that. Try again.", history: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F9 a hung request times out and is aborted", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    const p = askAgent("why nine engines?", []);
    await vi.advanceTimersByTimeAsync(CLIENT_ROUND_TIMEOUT_MS);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(signal?.aborted).toBe(true);
  });

  it("F10 a server error and a junk reply both fall back", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "grok unavailable" }), { status: 502 }))));
    expect((await askAgent("start the tour", [])).reply).toBe("I couldn't reach Grok, so I started the tour.");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply({ error: "nope" }))));
    expect((await askAgent("hello", [])).ok).toBe(false);
  });

  it("F11 Grok fails after a tool already ran, so keywords do not fire", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(toolCall("c1", "start_tour", {})))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const r = await askAgent("launch it", []);
    expect(r.reply).toBe(LINES.cantReachGrok);
    expect(s().tour.active).toBe(true);
    expect(s().replay.missionId).toBeNull();
  });

  it("F12 the whole question has a deadline", async () => {
    vi.useFakeTimers();
    let n = 0;
    const fetchMock = vi.fn(() => new Promise<Response>((res) =>
      setTimeout(() => res(reply(toolCall(`c${++n}`, "set_explode", { amount: 1 }))), 8000)));
    vi.stubGlobal("fetch", fetchMock);
    const p = askAgent("pull it apart", []);
    await vi.advanceTimersByTimeAsync(ASK_DEADLINE_MS);
    const r = await p;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ok: false, reply: LINES.cantReachGrok });
  });

  it("F13 cancelAgent drops an answer before it touches the scene", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((res) => { release = res; })));
    const p = askAgent("show me the legs", []);
    await Promise.resolve();
    cancelAgent();
    release(reply(toolCall("c1", "select_part", { part_id: "legs" })));
    expect(await p).toEqual({ ok: false, reply: "", history: [] });
    expect(s().selectedId).toBeNull();
  });

  it("F12b deadline after Grok already spoke keeps that answer", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ ...toolCall("c1", "select_part", { part_id: "legs" }), content: "Here are the legs!" }))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const p = askAgent("show me the legs", []);
    await vi.advanceTimersByTimeAsync(CLIENT_ROUND_TIMEOUT_MS);
    expect(await p).toMatchObject({ ok: true, reply: "Here are the legs!" });
    expect(s().selectedId).toBe("legs");
  });
});
