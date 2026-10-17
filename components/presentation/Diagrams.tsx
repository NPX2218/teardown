/**
 * Figures for the deck. "shot" figures are real captures of the running app
 * (the README screenshots). Everything else is a drawing made from the code's
 * own numbers. Colours come from the theme tokens on .deck. No company mark.
 */
import type { ReactNode } from "react";
import { OPEN_ITEMS, type Slide } from "./slides";

function Show({ on, children, as: Tag = "div", className }: { on: boolean; children: ReactNode; as?: "div" | "li" | "g"; className?: string }) {
  return (
    <Tag className={className} data-shown={on ? "true" : "false"}>
      {children}
    </Tag>
  );
}

export function Figure({ slide, reveal, mediaBase }: { slide: Slide; reveal: number; mediaBase: string }) {
  switch (slide.figure) {
    case "hero":
      return null;
    case "scattered":
      return <Scattered reveal={reveal} />;
    case "stats":
      return <Stats />;
    case "shot":
      return slide.shot ? <Shot shot={slide.shot} mediaBase={mediaBase} /> : null;
    case "phone":
      return <PhoneRocket reveal={reveal} />;
    case "pipeline":
      return <Pipeline reveal={reveal} />;
    case "gestures":
      return <Gestures />;
    case "physics":
      return <Physics reveal={reveal} />;
    case "grok":
      return <GrokCards />;
    case "store":
      return <Store />;
    case "challenge":
      return <Challenge />;
    case "close":
      return <CloseWords />;
    case "rules":
      return <Rules reveal={reveal} />;
    case "open":
      return <Open />;
    default:
      return null;
  }
}

function Scattered({ reveal }: { reveal: number }) {
  const sources = [
    { tag: "Spec sheet", line: "Height 70 m · 9 × 845 kN" },
    { tag: "Webcast", line: "T+00:02:31 · MECO" },
    { tag: "Launch database", line: "Sentinel-6 · 21 Nov 2020" },
  ];
  return (
    <figure className="deck-figure">
      <div className="deck-scatter">
        {sources.map((source) => (
          <div key={source.tag} className="deck-card">
            <p className="deck-card__tag">{source.tag}</p>
            <p className="deck-card__line">{source.line}</p>
          </div>
        ))}
        <Show on={reveal >= 2} className="deck-scatter__none">
          No way to touch it
        </Show>
      </div>
      <figcaption>Three places, three formats, nothing you can hold.</figcaption>
    </figure>
  );
}

function Stats() {
  const stats = [
    ["3", "Ways to play"],
    ["10", "Parts to pull apart"],
    ["3", "Reading levels"],
    ["1", "Phone for a rocket"],
  ];
  return (
    <figure className="deck-figure">
      <dl className="deck-stats">
        {stats.map(([n, label]) => (
          <div key={label}>
            <dt>{n}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

function Shot({ shot, mediaBase }: { shot: NonNullable<Slide["shot"]>; mediaBase: string }) {
  return (
    <figure className="deck-figure deck-shot">
      <img src={`${mediaBase}${shot.file}`} alt={shot.alt} />
      <figcaption>{shot.caption}</figcaption>
    </figure>
  );
}

function PhoneRocket({ reveal }: { reveal: number }) {
  const steps = ["Scan", "Allow", "Zero", "Tilt"];
  return (
    <figure className="deck-figure deck-phone">
      <svg viewBox="0 0 520 400" role="img" aria-label="A phone inside a cardboard rocket, labelled accelerometer, gyroscope, speaker and vibration.">
        {/* cardboard shell */}
        <path d="M150 60 L190 20 L230 60 L230 330 L150 330 Z" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="2" />
        <path d="M150 270 L118 340 L150 330 Z M230 270 L262 340 L230 330 Z" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="2" />
        <path d="M175 330 L190 372 L205 330" fill="var(--flame)" />
        {/* phone */}
        <rect x="163" y="95" width="54" height="150" rx="9" fill="var(--bg)" stroke="var(--text)" strokeWidth="2" />
        <rect x="170" y="108" width="40" height="118" rx="3" fill="var(--fill-1)" />
        <text x="190" y="172" textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-mono)">ARMED</text>
        {/* nose axis */}
        <path d="M190 90 L190 40" stroke="var(--flame)" strokeWidth="2" markerEnd="url(#deck-arrow)" />
        <text x="198" y="52" fill="var(--flame)" fontSize="12" fontFamily="var(--font-mono)">+y nose</text>
        <defs>
          <marker id="deck-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <Show on={reveal >= 3} as="g">
          {[
            ["Accelerometer", "gravity + your push", 120],
            ["Gyroscope", "how fast it turns", 170],
            ["Speaker", "engine roar", 220],
            ["Vibration", "rumble at liftoff", 270],
          ].map(([name, what, y]) => (
            <g key={name as string}>
              <path d={`M222 ${y} L300 ${y}`} stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="3 4" />
              <text x="310" y={(y as number) - 2} fill="var(--text)" fontSize="17" fontFamily="var(--font-display)" fontWeight="700" letterSpacing="0.04em">
                {(name as string).toUpperCase()}
              </text>
              <text x="310" y={(y as number) + 16} fill="var(--text-muted)" fontSize="13" fontFamily="var(--font-mono)">
                {what}
              </text>
            </g>
          ))}
        </Show>
      </svg>
      <ol className="deck-chips">
        {steps.map((step, i) => (
          <Show key={step} as="li" on={reveal >= 2}>
            <span>{i + 1}</span>
            {step}
          </Show>
        ))}
      </ol>
    </figure>
  );
}

function Pipeline({ reveal }: { reveal: number }) {
  const stages = [
    { at: 1, name: "Phone sensors", detail: "devicemotion + deviceorientation · ≤ 20 Hz" },
    { at: 2, name: "Split", detail: "gravity (low-pass 0.8) | your movement" },
    { at: 3, name: "Zero", detail: "2 s still → rocket frame, +y = nose" },
    { at: 4, name: "Pitch", detail: "atan2(g_z, √(g_x² + g_y²)) · clamp ±90°" },
    { at: 4, name: "Relay → laptop", detail: "{q, lin, grav} · local relay (tunnel) · 4-letter code" },
    { at: 4, name: "Store → physics", detail: "one owner per control · pause if silent 2 s" },
  ];
  return (
    <figure className="deck-figure">
      <ol className="deck-pipe" aria-label="How a phone tilt becomes a steering angle.">
        {stages.map((stage) => (
          <Show key={stage.name} as="li" on={reveal >= stage.at}>
            <span className="deck-pipe__name">{stage.name}</span>
            <code>{stage.detail}</code>
          </Show>
        ))}
      </ol>
    </figure>
  );
}

function Gestures() {
  const rows = [
    ["Lift", "≥ 2.5 m/s² up the nose for 180 ms", "Launch"],
    ["Lean", "gravity angle in the rocket frame", "Steer"],
    ["Push", "≥ 3 m/s² along the nose", "Engine power"],
    ["Flick", "≥ 12 m/s² sideways, 40–220 ms", "Drop stage 1"],
    ["Nose down", "past 150° for 2 s", "Abort"],
    ["Silence", "no frame for 2 s", "Pause"],
  ];
  return (
    <figure className="deck-figure">
      <table className="deck-table">
        <thead>
          <tr>
            <th>Move</th>
            <th>What the sensor must see</th>
            <th>Does</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([move, rule, does]) => (
            <tr key={move}>
              <th scope="row">{move}</th>
              <td>
                <code>{rule}</code>
              </td>
              <td>{does}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption>Thresholds from lib/rocket/shell-gestures.ts.</figcaption>
    </figure>
  );
}

function Physics({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure deck-physics">
      <svg viewBox="0 0 520 300" role="img" aria-label="Earth with a rocket, its gravity, thrust and drag arrows, and the orbit with its lowest and highest points.">
        <defs>
          <marker id="deck-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <circle cx="200" cy="170" r="92" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="2" />
        <text x="200" y="176" textAnchor="middle" fill="var(--text-muted)" fontSize="14" fontFamily="var(--font-mono)">Earth</text>
        <Show on={reveal >= 3} as="g">
          <ellipse cx="225" cy="170" rx="160" ry="118" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="65" cy="170" r="5" fill="var(--text)" />
          <text x="18" y="200" fill="var(--text)" fontSize="13" fontFamily="var(--font-mono)">Pe ≥ 200 km</text>
          <circle cx="385" cy="170" r="5" fill="var(--text)" />
          <text x="395" y="200" fill="var(--text)" fontSize="13" fontFamily="var(--font-mono)">Ap ≤ 2,000 km</text>
        </Show>
        {/* rocket on its path */}
        <path d="M200 78 Q 250 50 300 62" fill="none" stroke="var(--flame)" strokeWidth="2" />
        <circle cx="300" cy="62" r="6" fill="var(--flame)" />
        <Show on={reveal >= 1} as="g">
          <path d="M300 62 L 268 96" stroke="var(--text)" strokeWidth="2" markerEnd="url(#deck-head)" />
          <text x="214" y="112" fill="var(--text)" fontSize="13" fontFamily="var(--font-mono)">gravity</text>
          <path d="M300 62 L 350 40" stroke="var(--flame)" strokeWidth="2.5" markerEnd="url(#deck-head)" />
          <text x="356" y="38" fill="var(--flame)" fontSize="13" fontFamily="var(--font-mono)">thrust · tilt θ</text>
          <path d="M300 62 L 272 56" stroke="var(--bad-text)" strokeWidth="2" markerEnd="url(#deck-head)" />
          <text x="226" y="46" fill="var(--bad-text)" fontSize="13" fontFamily="var(--font-mono)">drag</text>
        </Show>
      </svg>
      <pre className="deck-eq" aria-label="The flight equations.">
        <span data-shown={reveal >= 1 ? "true" : "false"}>a = −μ·r̂/r² + (T/m)(cos θ·r̂ + sin θ·t̂) − D/m</span>
        <span data-shown={reveal >= 2 ? "true" : "false"}>v ← v + a·dt    x ← x + v·dt    dt = 1/60 s</span>
        <span data-shown={reveal >= 3 ? "true" : "false"}>ε = v²/2 − μ/r    h = x·v_y − y·v_x</span>
        <span data-shown={reveal >= 3 ? "true" : "false"}>e = √(1 + 2εh²/μ²)    Pe, Ap = a(1 ∓ e) − R⊕</span>
        <span data-shown={reveal >= 4 ? "true" : "false"}>win: Pe ≥ 200 km · Ap ≤ 2,000 km · 10 s coast</span>
      </pre>
    </figure>
  );
}

function GrokCards() {
  const cards = [
    ["Agent", "Function calling. Its tools are the store actions the buttons use."],
    ["Voice", "Live session. It can start the tour and set kid, curious, or engineer."],
    ["Imagine", "“Show in action” draws the selected part, grounded in its data."],
    ["Grok Bot", "A corner face that reacts while Grok listens and talks."],
  ];
  return (
    <figure className="deck-figure">
      <div className="deck-grid">
        {cards.map(([name, text]) => (
          <div key={name} className="deck-card">
            <p className="deck-card__tag">{name}</p>
            <p className="deck-card__line">{text}</p>
          </div>
        ))}
      </div>
      <figcaption>The xAI key stays on the server. If Grok is unreachable, the exhibit keeps running.</figcaption>
    </figure>
  );
}

function Store() {
  return (
    <figure className="deck-figure">
      <div className="deck-store" aria-label="Phone, mouse and Grok feed one store. The store drives the 3D rocket, the flight physics and the readouts. Data files feed the rocket and Grok.">
        <ul className="deck-store__col">
          <li>Phone rocket</li>
          <li>Mouse · touch · keys</li>
          <li>Grok agent</li>
        </ul>
        <span className="deck-store__arrow" aria-hidden="true">→</span>
        <div className="deck-store__hub">
          <strong>Store</strong>
          <span>one source of truth</span>
          <em>data/ · parts · missions · emissions</em>
        </div>
        <span className="deck-store__arrow" aria-hidden="true">→</span>
        <ul className="deck-store__col">
          <li>3D Falcon 9</li>
          <li>Flight physics + NASA Earth</li>
          <li>Cards · readouts · CO₂</li>
        </ul>
      </div>
    </figure>
  );
}

function Challenge() {
  const rows = [
    ["Real space data", "Falcon 9 specs from spacex.com, the Sentinel-6 launch timeline, NASA Earth imagery, a sourced emissions file"],
    ["Grok Voice or Imagine", "Both, plus Grok function calling that drives the scene"],
    ["Built with Cursor", "Built in Cursor, plans in docs/plans/"],
    ["Hardware for Good", "A phone in a cardboard rocket: accelerometer, gyro, speaker. Confirmed with the co-director"],
  ];
  return (
    <figure className="deck-figure">
      <table className="deck-table deck-table--check">
        <tbody>
          {rows.map(([req, how]) => (
            <tr key={req}>
              <th scope="row">
                <span aria-hidden="true">✓</span> {req}
              </th>
              <td>{how}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function CloseWords() {
  return (
    <figure className="deck-figure deck-figure--words">
      <ul>
        <li>Explore</li>
        <li>Replay</li>
        <li>Fly</li>
      </ul>
    </figure>
  );
}

function Rules({ reveal }: { reveal: number }) {
  const rules = ["Source", "Simulation", "Estimate", "Missing stays missing"];
  return (
    <figure className="deck-figure">
      <ul className="deck-rules">
        {rules.map((rule, i) => (
          <Show key={rule} as="li" on={reveal > i}>
            {rule}
          </Show>
        ))}
      </ul>
    </figure>
  );
}

function Open() {
  return (
    <figure className="deck-figure">
      <ol className="deck-gaps">
        {OPEN_ITEMS.map((item) => (
          <li key={item}>
            <span className="deck-box" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ol>
    </figure>
  );
}
