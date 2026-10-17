// lib/voice/rocket-port.ts — laptop/phone speech seam (Anders).
// The default port is Neel's lib/rocket/commands.ts. Its placeholder body stays
// disconnected, so a line still plays on the laptop until the phone link is real.
import {
  isRocketConnected as commandsConnected,
  onRocketMessage as commandsOnMessage,
  sendToRocket as commandsSend,
} from "@/lib/rocket/commands";
import type { RocketMessage as SharedRocketMessage } from "@/lib/types";
import type { ListenErrorReason } from "@/lib/voice/errors";
import type { SoundId } from "@/lib/voice/sound-ids";

export type RocketMessage =
  | { k: "say"; id: string; cacheKey: string; text: string }
  | { k: "stopSay"; id?: string }
  | { k: "said"; id: string }
  | { k: "listen" }
  | { k: "stopListen" }
  | { k: "heard"; text: string }
  | { k: "listenError"; reason: ListenErrorReason }
  | { k: "sound"; id: SoundId; loop?: boolean }
  | { k: "stop"; id?: SoundId };

export interface RocketPort {
  isRocketConnected(): boolean;
  sendToRocket(message: RocketMessage): void;
  onRocketMessage(kind: RocketMessage["k"], fn: (message: RocketMessage) => void): () => void;
}

const commandsPort: RocketPort = {
  isRocketConnected: () => commandsConnected(),
  sendToRocket: (message) => {
    commandsSend(message as SharedRocketMessage);
  },
  onRocketMessage: (kind, fn) =>
    commandsOnMessage(kind, (message) => {
      if (message.k === kind) fn(message as RocketMessage);
    }),
};

let port: RocketPort = commandsPort;

export function bindRocketPort(next: RocketPort): void {
  port = next;
}

export function resetRocketPort(): void {
  port = commandsPort;
}

export function isRocketConnected(): boolean {
  return port.isRocketConnected();
}

export function sendToRocket(message: RocketMessage): void {
  port.sendToRocket(message);
}

export function onRocketMessage(kind: RocketMessage["k"], fn: (message: RocketMessage) => void): () => void {
  return port.onRocketMessage(kind, fn);
}
