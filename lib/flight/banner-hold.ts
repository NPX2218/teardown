// The red drift warning is only five simulated seconds. At 4× that is a little
// over a second of wall time, which a screenshot of the caution banner can
// spend. Keep the warning readable after the sim has already failed.

import type { WarningLevel } from "@/lib/types";

export const WARNING_READ_MS = 4000;

export interface BannerHold {
  text: string;
  untilMs: number;
}

export interface PresentedBanner {
  banner: string | null;
  warningLevel: WarningLevel;
  hold: BannerHold | null;
}

/**
 * While the corridor is in the red warning, remember that sentence.
 * After the run fails, keep showing it until `WARNING_READ_MS` has passed
 * since the last warning sample, then show the failure.
 */
export function presentDriftBanner(
  live: { banner: string | null; warningLevel: WarningLevel },
  hold: BannerHold | null,
  nowMs: number,
  holdMs = WARNING_READ_MS,
): PresentedBanner {
  if (live.warningLevel === "warning" && live.banner) {
    return {
      banner: live.banner,
      warningLevel: "warning",
      hold: { text: live.banner, untilMs: nowMs + holdMs },
    };
  }
  if (hold && nowMs < hold.untilMs) {
    return { banner: hold.text, warningLevel: "warning", hold };
  }
  return { banner: live.banner, warningLevel: live.warningLevel, hold: null };
}
