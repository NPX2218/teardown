"use client";
import { useId } from "react";
import { useScene } from "@/lib/store";

export function ExplodeSlider() {
  const id = useId();
  const explode = useScene((s) => s.explode);
  const setExplode = useScene((s) => s.setExplode);
  const pct = Math.round(explode * 100);
  return (
    <div>
      <label htmlFor={id} className="tool-label">Explode</label>
      <div className="range">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-valuetext={`${pct} percent`}
          onChange={(e) => setExplode(Number(e.currentTarget.value) / 100)}
        />
        <output htmlFor={id} className="range__value">{pct}%</output>
      </div>
    </div>
  );
}
