"use client";
// components/ui/GrokMascot.tsx — React wrapper for the ported bloub engine (lib/mascot/bot).
// The engine is clock-free: sample(t) is pure, this component owns the rAF clock.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "@/lib/mascot/bot/engine";
import { EXPRESSION_BY_ID } from "@/lib/mascot/bot/expressions";
import { DEMI_VIEWBOX as VB, RAYON as R } from "@/lib/mascot/bot/repere";
import { STATE_BY_ID } from "@/lib/mascot/bot/states";
import { lookAt } from "@/lib/mascot/gaze";
import { MOOD_VISUAL, type MascotMood } from "@/lib/mascot/mood";

export interface GrokMascotProps {
  mood: MascotMood;
  size?: number;
  ink?: string;      // body colour
  paper?: string;    // colour seen through the eye holes
  follow?: boolean;  // eyes follow the pointer
  reducedMotion?: boolean;
}

export function GrokMascot({ mood, size = 44, ink = "#f5f5f5", paper = "#000", follow = true, reducedMotion = false }: GrokMascotProps) {
  const visual = MOOD_VISUAL[mood];
  const engine = useMemo(
    () => new BotEngine(R, visual.state, null, EXPRESSION_BY_ID.get(visual.expression) ?? null),
    // engine is created once; mood changes go through setters below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const clock = useRef(0);
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(reducedMotion ? 2 : 0));
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const maskId = `grok-mask-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    engine.setState(visual.state, clock.current);
    engine.setExpression(EXPRESSION_BY_ID.get(visual.expression) ?? null, clock.current);
    if (reducedMotion) setFrame(engine.sample(clock.current + 2));
  }, [engine, visual.state, visual.expression, reducedMotion]);

  useEffect(() => {
    if (!follow || reducedMotion) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const leave = () => { pointer.current = null; };
    window.addEventListener("pointermove", move);
    document.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [follow, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return; // one still frame, no loop
    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clock.current += dt;
      const box = svgRef.current?.getBoundingClientRect();
      if (follow && box && box.width > 0 && STATE_BY_ID.get(engine.state)?.baseFace) {
        const p = pointer.current;
        const nx = p ? Math.max(-1, Math.min(1, (p.x - (box.left + box.width / 2)) / Math.max(1, window.innerWidth / 2))) : 0;
        const ny = p ? Math.max(-1, Math.min(1, (p.y - (box.top + box.height / 2)) / Math.max(1, window.innerHeight / 2))) : 0;
        engine.setLook(lookAt(nx, ny, p !== null), clock.current);
      }
      setFrame(engine.sample(clock.current));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, follow, reducedMotion]);

  return (
    <svg ref={svgRef} width={size} height={size} viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} aria-hidden="true" data-mood={mood}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>
      </defs>
      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>
      {frame.dots.map((dot, i) => (
        <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={ink} opacity={dot.opacity} />
      ))}
    </svg>
  );
}
