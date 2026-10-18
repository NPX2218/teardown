import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as sessionPost } from "@/app/api/voice/session/route";
import { askAgent, resetAgentForTests } from "@/lib/agent/client";
import { getScene, resetScene } from "@/lib/agent/scene";
import { EXPLAIN_LEVELS } from "@/lib/types";
import {
  runRealtimeGuideSession,
  startMascotVoice,
  VoiceUnavailable,
} from "@/lib/voice/realtime-guide";
import { CLIENT_SECRETS_URL, realtimeUrl, type RealtimeConnectors } from "@/lib/voice/realtime";

const savedKey = process.env.XAI_API_KEY;

afterEach(() => {
  if (savedKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = savedKey;
  vi.unstubAllGlobals();
  resetScene();
  resetAgentForTests();
});

const reply = (message: object, status = 200) =>
  new Response(JSON.stringify(message), { status, headers: { "Content-Type": "application/json" } });

const toolCall = (id: string, name: string, args: object) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
});

function scriptedSocket(script: (sent: string[]) => AsyncIterable<string>) {
  const sent: string[] = [];
  let url = "";
  let protocols: string[] = [];
  const connect: RealtimeConnectors["connect"] = (nextUrl, nextProtocols) => {
    url = nextUrl;
    protocols = [...nextProtocols];
    return {
      socket: {
        send: (data) => sent.push(data),
        close() {},
      },
      messages: script(sent),
    };
  };
  return { connect, sent, url: () => url, protocols: () => protocols };
}

describe("voice demo tools", () => {
  it("missing key: session route stays quiet and the Voice button does not open a socket", async () => {
    delete process.env.XAI_API_KEY;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const res = await sessionPost();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Voice is not set up on this server." });
    expect(upstream).not.toHaveBeenCalled();

    const connect = vi.fn();
    const captureMic = vi.fn();
    await expect(startMascotVoice({
      signal: new AbortController().signal,
      connect,
      captureMic,
      fetcher: async () => reply({ error: "Voice is not set up on this server." }, 503),
    })).rejects.toThrow("Voice is not set up on this server.");
    expect(connect).not.toHaveBeenCalled();
    expect(captureMic).not.toHaveBeenCalled();
  });

  it("token route then a fake socket runs start_tour and hands off to the tour", async () => {
    process.env.XAI_API_KEY = "voice-test-key";
    const upstream = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(CLIENT_SECRETS_URL);
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer voice-test-key");
      expect(JSON.parse(String(init?.body))).toEqual({ expires_after: { seconds: 300 } });
      return reply({ value: "ephemeral", expires_at: 10 });
    });
    vi.stubGlobal("fetch", upstream);
    const minted = await sessionPost();
    expect(minted.status).toBe(200);
    const token = (await minted.json() as { value: string }).value;
    expect(token).toBe("ephemeral");

    const socket = scriptedSocket(async function* () {
      yield JSON.stringify({
        type: "response.function_call_arguments.done",
        name: "start_tour",
        call_id: "call-tour",
        arguments: "{}",
      });
    });

    await runRealtimeGuideSession({ token, connect: socket.connect });
    expect(socket.url()).toBe(realtimeUrl());
    expect(socket.protocols()).toEqual(["xai-client-secret.ephemeral"]);
    const update = JSON.parse(socket.sent[0]) as {
      type: string;
      session: { tools: { type: string; name: string; function?: unknown }[]; turn_detection: { type: string } };
    };
    expect(update.type).toBe("session.update");
    expect(update.session.turn_detection).toEqual({ type: "server_vad" });
    expect(update.session.tools.map((tool) => tool.name).sort()).toEqual(["set_level", "start_tour"]);
    expect(update.session.tools.every((tool) => tool.type === "function" && tool.function === undefined)).toBe(true);
    expect(JSON.stringify(update)).not.toContain("start_mission");
    expect(getScene().tour.active).toBe(true);
    expect(getScene().explode).toBe(1);
  });

  it("set_level reaches kid, curious, and engineer and each output goes back", async () => {
    const socket = scriptedSocket(async function* (sent) {
      for (const level of EXPLAIN_LEVELS) {
        yield JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "set_level",
          call_id: `call-${level}`,
          arguments: JSON.stringify({ level }),
        });
        expect(getScene().level).toBe(level);
        yield JSON.stringify({ type: "response.done" });
        const events = sent.map((line) => JSON.parse(line));
        const output = events.find((event) => event?.item?.call_id === `call-${level}`);
        expect(output.item.type).toBe("function_call_output");
        expect(JSON.parse(output.item.output)).toEqual({ ok: true });
        expect(events.at(-1)).toEqual({ type: "response.create" });
      }
    });
    await runRealtimeGuideSession({ token: "ephemeral", connect: socket.connect });
    expect(getScene().level).toBe("engineer");
  });

  it("a socket that closes after the call still returns the tool output", async () => {
    const socket = scriptedSocket(async function* () {
      yield JSON.stringify({
        type: "response.function_call_arguments.done",
        name: "set_level",
        call_id: "call-end",
        arguments: JSON.stringify({ level: "curious" }),
      });
    });
    await runRealtimeGuideSession({ token: "ephemeral", connect: socket.connect });
    const events = socket.sent.map((line) => JSON.parse(line));
    const output = events.find((event) => event?.item?.type === "function_call_output");
    expect(output.item.call_id).toBe("call-end");
    expect(JSON.parse(output.item.output).ok).toBe(true);
    expect(events.at(-1)).toEqual({ type: "response.create" });
    expect(getScene().level).toBe("curious");
  });

  // REGRESSION GUARD (2026-10-18): voice "start the tour" played Grok's reply over the cached tour lines,
  // and the open mic heard the tour and answered it. A started tour must end the voice session.
  it("H1: start_tour hands off to the tour: no tool output, no follow-up reply, later events ignored", async () => {
    let resumed = false;
    const socket = scriptedSocket(async function* () {
      yield JSON.stringify({
        type: "response.function_call_arguments.done",
        name: "start_tour",
        call_id: "call-handoff",
        arguments: "{}",
      });
      resumed = true;
      yield JSON.stringify({ type: "response.done" });
    });
    await runRealtimeGuideSession({ token: "ephemeral", connect: socket.connect });
    const events = socket.sent.map((line) => JSON.parse(line));
    expect(getScene().tour.active).toBe(true);
    expect(events.some((event) => event?.item?.type === "function_call_output")).toBe(false);
    expect(events.some((event) => event?.type === "response.create")).toBe(false);
    expect(resumed).toBe(false);
  });

  it("text path runs start_tour and each set_level from mocked tool calls", async () => {
    const tourFetch = vi.fn()
      .mockResolvedValueOnce(reply(toolCall("tour-1", "start_tour", {})))
      .mockResolvedValueOnce(reply({ role: "assistant", content: "Tour started." }));
    vi.stubGlobal("fetch", tourFetch);
    const tour = await askAgent("Give me a tour", []);
    expect(tour.reply).toBe("Tour started.");
    expect(getScene().tour.active).toBe(true);
    const tourBody = JSON.parse(String((tourFetch.mock.calls[1] as [string, RequestInit])[1].body));
    const tourTool = tourBody.messages.find((message: { role: string }) => message.role === "tool");
    expect(tourTool.tool_call_id).toBe("tour-1");
    expect(JSON.parse(tourTool.content).ok).toBe(true);
    expect(tourFetch.mock.calls[0][0]).toBe("/api/agent");

    for (const level of EXPLAIN_LEVELS) {
      resetScene();
      resetAgentForTests();
      const levelFetch = vi.fn()
        .mockResolvedValueOnce(reply(toolCall(`level-${level}`, "set_level", { level })))
        .mockResolvedValueOnce(reply({ role: "assistant", content: `Level ${level}.` }));
      vi.stubGlobal("fetch", levelFetch);
      const result = await askAgent("change the level", []);
      expect(getScene().level).toBe(level);
      expect(result.reply).toBe(`Level ${level}.`);
      const body = JSON.parse(String((levelFetch.mock.calls[1] as [string, RequestInit])[1].body));
      const tool = body.messages.find((message: { role: string }) => message.role === "tool");
      expect(tool.tool_call_id).toBe(`level-${level}`);
      expect(JSON.parse(tool.content)).toEqual({ ok: true });
    }
  });

  it("text path with no key falls back to the tour and does not throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "grok unavailable" }, 502)));
    const result = await askAgent("Give me a tour", []);
    expect(result.ok).toBe(false);
    expect(result.reply).toBe("I couldn't reach Grok, so I started the tour.");
    expect(getScene().tour.active).toBe(true);
  });

  it("a failed token fetch is a VoiceUnavailable and does not connect", async () => {
    const connect = vi.fn();
    await expect(startMascotVoice({
      signal: new AbortController().signal,
      connect,
      captureMic: () => undefined,
      fetcher: async () => { throw new TypeError("offline"); },
    })).rejects.toBeInstanceOf(VoiceUnavailable);
    expect(connect).not.toHaveBeenCalled();
  });
});
