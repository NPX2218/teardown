// lib/flight/scenario.ts — structural validation for flight presets (07 §6).
// Owner: Neel. Anders fills data/flight with sourced values. This rejects
// malformed presets; it does not judge whether a sourced number is true.
import type { FlightScenario } from "@/lib/types";
import { VALUE_CLASSIFICATIONS } from "@/lib/types";

const CLASSES = new Set<string>(VALUE_CLASSIFICATIONS);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function readClassified(value: unknown, path: string, errors: string[], positive = false): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be a classified number`);
    return;
  }
  const amount = value.value;
  const finite = typeof amount === "number" && Number.isFinite(amount);
  if (!finite || amount < 0 || (positive && amount <= 0)) {
    errors.push(`${path}.value must be a finite ${positive ? "positive" : "nonnegative"} number`);
  }
  if (typeof value.unit !== "string" || value.unit.trim() === "") errors.push(`${path}.unit must be a unit`);
  if (typeof value.classification !== "string" || !CLASSES.has(value.classification)) {
    errors.push(`${path}.classification is not a known class`);
  }
  if (typeof value.source !== "string" || value.source.trim() === "") {
    errors.push(`${path}.source must name where the number comes from`);
  }
}

function readRange(value: unknown, path: string, errors: string[]): { min: number; max: number } | null {
  if (!isRecord(value) || typeof value.min !== "number" || typeof value.max !== "number") {
    errors.push(`${path} must be a min and max`);
    return null;
  }
  if (!Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min) {
    errors.push(`${path} must be a finite nonnegative range`);
    return null;
  }
  return { min: value.min, max: value.max };
}

/** Empty array means the preset is safe to register. */
export function validateFlightScenario(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ["scenario must be an object"];
  if (typeof input.id !== "string" || input.id.trim() === "") errors.push("id must be a nonempty string");
  if (typeof input.name !== "string" || input.name.trim() === "") errors.push("name must be a nonempty string");
  if (input.kind !== "historical-reference" && input.kind !== "custom") {
    errors.push("kind must be historical-reference or custom");
  } else if (input.kind === "historical-reference") {
    if (typeof input.historicalMissionId !== "string" || input.historicalMissionId.trim() === "") {
      errors.push("historicalMissionId is required for a historical reference");
    }
  } else if (input.historicalMissionId !== null) {
    errors.push("custom scenarios must set historicalMissionId to null");
  }

  readClassified(input.payloadKg, "payloadKg", errors);
  const payload = isRecord(input.payloadKg) && typeof input.payloadKg.value === "number" ? input.payloadKg.value : null;

  if (!Array.isArray(input.stages) || input.stages.length === 0) {
    errors.push("stages must list at least one stage");
  } else {
    const seen = new Set<string>();
    input.stages.forEach((stage, index) => {
      const path = `stages[${index}]`;
      if (!isRecord(stage) || typeof stage.id !== "string" || stage.id.trim() === "") {
        errors.push(`${path}.id must be a nonempty string`);
        return;
      }
      if (seen.has(stage.id)) errors.push(`${path}.id is duplicated`);
      seen.add(stage.id);
      readClassified(stage.dryMassKg, `${path}.dryMassKg`, errors);
      readClassified(stage.propellantKg, `${path}.propellantKg`, errors);
      readClassified(stage.oxidizerToFuelRatio, `${path}.oxidizerToFuelRatio`, errors, true);
      readClassified(stage.thrustN, `${path}.thrustN`, errors);
      readClassified(stage.propellantFlowKgPerS, `${path}.propellantFlowKgPerS`, errors);
    });
  }

  if (!isRecord(input.objective)) {
    errors.push("objective must be an object");
  } else {
    const min = input.objective.minPeriapsisAltitudeM;
    const max = input.objective.maxApoapsisAltitudeM;
    const coast = input.objective.thrustOffS;
    if (typeof min !== "number" || !Number.isFinite(min) || min < 0) {
      errors.push("objective.minPeriapsisAltitudeM must be a finite nonnegative number");
    }
    if (typeof max !== "number" || !Number.isFinite(max) || typeof min !== "number" || !(max > min)) {
      errors.push("objective.maxApoapsisAltitudeM must be greater than periapsis");
    }
    if (typeof coast !== "number" || !Number.isFinite(coast) || coast <= 0) {
      errors.push("objective.thrustOffS must be a finite positive number");
    }
    if (input.objective.classification !== "gameplay-tuning") {
      errors.push("objective.classification must be gameplay-tuning");
    }
    if (typeof input.objective.source !== "string" || input.objective.source.trim() === "") {
      errors.push("objective.source must name the tuning note");
    }
  }

  if (input.bounds !== undefined) {
    if (!isRecord(input.bounds)) {
      errors.push("bounds must be an object");
    } else {
      if (input.bounds.payloadKg !== undefined) {
        const range = readRange(input.bounds.payloadKg, "bounds.payloadKg", errors);
        if (range && payload !== null && Number.isFinite(payload) && (payload < range.min || payload > range.max)) {
          errors.push("payloadKg.value is outside bounds.payloadKg");
        }
      }
      if (input.bounds.propellantScale !== undefined) {
        readRange(input.bounds.propellantScale, "bounds.propellantScale", errors);
      }
    }
  }

  return errors;
}

export function isFlightScenario(input: unknown): input is FlightScenario {
  return validateFlightScenario(input).length === 0;
}
