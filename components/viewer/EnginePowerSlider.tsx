"use client";
import { useId } from "react";
import { enginePercent, enginePowerFromPercent } from "@/lib/rocket/engine-power";
import { useScene } from "@/lib/store";

export function EnginePowerSlider() {
  const id = useId();
  const power = useScene((s) => s.enginePower);
  const setEnginePower = useScene((s) => s.setEnginePower);
  const pct = enginePercent(power);
  return (
    <div data-engine-power={pct}>
      <label htmlFor={id} className="tool-label">Engine power</label>
      <div className="range">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-label="Engine power"
          aria-valuetext={`${pct} percent`}
          onChange={(e) => {
            const next = enginePowerFromPercent(Number(e.currentTarget.value));
            if (next !== null) setEnginePower(next);
          }}
        />
        <output htmlFor={id} className="range__value">{pct}%</output>
      </div>
    </div>
  );
}
