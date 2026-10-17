// lib/voice/realtime-connect.ts — default browser/server WebSocket adapter. Owner: Anders.
// Uses the protocol list, not an Authorization header, so the API key is not required on the socket.
import { type RealtimeConnectors } from "@/lib/voice/realtime";

export const defaultRealtimeConnect: RealtimeConnectors["connect"] = (url, protocols) => {
  if (typeof WebSocket === "undefined") throw new Error("no websocket");
  const ws = new WebSocket(url, protocols);
  const queue: string[] = [];
  let waiter: ((value: IteratorResult<string>) => void) | null = null;
  let closed = false;
  const push = (value: string) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value, done: false });
    } else queue.push(value);
  };
  ws.addEventListener("message", (ev: MessageEvent) => {
    if (typeof ev.data === "string") push(ev.data);
  });
  const finish = () => {
    closed = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value: undefined as unknown as string, done: true });
    }
  };
  ws.addEventListener("close", finish);
  ws.addEventListener("error", finish);
  const messages: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<string>> {
          if (queue.length > 0) return Promise.resolve({ value: queue.shift() as string, done: false });
          if (closed) return Promise.resolve({ value: undefined as unknown as string, done: true });
          return new Promise((resolve) => {
            waiter = resolve;
          });
        },
      };
    },
  };
  return {
    socket: {
      send(data: string) { ws.send(data); },
      close() { ws.close(); },
    },
    messages,
  };
};
