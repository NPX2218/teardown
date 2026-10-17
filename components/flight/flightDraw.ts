import type { FlightDraw } from "@/lib/flight/flight-pose";

/** Latest draw sample. The camera reads it every frame; React props update more slowly. */
export const flightDrawNow: { current: FlightDraw | null } = { current: null };
