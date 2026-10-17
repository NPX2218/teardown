// lib/voice/rocket-port.ts — laptop/phone speech seam (Anders).
// Default is disconnected until Neel binds lib/rocket/commands.ts. Say then plays on the laptop.
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

const disconnected: RocketPort = {
  isRocketConnected: () => false,
  sendToRocket: () => {},
  onRocketMessage: () => () => {},
};

let port: RocketPort = disconnected;

export function bindRocketPort(next: RocketPort): void {
  port = next;
}

export function resetRocketPort(): void {
  port = disconnected;
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
