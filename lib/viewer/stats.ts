import type { PartsFile } from "@/lib/types";

export interface VehicleStat { label: string; value: string; unit: string }

const fmt = (n: number): string => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

export function vehicleStats(v: PartsFile["vehicle"]): VehicleStat[] {
  return [
    { label: "Height", value: fmt(v.heightM), unit: "m" },
    { label: "Diameter", value: fmt(v.diameterM), unit: "m" },
    { label: "Liftoff mass", value: fmt(v.liftoffMassKg), unit: "kg" },
    { label: "Payload to low orbit", value: fmt(v.payloadLeoKg), unit: "kg" },
  ];
}
