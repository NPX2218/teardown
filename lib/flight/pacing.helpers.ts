import type { FlightWarp } from "@/lib/types";

/**
 * The 2026-10-17 presentation pacing request targets visible Earth curvature
 * within forty wall seconds while retaining a realistic-rate option.
 * Upright classroom benchmarks at full/70% power reached 200 km in
 * 30.35/40.70 wall seconds at 4× and 15.20/20.35 seconds at 8×.
 * Eight times therefore provides margin for a slower ascent and rendering.
 * This changes the clock only: existing fixed physics substeps and fuel stay
 * authoritative, while phone steering continues spending wall time.
 */
export const FLIGHT_PACING = { presentation: 8, realistic: 1 } as const satisfies Record<string, FlightWarp>;
