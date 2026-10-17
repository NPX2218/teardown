// lib/imagine/keys.ts — when the `I` shortcut (12 Task 1 Step 2) may fire. Pure, so it is unit-tested. Owner: Anders.

/** The few KeyboardEvent / target fields the gate reads, so tests can pass plain objects. */
export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  targetTag: string;
  targetType: string;
  targetEditable: boolean;
}

// Input types a visitor types words or numbers into. A range slider or checkbox is NOT typing.
const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel", "password", "number"];

/** True only for a plain `I`, not auto-repeat, not typing in a field, with a part selected and no overlay open. */
export function shouldImagineOnKey(e: KeyInfo, selectedId: string | null, overlayOpen: boolean): boolean {
  if (e.key.toLowerCase() !== "i" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return false;
  if (e.targetEditable || ["TEXTAREA", "SELECT"].includes(e.targetTag)) return false;
  if (e.targetTag === "INPUT" && (e.targetType === "" || TEXT_INPUT_TYPES.includes(e.targetType))) return false;
  return selectedId !== null && !overlayOpen;
}
