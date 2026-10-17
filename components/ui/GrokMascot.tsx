"use client";
// components/ui/GrokMascot.tsx — React wrapper for the ported bloub engine (lib/mascot/bot).
// The engine is clock-free: sample(t) is pure, this component owns the rAF clock.
// State changes go through setState so the face and the dots morph. Mic bars and
// the speech squash are painted on top of that frame.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "@/lib/mascot/bot/engine";
import { DOT_R, DOT_X } from "@/lib/mascot/bot/decor";
import { EXPRESSION_BY_ID } from "@/lib/mascot/bot/expressions";
import { DEMI_VIEWBOX as VB, RAYON as R } from "@/lib/mascot/bot/repere";
import { STATE_BY_ID } from "@/lib/mascot/bot/states";
import { getMascotLevels } from "@/lib/mascot/activity";
import { lookAt } from "@/lib/mascot/gaze";
import { MOOD_VISUAL, type MascotMood } from "@/lib/mascot/mood";
import {
  barScales,
  dotModeFor,
  paintEyeMatrix,
  speechModeFor,
  speechPose,
  type BarScale,
  type SpeechPose,
} from "@/lib/mascot/voice-meter";

export interface GrokMascotProps {
  mood: MascotMood;
  size?: number;
  ink?: string;      // body colour
  paper?: string;    // colour seen through the eye holes
  follow?: boolean;  // eyes follow the pointer
  reducedMotion?: boolean;
}

interface View {
  frame: BotFrame;
  mix: number;
  scales: [BarScale, BarScale, BarScale];
  speech: SpeechPose;
}

const STILL_SCALES: [BarScale, BarScale, BarScale] = [
  { scaleX: 1, scaleY: 1 },
  { scaleX: 1, scaleY: 1 },
  { scaleX: 1, scaleY: 1 },
];
const STILL_SPEECH: SpeechPose = { eyeScaleX: 1, eyeScaleY: 1, bounce: 0 };

/** Thinking morph in the engine. Bars wait until the ball has become the dots. */
const DOT_MORPH_S = 0.45;

export function GrokMascot({ mood, size = 44, ink = "#f5f5f5", paper = "#000", follow = true, reducedMotion = false }: GrokMascotProps) {
  const visual = MOOD_VISUAL[mood];
  const engine = useMemo(
    () => new BotEngine(R, visual.state, null, EXPRESSION_BY_ID.get(visual.expression) ?? null),
    // engine is created once; mood changes go through setters below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const clock = useRef(0);
  const stateAt = useRef(0);
  const mix = useRef(0);
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const [view, setView] = useState<View>(() => ({
    frame: engine.sample(reducedMotion ? 2 : 0),
    mix: 0,
    scales: STILL_SCALES,
    speech: STILL_SPEECH,
  }));
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const maskId = `grok-mask-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    engine.setState(visual.state, clock.current);
    engine.setExpression(EXPRESSION_BY_ID.get(visual.expression) ?? null, clock.current);
    stateAt.current = clock.current;
    if (reducedMotion) {
      mix.current = 0;
      setView({
        frame: engine.sample(clock.current + 2),
        mix: 0,
        scales: STILL_SCALES,
        speech: STILL_SPEECH,
      });
    }
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
      const current = moodRef.current;
      const mode = dotModeFor(current, false);
      const settled = clock.current - stateAt.current >= DOT_MORPH_S;
      const want = mode === "equaliser" || mode === "breathe" || mode === "wave" ? (settled ? 1 : 0) : 0;
      const tau = want > mix.current ? 0.08 : 0.16;
      const k = dt === 0 ? 1 : 1 - Math.exp(-dt / tau);
      mix.current += (want - mix.current) * k;
      if (mix.current < 0.001) mix.current = 0;
      const levels = getMascotLevels();
      const scales = mode === "off" || mode === "still"
        ? STILL_SCALES
        : barScales(levels.micBands, clock.current, mode);
      const speech = speechPose(
        levels.speechLevel,
        clock.current,
        speechModeFor(current, false, levels.speechLive),
      );
      const sampleAt = mix.current > 0.02 && settled ? stateAt.current + DOT_MORPH_S : clock.current;
      setView({ frame: engine.sample(sampleAt), mix: mix.current, scales, speech });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, follow, reducedMotion]);

  const { frame, mix: barMix, scales, speech } = view;
  const drawBars = barMix > 0.02 && !reducedMotion;
  const bounce = speech.bounce;
  const pills = drawBars ? pillSpecs(scales, barMix) : null;

  return (
    <svg ref={svgRef} width={size} height={size} viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} aria-hidden="true" data-mood={mood}>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={paintEyeMatrix(eye.matrix, { ...speech, bounce: 0 })} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>
      </defs>
      <g transform={bounce === 0 ? undefined : `translate(0 ${Math.round(bounce * 100) / 100})`}>
        <g opacity={drawBars ? frame.bodyAlpha * (1 - barMix) : frame.bodyAlpha}>
          <path d={frame.bodyPath} fill={paper} />
          <g mask={`url(#${maskId})`}>
            <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
          </g>
        </g>
        {frame.dots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={ink} opacity={drawBars ? dot.opacity * (1 - barMix) : dot.opacity} />
        ))}
        {pills?.map((pill, i) => (
          <rect
            key={`bar-${i}`}
            x={pill.x}
            y={pill.y}
            width={pill.w}
            height={pill.h}
            rx={pill.rx}
            fill={ink}
            opacity={pill.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

interface Pill {
  x: number;
  y: number;
  w: number;
  h: number;
  rx: number;
  opacity: number;
}

function pillSpecs(scales: [BarScale, BarScale, BarScale], mix: number): Pill[] {
  // Resting geometry, not the thinking pulse. That pulse fades the right dot,
  // and a frozen sample would leave one bar grey for the whole meter.
  return [0, 1, 2].map((i) => {
    const scale = scales[i] ?? { scaleX: 1, scaleY: 1 };
    const scaleY = 1 + (scale.scaleY - 1) * mix;
    const scaleX = 1 + (scale.scaleX - 1) * mix;
    const w = 2 * DOT_R * R * scaleX;
    const h = 2 * DOT_R * R * scaleY;
    const cx = DOT_X[i] * R;
    return {
      x: cx - w / 2,
      y: -h / 2,
      w,
      h,
      rx: Math.min(w, h) / 2,
      opacity: mix,
    };
  });
}
