/**
 * Original drawings for the deck. They are not screenshots and not the licensed model.
 * Colours come from the theme tokens on .deck. No company mark.
 */
import type { ReactNode } from "react";
import { EVIDENCE_GAPS, type Slide } from "./slides";

function Shown({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <g className={className} data-shown={show ? "true" : "false"}>
      {children}
    </g>
  );
}

export function Figure({ slide, reveal }: { slide: Slide; reveal: number }) {
  switch (slide.figure) {
    case "poster":
      return <Poster reveal={reveal} />;
    case "sources":
      return <Scattered reveal={reveal} />;
    case "explore":
      return <ExploreFrame reveal={reveal} />;
    case "fly":
      return <FlyPaths reveal={reveal} />;
    case "phone":
      return <PhoneSteps reveal={reveal} />;
    case "learn":
      return <TwoFlights reveal={reveal} />;
    case "how":
      return <Boundary reveal={reveal} />;
    case "close":
      return <CloseMarks reveal={reveal} />;
    case "rules":
      return <RuleList reveal={reveal} />;
    case "orbit":
      return <OrbitSketch reveal={reveal} />;
    case "excluded":
      return <LeftOut reveal={reveal} />;
    case "evidence":
      return <GapList />;
    default:
      return null;
  }
}

function Poster({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure">
      <svg viewBox="0 0 640 420" role="img" aria-label="Drawing of Earth and a simple rocket. Not a picture of the app.">
        <circle cx="230" cy="230" r="108" fill="none" stroke="var(--text)" strokeWidth="2" />
        <ellipse cx="230" cy="230" rx="108" ry="42" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
        <path d="M230 122 A108 108 0 0 1 230 338" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" />
        <Shown show={reveal >= 1}>
          <path d="M430 250 L458 168 L486 250 Z" fill="none" stroke="var(--text)" strokeWidth="2" />
          <path d="M446 250 L458 292 L470 250" fill="none" stroke="var(--text)" strokeWidth="2" />
          <path d="M452 292 L458 318 L464 292" fill="var(--flame)" stroke="none" />
        </Shown>
      </svg>
      <figcaption>Drawing for the story. Not a picture of the app.</figcaption>
    </figure>
  );
}

function Scattered({ reveal }: { reveal: number }) {
  const items = [
    { label: "Pages", x: 48, y: 70 },
    { label: "Videos", x: 250, y: 150 },
    { label: "Tables", x: 90, y: 240 },
  ];
  return (
    <figure className="deck-figure">
      <svg viewBox="0 0 640 420" role="img" aria-label="Pages, videos and tables, with no way to try the rocket.">
        {items.map((item, i) => (
          <Shown key={item.label} show={reveal > i}>
            <text x={item.x} y={item.y} fill="var(--text)" fontSize="28" fontFamily="var(--font-display)">
              {item.label}
            </text>
          </Shown>
        ))}
        <Shown show={reveal >= 3}>
          <text x="48" y="340" fill="var(--text-muted)" fontSize="22" fontFamily="var(--font-body)">
            No way to try it
          </text>
        </Shown>
      </svg>
      <figcaption>The facts are scattered. That is the problem, not a statistic.</figcaption>
    </figure>
  );
}

function ExploreFrame({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure">
      <div className="deck-frame" role="img" aria-label="Placeholder frame for Explore. Not a screenshot.">
        <p className="deck-frame__tag">Placeholder</p>
        <svg viewBox="0 0 420 220" aria-hidden="true">
          <rect x="170" y="18" width="80" height="36" fill="none" stroke="var(--text)" strokeWidth="2" />
          <g data-shown={reveal >= 2 ? "true" : "false"}>
            <rect x="150" y="78" width="120" height="48" fill="none" stroke="var(--text)" strokeWidth="2" />
            <rect x="186" y="150" width="48" height="48" fill="none" stroke="var(--text)" strokeWidth="2" />
          </g>
        </svg>
        <p className="deck-frame__label">A shape of stages pulled apart. Not the Falcon 9 model.</p>
      </div>
      <figcaption>Placeholder. Not a screenshot. Explore is not built on this branch.</figcaption>
    </figure>
  );
}

function FlyPaths({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure">
      <svg viewBox="0 0 640 420" role="img" aria-label="Drawing of Earth, a path that falls back, and a path around Earth. Not a flown result.">
        <circle cx="250" cy="240" r="78" fill="none" stroke="var(--text)" strokeWidth="2" />
        <rect x="242" y="156" width="16" height="10" fill="var(--text)" />
        <Shown show={reveal >= 3}>
          <path d="M250 162 C 330 80, 430 120, 390 210" fill="none" stroke="var(--bad-text)" strokeWidth="2" />
          <text x="400" y="120" fill="var(--bad-text)" fontSize="16" fontFamily="var(--font-mono)">
            Falls back
          </text>
        </Shown>
        <Shown show={reveal >= 4}>
          <ellipse cx="250" cy="240" rx="168" ry="78" fill="none" stroke="var(--text)" strokeWidth="2" />
          <text x="400" y="300" fill="var(--text)" fontSize="16" fontFamily="var(--font-mono)">
            Game goal
          </text>
        </Shown>
      </svg>
      <figcaption>Placeholder drawing. Not a flown path, and not a success.</figcaption>
    </figure>
  );
}

function PhoneSteps({ reveal }: { reveal: number }) {
  const steps = ["Scan", "Allow", "Zero", "Tilt"];
  return (
    <figure className="deck-figure">
      <div className="deck-frame" role="img" aria-label="Placeholder for a phone photo. The steps are Scan, Allow, Zero and Tilt.">
        <p className="deck-frame__tag">Placeholder</p>
        <ol className="deck-steps">
          {steps.map((step, i) => (
            <li key={step} data-shown={reveal >= 2 || i === 0 ? "true" : "false"}>
              <span>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="deck-frame__label">No phone photo yet. The laptop path does not need one.</p>
      </div>
      <figcaption>Placeholder. Not a photograph of a handset or a shell.</figcaption>
    </figure>
  );
}

function TwoFlights({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure">
      <div className="deck-splitfig" role="img" aria-label="Published moments beside a simulated flight. No emissions number.">
        <div data-shown={reveal >= 1 ? "true" : "false"}>
          <p className="deck-kicker">Published moments</p>
          <p>Named launch, source, and what we do not know.</p>
        </div>
        <div data-shown={reveal >= 2 ? "true" : "false"}>
          <p className="deck-kicker">Simulated flight</p>
          <p>Numbers from the model and your inputs.</p>
        </div>
        <p className="deck-estimate" data-shown={reveal >= 3 ? "true" : "false"}>
          Estimate. No total is shown, because none has been calculated.
        </p>
      </div>
      <figcaption>Not a screenshot. No carbon-dioxide figure is claimed.</figcaption>
    </figure>
  );
}

function Boundary({ reveal }: { reveal: number }) {
  const rows = [
    "Hands",
    "Physics helper",
    "Guide explains only",
    "Grok on the server, or an honest offline line",
  ];
  return (
    <figure className="deck-figure">
      <ol className="deck-flow" aria-label="What decides the flight, and what only talks.">
        {rows.map((row, i) => (
          <li key={row} data-shown={reveal > i ? "true" : "false"}>
            {row}
          </li>
        ))}
      </ol>
      <figcaption>The picture does not get a vote. The guide does not steer.</figcaption>
    </figure>
  );
}

function CloseMarks({ reveal }: { reveal: number }) {
  const words = ["Explore", "Replay", "Fly"];
  return (
    <figure className="deck-figure deck-figure--words">
      <ul>
        {words.map((word, i) => (
          <li key={word} data-shown={reveal >= 1 || i === 0 ? "true" : "false"}>
            {word}
          </li>
        ))}
      </ul>
      <figcaption>Three modes. No separate Engines or Emissions destination.</figcaption>
    </figure>
  );
}

function RuleList({ reveal }: { reveal: number }) {
  const rules = ["Source", "Simulation", "Estimate", "Missing stays missing"];
  return (
    <figure className="deck-figure">
      <ul className="deck-rules">
        {rules.map((rule, i) => (
          <li key={rule} data-shown={reveal > i ? "true" : "false"}>
            {rule}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function OrbitSketch({ reveal }: { reveal: number }) {
  return (
    <figure className="deck-figure">
      <svg viewBox="0 0 640 420" role="img" aria-label="Earth with a low point and a high point on a path. A game setting, not a flown orbit.">
        <circle cx="300" cy="210" r="70" fill="none" stroke="var(--text)" strokeWidth="2" />
        <ellipse cx="300" cy="210" rx="150" ry="96" fill="none" stroke="var(--text-muted)" strokeWidth="2" opacity={reveal >= 2 ? 1 : 0.3} />
        <Shown show={reveal >= 2}>
          <text x="430" y="120" fill="var(--text)" fontSize="16" fontFamily="var(--font-mono)">
            Highest
          </text>
          <text x="150" y="320" fill="var(--text)" fontSize="16" fontFamily="var(--font-mono)">
            Lowest
          </text>
        </Shown>
        <Shown show={reveal >= 1}>
          <text x="40" y="40" fill="var(--text-muted)" fontSize="16" fontFamily="var(--font-mono)">
            Game setting
          </text>
        </Shown>
      </svg>
      <figcaption>Not a result. Altitude alone never wins.</figcaption>
    </figure>
  );
}

function LeftOut({ reveal }: { reveal: number }) {
  const items = ["Engine-out sandbox", "Docking and stations", "Booster-landing game", "Other planets", "Stars and checkpoints"];
  return (
    <figure className="deck-figure">
      <ul className="deck-out">
        {items.map((item, i) => (
          <li key={item} data-shown={reveal > i ? "true" : "false"}>
            <span>Not in this build</span>
            {item}
          </li>
        ))}
      </ul>
    </figure>
  );
}

function GapList() {
  return (
    <figure className="deck-figure">
      <ol className="deck-gaps">
        {EVIDENCE_GAPS.map((gap) => (
          <li key={gap}>
            <span className="deck-box" aria-hidden="true" />
            {gap}
          </li>
        ))}
      </ol>
      <figcaption>Empty on purpose. None of these captures exist yet.</figcaption>
    </figure>
  );
}
