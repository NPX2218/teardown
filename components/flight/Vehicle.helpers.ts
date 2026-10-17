import type { AppMode } from "@/lib/flight/app-mode";
import type { FlightStatus } from "@/lib/types";

/** Match phone control authority before applying the visual side lean. */
export function phoneOwnsVehicleAttitude(mode: AppMode, status: FlightStatus, pitchOwner: "local" | "phone", connected: boolean): boolean {
  return mode !== "explore" && status === "flying" && pitchOwner === "phone" && connected;
}
