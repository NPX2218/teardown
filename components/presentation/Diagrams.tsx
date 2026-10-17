/**
 * Figures for the deck. "shot" figures are real captures of the running app
 * (the README screenshots). Everything else is a drawing made from the code's
 * own numbers. Colours come from the theme tokens on .deck. No company mark.
 */
import type { ReactNode } from "react";
import { USAGE_SHOTS, type Slide } from "./slides";

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
    case "team":
      return <Team reveal={reveal} mediaBase={mediaBase} />;
    case "demo":
      return <DemoRun reveal={reveal} />;
    case "shot":
      return slide.shot ? <Shot shot={slide.shot} mediaBase={mediaBase} /> : null;
    case "phone":
      return <PhoneRocket reveal={reveal} />;
    case "store":
      return <Store />;
    case "challenge":
      return <Challenge />;
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
      <figcaption>Spread over three sites in three formats, and you can't hold any of it.</figcaption>
    </figure>
  );
}

function Team({ reveal, mediaBase }: { reveal: number; mediaBase: string }) {
  return (
    <figure className="deck-figure">
      <div className="deck-grid">
        <div className="deck-card">
          <p className="deck-card__tag">Neel Bansal + Anders Haroldson</p>
          <p className="deck-card__line">Built together, start to finish.</p>
        </div>
        <div className="deck-card">
          <p className="deck-card__tag">Cursor + Grok</p>
          <p className="deck-card__line">Used as far as they would go.</p>
        </div>
      </div>
      <Show on={reveal >= 2} className="deck-usage">
        {USAGE_SHOTS.map((shot) => (
          <img key={shot.file} src={`${mediaBase}${shot.file}`} alt={shot.alt} />
        ))}
      </Show>
      <figcaption>Our real {USAGE_SHOTS.map((shot) => shot.tool).join(" and ")} usage during the hackathon.</figcaption>
    </figure>
  );
}

function DemoRun({ reveal }: { reveal: number }) {
  const steps = [
    { at: 1, step: "Take it apart" },
    { at: 2, step: "Fly it" },
    { at: 3, step: "Keep the postcard" },
  ];
  return (
    <figure className="deck-figure">
      <ol className="deck-flow" aria-label="The live demo, in order.">
        {steps.map((item) => (
          <Show key={item.step} as="li" on={reveal >= item.at}>
            {item.step}
          </Show>
        ))}
      </ol>
      <figcaption>Backup if the phone won’t pair: npm run sim:phone.</figcaption>
    </figure>
  );
}

function Shot({ shot, mediaBase }: { shot: NonNullable<Slide["shot"]>; mediaBase: string }) {
  return (
    <figure className="deck-figure deck-shot">
      {shot.motion && <img className="deck-shot__motion" src={`${mediaBase}${shot.motion}`} alt={shot.alt} />}
      <img className={shot.motion ? "deck-shot__still" : undefined} src={`${mediaBase}${shot.file}`} alt={shot.motion ? "" : shot.alt} />
      <figcaption>{shot.caption}</figcaption>
    </figure>
  );
}

/** Thresholds from lib/rocket/shell-gestures.ts and lib/flight/phone-steering.helpers.ts. */
const GESTURES = [
  ["Lift", "≥ 2.5 m/s² up the nose for 180 ms", "Launch"],
  ["Lean", "calibrated tilt past a 2° dead zone, ≤ 12°/s", "Steer"],
  ["Push", "≥ 3 m/s² along the nose", "Engine power"],
  ["Flick", "≥ 12 m/s² sideways for 40 to 220 ms", "Drop stage 1"],
  ["Nose down", "past 150° for 2 s", "Abort"],
  ["Silence", "no frame for 2 s", "Pause"],
];

function PhoneRocket({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure deck-phone">
      <svg viewBox="0 0 520 400" role="img" aria-label="A phone lying sideways (landscape) inside a cardboard rocket, its +x edge toward the nose, labelled accelerometer, gyroscope, speaker and vibration.">
        {/* cardboard shell */}
        <path d="M130 75 L190 18 L250 75 L250 330 L130 330 Z" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="2" />
        <path d="M130 270 L98 340 L130 330 Z M250 270 L282 340 L250 330 Z" fill="var(--surface-2)" stroke="var(--text)" strokeWidth="2" />
        <path d="M172 330 L190 374 L208 330" fill="var(--flame)" />
        {/* phone, landscape: long edge across the tube, device +x toward the nose (lib/rocket/mount.ts, s24fe) */}
        <rect x="140" y="165" width="100" height="56" rx="9" fill="var(--bg)" stroke="var(--text)" strokeWidth="2" />
        <rect x="152" y="171" width="76" height="44" rx="3" fill="var(--fill-1)" />
        <text x="190" y="197" textAnchor="middle" fill="var(--text)" fontSize="11" fontFamily="var(--font-mono)">ARMED</text>
        {/* nose axis */}
        <path d="M190 160 L190 92" stroke="var(--signal)" strokeWidth="2" markerEnd="url(#deck-arrow)" />
        <text x="198" y="112" fill="var(--signal)" fontSize="12" fontFamily="var(--font-mono)">+x nose</text>
        <defs>
          <marker id="deck-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <Show on={reveal >= 2} as="g">
          {[
            ["Accelerometer", "gravity + your push", 120],
            ["Gyroscope", "how fast it turns", 170],
            ["Speaker", "engine roar", 220],
            ["Vibration", "buzz with engine power", 270],
          ].map(([name, what, y]) => (
            <g key={name as string}>
              <path d={`M252 ${y} L300 ${y}`} stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="3 4" />
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
      <Show on={reveal >= 3}>
        <table className="deck-table deck-table--compact">
          <thead>
            <tr>
              <th>Move</th>
              <th>What the sensor must see</th>
              <th>Does</th>
            </tr>
          </thead>
          <tbody>
            {GESTURES.map(([move, rule, does]) => (
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
      </Show>
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
          <span>the only thing that moves the scene</span>
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
    ["Real space data", "Falcon 9 specs from spacex.com, Sentinel-6 published milestones, NASA Earth imagery, a sourced emissions file"],
    ["Grok Voice or Imagine", "Both: Grok Voice narrates every part and talks live, Imagine draws a postcard of every flight, plus function calling"],
    ["Built with Cursor", "Built in Cursor, plans in docs/plans/, using Grok Bot"],
    ["Hardware for Good", "A phone in a cardboard rocket: accelerometer, gyro, speaker, vibration. Confirmed with the co-director"],
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
