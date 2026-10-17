// lib/parts-source.ts — bundled parts catalog. Owner: Neel.
// Validates the JSON at runtime so the store never needs `as unknown as PartsFile`.
// Placeholder until Anders PR #2. When data/parts/falcon9.json lands, the swap is this one line:
// import raw from "@/data/parts/falcon9.json";
import raw from "@/lib/fixtures/parts-falcon9.placeholder.json";
import type { PartGroup, PartsFile } from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") return null;
    out[key] = entry;
  }
  return out;
}

function partGroup(value: unknown): PartGroup | null {
  if (!isRecord(value)) return null;
  const { id, nodes, name, eyebrow, role, specs, explode, tourOrder, say, source } = value;
  if (typeof id !== "string" || id.length < 1) return null;
  if (!Array.isArray(nodes) || !nodes.every((node) => typeof node === "string")) return null;
  if (typeof name !== "string" || typeof eyebrow !== "string" || typeof role !== "string") return null;
  if (typeof say !== "string" || typeof source !== "string") return null;
  const specMap = stringMap(specs);
  if (!specMap || !isRecord(explode) || !finiteNumber(explode.up) || !finiteNumber(explode.radial)) return null;
  if (tourOrder !== null && !finiteNumber(tourOrder)) return null;
  return {
    id,
    nodes: nodes.slice(),
    name,
    eyebrow,
    role,
    specs: specMap,
    explode: { up: explode.up, radial: explode.radial },
    tourOrder,
    say,
    source,
  };
}

/** Returns a PartsFile built field by field, or null when the shape is wrong. Never throws. */
export function validatePartsShape(value: unknown): PartsFile | null {
  if (!isRecord(value)) return null;
  const { model, glb, vehicle, groups, glossary } = value;
  if (typeof model !== "string" || model.length < 1) return null;
  if (typeof glb !== "string" || glb.length < 1) return null;
  if (!isRecord(vehicle)) return null;
  const { heightM, diameterM, liftoffMassKg, payloadLeoKg, merlinThrustSlKN, merlinCount } = vehicle;
  if (
    !finiteNumber(heightM) ||
    !finiteNumber(diameterM) ||
    !finiteNumber(liftoffMassKg) ||
    !finiteNumber(payloadLeoKg) ||
    !finiteNumber(merlinThrustSlKN) ||
    !finiteNumber(merlinCount)
  ) {
    return null;
  }
  if (!Array.isArray(groups)) return null;
  const parsed: PartGroup[] = [];
  for (const group of groups) {
    const next = partGroup(group);
    if (!next) return null;
    parsed.push(next);
  }
  const glossaryMap = stringMap(glossary);
  if (!glossaryMap) return null;
  return {
    model,
    glb,
    vehicle: { heightM, diameterM, liftoffMassKg, payloadLeoKg, merlinThrustSlKN, merlinCount },
    groups: parsed,
    glossary: glossaryMap,
  };
}

/**
 * The catalog bundled with this build. Reads the imported JSON only — no fetch —
 * so it is safe at build time while data/parts/falcon9.json is still unmerged.
 */
export function loadParts(): PartsFile | null {
  return validatePartsShape(raw);
}

/** Hands the bundled catalog to the store. No-op (returns false) when the file is the wrong shape. */
export function installBundledParts(setParts: (parts: PartsFile) => void): boolean {
  const parts = loadParts();
  if (!parts) return false;
  setParts(parts);
  return true;
}
