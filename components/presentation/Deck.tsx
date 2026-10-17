"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Figure } from "./Diagrams";
import { presets, useReducedMotion } from "./motion-fixture";
import { actionFor, advance, openingReveal, retreat, type DeckPos } from "./nav";
import { CREDIT, SLIDES, type Slide } from "./slides";
import "./deck.css";

const BEATS = SLIDES.map((slide) => slide.beats.length);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function Legal() {
  return (
    <p className="deck-legal">
      <span>{CREDIT.authors}</span>
      <span>{CREDIT.disclaimer}</span>
      <span>
        Model: “{CREDIT.modelName}” by {CREDIT.modelBy},{" "}
        <a href={CREDIT.licenceUrl} target="_blank" rel="noopener noreferrer">
          {CREDIT.licence}
        </a>
        .{" "}
        <a href={CREDIT.modelPageUrl} target="_blank" rel="noopener noreferrer">
          Model page
        </a>
      </span>
    </p>
  );
}

export function Deck({ pdfHref = "/presentation/teardown.pdf" }: { pdfHref?: string }) {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DeckPos>({ index: 0, reveal: 1 });
  const [notesOn, setNotesOn] = useState(false);
  const [menuOn, setMenuOn] = useState(false);
  const liveId = useId();
  const booted = useRef(false);

  const slide = SLIDES[pos.index];
  const atStart = pos.index === 0 && (reduced || pos.reveal <= 1);
  const atEnd = pos.index === SLIDES.length - 1 && (reduced || pos.reveal >= slide.beats.length);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const id = window.location.hash.replace(/^#/, "");
    const index = SLIDES.findIndex((item) => item.id === id);
    if (index >= 0) setPos({ index, reveal: openingReveal(BEATS[index], reduced, true) });
    else if (reduced) setPos({ index: 0, reveal: BEATS[0] });
  }, [reduced]);

  useEffect(() => {
    if (!reduced) return;
    setPos((curr) => ({ index: curr.index, reveal: BEATS[curr.index] }));
  }, [reduced]);

  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      const index = SLIDES.findIndex((item) => item.id === id);
      if (index < 0) return;
      setPos({ index, reveal: openingReveal(BEATS[index], reduced, true) });
      setMenuOn(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reduced]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (!root.isConnected) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === " " && event.target instanceof HTMLElement && event.target.closest("a, button")) {
        return;
      }
      const action = actionFor(event.key);
      if (!action) return;
      event.preventDefault();
      if (action === "advance") {
        setMenuOn(false);
        setPos((curr) => advance(curr, BEATS, reduced));
      }
      if (action === "retreat") {
        setMenuOn(false);
        setPos((curr) => retreat(curr, BEATS, reduced));
      }
      if (action === "home") {
        setMenuOn(false);
        setPos({ index: 0, reveal: openingReveal(BEATS[0], reduced, false) });
      }
      if (action === "end") {
        setMenuOn(false);
        const index = SLIDES.length - 1;
        setPos({ index, reveal: BEATS[index] });
      }
      if (action === "notes") setNotesOn((open) => !open);
      if (action === "fullscreen") toggleFullscreen(root);
      if (action === "close") {
        if (menuOn) setMenuOn(false);
        else if (notesOn) setNotesOn(false);
        else if (document.fullscreenElement) void document.exitFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reduced, menuOn, notesOn]);

  useEffect(() => {
    const next = `#${slide.id}`;
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, [slide.id]);

  function jump(index: number) {
    setPos({ index, reveal: openingReveal(BEATS[index], reduced, true) });
    setMenuOn(false);
    rootRef.current?.focus();
  }

  return (
    <div
      className="deck"
      ref={rootRef}
      tabIndex={-1}
      data-motion={reduced ? "reduce" : "full"}
      data-rise={presets.rise.transition.duration}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.focus();
      }}
    >
      <div className="deck-stage">
        {SLIDES.map((item, index) => (
          <SlideView
            key={item.id}
            slide={item}
            active={index === pos.index}
            reveal={index === pos.index ? pos.reveal : item.beats.length}
            pdfHref={pdfHref}
          />
        ))}
        {menuOn ? (
          <nav className="deck-menu" aria-label="All slides">
            {SLIDES.map((item, index) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={index === pos.index ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  jump(index);
                }}
              >
                {index === pos.index ? <span className="deck-now">Now</span> : <span className="deck-now">{index + 1}</span>}
                {item.title}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
      {notesOn ? (
        <aside className="deck-notes" aria-label="Speaker notes">
          <h2>Speaker notes · not shown on the projector PDF</h2>
          {slide.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </aside>
      ) : null}
      <footer className="deck-chrome">
        <div className="deck-controls">
          <button type="button" className="btn" onClick={() => setPos((curr) => retreat(curr, BEATS, reduced))} disabled={atStart}>
            Previous
          </button>
          <button type="button" className="btn" onClick={() => setPos((curr) => advance(curr, BEATS, reduced))} disabled={atEnd}>
            Next
          </button>
          <p className="deck-count" id={liveId} aria-live="polite">
            {pos.index + 1} of {SLIDES.length}
            {reduced ? "" : ` · step ${pos.reveal} of ${slide.beats.length}`}
            {" · "}
            {slide.title}
          </p>
          <button type="button" className="btn" aria-expanded={menuOn} onClick={() => setMenuOn((open) => !open)}>
            Slides
          </button>
          <button type="button" className="btn" aria-expanded={notesOn} onClick={() => setNotesOn((open) => !open)}>
            Notes
          </button>
          <button type="button" className="btn" onClick={() => rootRef.current && toggleFullscreen(rootRef.current)}>
            Full screen
          </button>
        </div>
        <Legal />
      </footer>
    </div>
  );
}

function SlideView({
  slide,
  active,
  reveal,
  pdfHref,
}: {
  slide: Slide;
  active: boolean;
  reveal: number;
  pdfHref: string;
}) {
  return (
    <section
      className={slide.figure === "poster" ? "deck-slide deck-poster" : "deck-slide"}
      id={slide.id}
      data-active={active ? "true" : "false"}
      data-figure={slide.figure}
      aria-hidden={active ? undefined : true}
      aria-labelledby={`${slide.id}-title`}
    >
      <header>
        <p className="deck-kicker">{slide.part === "appendix" ? `Appendix · ${slide.kicker}` : slide.kicker}</p>
        <h1 id={`${slide.id}-title`} className={slide.titleCase === "sentence" ? "deck-title--sentence" : undefined}>
          {slide.title}
        </h1>
      </header>
      <div className="deck-body">
        <div className="deck-copy">
          {slide.beats.map((beat, index) => (
            <p key={beat.id} className="deck-beat" data-shown={index < reveal ? "true" : "false"}>
              {beat.text}
            </p>
          ))}
          {slide.id === "close" ? (
            <p className="deck-links">
              <a className="btn" href={pdfHref}>
                Static PDF
              </a>
              <a className="btn" href="#title">
                Title slide
              </a>
            </p>
          ) : null}
          <div className="deck-print-legal">
            <Legal />
          </div>
        </div>
        <Figure slide={slide} reveal={reveal} />
      </div>
    </section>
  );
}

function toggleFullscreen(node: HTMLElement) {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void node.requestFullscreen().catch(() => undefined);
}
