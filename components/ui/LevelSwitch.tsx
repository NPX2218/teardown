"use client";
import { motion } from "motion/react";
import { motionPresets } from "@/lib/ui/motion";
import { useScene } from "@/lib/store";
import { EXPLAIN_LEVELS, type ExplainLevel } from "@/lib/types";

const LABEL: Record<ExplainLevel, string> = { kid: "Kid", curious: "Curious", engineer: "Engineer" };

export function LevelSwitch() {
  const level = useScene((s) => s.level);
  return (
    <div className="seg seg--slide" role="group" aria-label="How should Grok explain things?">
      {EXPLAIN_LEVELS.map((l) => (
        <button key={l} type="button" aria-pressed={level === l} onClick={() => useScene.getState().setLevel(l)}>
          {level === l && <motion.span layoutId="level-pill" className="slide-pill" transition={motionPresets.out} aria-hidden="true" />}
          <span className="slide-label">{LABEL[l]}</span>
        </button>
      ))}
    </div>
  );
}
