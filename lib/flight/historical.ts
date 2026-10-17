// lib/flight/historical.ts — structural contract for mission records (06 scope, 07 §2).
// Owner: Neel. Anders owns the Sentinel-6 values. This check does not invent
// missing Max-Q, burn, or landing times, and it does not build a trajectory.
import { isLandingKind, isMissionEventId, isMissionEventPrecision, isMissionKind } from "@/lib/types";

const URL_RE = /^https?:\/\/\S+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GROUPED_IDS = new Set(["staging", "orbit_and_return"]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Empty array means the record matches the shared historical/practice contract. */
export function validateMissionRecord(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ["mission must be an object"];

  const id = typeof input.id === "string" ? input.id : "";
  if (id.trim() === "") errors.push("id must be a nonempty string");
  if (typeof input.name !== "string" || input.name.trim() === "") errors.push("name must be a nonempty string");
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) errors.push("date must be YYYY-MM-DD");
  if (typeof input.source !== "string" || !URL_RE.test(input.source)) errors.push("source must be an http(s) URL");
  if (!isLandingKind(input.landing)) errors.push("landing is not a known kind");
  if (input.continuousTelemetry === true) errors.push("continuous telemetry is not part of this contract");

  if (input.booster !== null && input.booster !== undefined) {
    if (!isRecord(input.booster) || typeof input.booster.serial !== "string" || input.booster.serial.trim() === "") {
      errors.push("booster.serial must be a nonempty string or booster must be null");
    }
    const flight = isRecord(input.booster) ? input.booster.flight : undefined;
    if (typeof flight !== "number" || !Number.isInteger(flight) || flight < 1) {
      errors.push("booster.flight must be a positive integer");
    }
  }

  const seen = new Set<string>();
  let previous = -1;
  if (!Array.isArray(input.events) || input.events.length === 0) {
    errors.push("events must be a nonempty list");
  } else {
    input.events.forEach((event, index) => {
      const path = `events[${index}]`;
      if (!isRecord(event)) {
        errors.push(`${path} must be an object`);
        return;
      }
      if (typeof event.t !== "number" || !Number.isFinite(event.t) || event.t < 0) {
        errors.push(`${path}.t must be a finite nonnegative number`);
      } else if (event.t < previous) {
        errors.push("events are not in time order");
      } else {
        previous = event.t;
      }
      if (!isMissionEventId(event.id)) errors.push(`${path}.id is not a known event`);
      else if (seen.has(event.id)) errors.push(`${path}.id is duplicated`);
      else seen.add(event.id);
      if (typeof event.say !== "string" || event.say.trim() === "") errors.push(`${path}.say must be a nonempty string`);
    });
  }

  const kind = input.kind;
  if (kind !== undefined && !isMissionKind(kind)) errors.push("kind is not historical or practice");
  const practice = id === "practice" || kind === "practice";
  if (!practice && kind !== "historical") errors.push("kind is required");

  if (practice) {
    if (kind !== undefined && kind !== "practice") errors.push("practice kind does not match id practice");
    const serial = isRecord(input.booster) ? input.booster.serial : undefined;
    if (serial !== "SAMPLE") errors.push('practice booster.serial must be "SAMPLE"');
    if (typeof input.label === "string" && input.label.includes("Real mission")) {
      errors.push("practice must not use the real-mission label");
    }
  }

  if (kind === "historical") {
    if (typeof input.label !== "string" || !input.label.includes("Real mission") || !input.label.includes("approximate")) {
      errors.push('label must say it is a real mission with approximate milestones');
    }
    if (input.continuousTelemetry !== false) errors.push("historical continuousTelemetry must be false");
    const serial = isRecord(input.booster) ? input.booster.serial : undefined;
    if (serial === "SAMPLE") errors.push("historical booster.serial must not be SAMPLE");
    if (Array.isArray(input.events)) {
      input.events.forEach((event, index) => {
        if (!isRecord(event)) return;
        const path = `events[${index}]`;
        if (!isMissionEventPrecision(event.precision)) errors.push(`${path}.precision is required`);
        const sources = event.sources;
        const urls = Array.isArray(sources)
          ? sources.filter((source) => isRecord(source) && typeof source.url === "string" && URL_RE.test(source.url))
          : [];
        if (urls.length === 0) errors.push(`${path}.sources must include an http(s) URL`);
        if (typeof event.id === "string" && GROUPED_IDS.has(event.id) && event.grouped !== true) {
          errors.push(`${path}.grouped is required for this milestone`);
        }
      });
    }
  }

  return errors;
}
