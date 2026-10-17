"use client";
// components/ui/PairSlot.tsx — fills the 01 slot with the pairing UI (11 Task 2). Owner: Neel. app/page.tsx never changes.
import { PairRocket } from "@/components/ui/PairRocket";

export function PairSlot() {
  return (
    <div data-slot="pair">
      <PairRocket />
    </div>
  );
}
