import type { FlightReadout, FlightStatus, StageFuelSnapshot } from "@/lib/types";

export function formatKm(metres: number | null): string {
  if (metres === null || !Number.isFinite(metres)) return "—";
  if (metres < 0) return "hits the ground";
  const km = metres / 1000;
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 10) return `${km.toFixed(1)} km`;
  return `${km.toFixed(2)} km`;
}

export function formatSpeed(mps: number | null): string {
  if (mps === null || !Number.isFinite(mps)) return "—";
  const km = mps / 1000;
  const sign = km < 0 ? "−" : "";
  return `${sign}${Math.abs(km).toFixed(2)} km/s`;
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const t = Math.max(0, seconds);
  const minutes = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function stageLabel(id: string): string {
  if (id === "booster" || id === "stage1") return "First stage";
  if (id === "upper" || id === "stage2") return "Second stage";
  return "Stage";
}

export function fuelPercent(remainingKg: number, stages: StageFuelSnapshot[]): number {
  const consumed = stages.reduce((sum, stage) => sum + stage.rp1ConsumedKg + stage.loxConsumedKg, 0);
  const total = remainingKg + consumed;
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, (remainingKg / total) * 100));
}

export function goalLine(readout: FlightReadout | null): string {
  if (!readout || readout.periapsisAltitudeM === null || readout.apoapsisAltitudeM === null) {
    return "Not a closed path yet.";
  }
  if (readout.periapsisAltitudeM < 200_000) return "The lowest point is still too low.";
  if (readout.apoapsisAltitudeM > 2_000_000) return "The highest point is above the goal.";
  return "The path is inside the goal. Coast with the engines off for 10 seconds.";
}

export function hudFuelNotice(readout: FlightReadout | null, status: FlightStatus): string | null {
  if (!readout || (status !== "flying" && status !== "paused")) return null;
  if (readout.propellantRemainingKg > 1) return null;
  if (readout.periapsisAltitudeM === null || readout.periapsisAltitudeM < 200_000) {
    return "Out of fuel — your path returns to Earth.";
  }
  return null;
}
