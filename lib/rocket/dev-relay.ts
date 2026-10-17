// lib/rocket/dev-relay.ts — tiny local WebSocket relay for two processes. Owner: Neel.
// Not used in production. The browser client speaks this protocol from lib/rocket/link.ts.
import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface DevRelay {
  port: number;
  url: string;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One room per channel name. A client joins with `{ t: "join", channel }`, then sends
 * `{ t: "m", payload }` envelopes. The server forwards each envelope to the other sockets
 * in that room. `port` 0 asks the OS for a free port (tests).
 */
export function startDevRelay(port = 0): Promise<DevRelay> {
  const rooms = new Map<string, Set<WebSocket>>();
  const http: Server = createServer();
  const wss = new WebSocketServer({ server: http });

  wss.on("connection", (socket) => {
    let channel: string | null = null;
    const leave = () => {
      if (!channel) return;
      const room = rooms.get(channel);
      room?.delete(socket);
      if (room && room.size === 0) rooms.delete(channel);
      channel = null;
    };
    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!isRecord(parsed)) return;
      if (parsed.t === "join" && typeof parsed.channel === "string" && parsed.channel.length > 0) {
        leave();
        channel = parsed.channel;
        const room = rooms.get(channel) ?? new Set<WebSocket>();
        room.add(socket);
        rooms.set(channel, room);
        socket.send(JSON.stringify({ t: "joined", channel }));
        return;
      }
      if (parsed.t === "m" && channel) {
        const outbound = JSON.stringify({ t: "m", payload: parsed.payload });
        for (const peer of Array.from(rooms.get(channel) ?? [])) {
          if (peer !== socket && peer.readyState === peer.OPEN) peer.send(outbound);
        }
      }
    });
    socket.on("close", leave);
  });

  return new Promise((resolve, reject) => {
    // ws re-emits the http server's listen error on the WebSocketServer; without a listener that throws and
    // kills the process instead of rejecting (EADDRINUSE when a relay is already running).
    wss.on("error", () => {});
    http.once("error", reject);
    http.listen(port, "127.0.0.1", () => {
      const address = http.address();
      const bound = typeof address === "object" && address ? address.port : port;
      resolve({
        port: bound,
        url: `ws://127.0.0.1:${bound}`,
        close: () => new Promise((done) => {
          for (const room of Array.from(rooms.values())) {
            for (const socket of Array.from(room)) socket.close();
          }
          wss.close();
          http.close(() => done());
        }),
      });
    });
  });
}
