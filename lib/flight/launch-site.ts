// Which pad the globe camera stands on. Free flight and practice use Cape.
// A Vandenberg or Sentinel-6 record uses SLC-4E. This does not edit mission files.
import { CAPE_SLC40, VSFB_SLC4E, type LaunchSiteSpec } from "@/lib/flight/scene-types";

const VANDENBERG = /vandenberg|slc-4e|vsfb|sentinel-6/i;

export function launchSiteFor(hint: {
  missionId?: string | null;
  launchSiteText?: string | null;
}): LaunchSiteSpec {
  const id = hint.missionId ?? "";
  const text = hint.launchSiteText ?? "";
  if (VANDENBERG.test(id) || VANDENBERG.test(text)) return VSFB_SLC4E;
  return CAPE_SLC40;
}
