import { explodeOffset } from "@/lib/explode";
import type { PartGroup } from "@/lib/types";
import type { PreparedModel } from "./prepareModel";

export function applyExplode(model: PreparedModel, groups: PartGroup[], amount: number): void {
  for (const part of groups) {
    for (const m of model.groups.get(part.id)?.members ?? []) {
      const o = explodeOffset(part.explode, m.dir, amount, model.H);
      m.node.position.set(m.home.x + o[0], m.home.y + o[1], m.home.z + o[2]);
    }
  }
}
