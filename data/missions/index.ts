// data/missions/index.ts — every mission the app knows (01 Task 5 registers `practice`).
// Owner: Anders (06 adds the real mission). The store reads ids from here.
// `practice` is an explicit sample. It is not a real-flight result and must not be the silent default.
import type { Mission } from "@/lib/types";
import practice from "./practice.json";

export const MISSIONS: Record<string, Mission> = {
  practice: practice as unknown as Mission,
};
