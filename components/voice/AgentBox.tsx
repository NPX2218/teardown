"use client";
// components/voice/AgentBox.tsx — type or tap a question for Grok (04 Task 5). Owner: Anders.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { askAgent, cancelAgent } from "@/lib/agent/client";
import { toolCallLines } from "@/lib/agent/messages";
import { AGENT_STARTERS, readAgentKiosk } from "@/lib/agent/starters";
import type { ChatMessage } from "@/lib/agent/types";
import { getScene } from "@/lib/agent/scene";
import styles from "./AgentBox.module.css";

const LOG_LINES = 6;
export const CONVERSATION_IDLE_MS = 60_000;
const IDLE_CHECK_MS = 1_000;

export function AgentBox({ embedded = false }: { embedded?: boolean } = {}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [kiosk, setKiosk] = useState(false);
  const history = useRef<ChatMessage[]>([]);
  const seq = useRef(0);
  const idleDone = useRef(false);

  useEffect(() => {
    setKiosk(readAgentKiosk(window.location.search, document.body.classList.contains("kiosk")));
  }, []);

  useEffect(() => {
    const reset = () => {
      cancelAgent();
      seq.current += 1;
      history.current = [];
      setReply(null);
      setLog([]);
      setText("");
      setBusy(false);
    };
    window.addEventListener("teardown:exhibit-reset", reset);
    const id = setInterval(() => {
      const idle = performance.now() - getScene().lastActivityAt >= CONVERSATION_IDLE_MS;
      if (!idle) {
        idleDone.current = false;
        return;
      }
      if (idleDone.current) return;
      idleDone.current = true;
      reset();
    }, IDLE_CHECK_MS);
    return () => {
      clearInterval(id);
      window.removeEventListener("teardown:exhibit-reset", reset);
    };
  }, []);

  async function ask(q: string) {
    if (busy || q.trim() === "") return;
    const my = ++seq.current;
    setBusy(true);
    getScene().markActivity(performance.now());
    const r = await askAgent(q, history.current);
    if (my !== seq.current) return;
    if (!r.ok && r.reply === "") {
      setBusy(false);
      return;
    }
    getScene().markActivity(performance.now());
    const added = r.ok ? r.history.slice(r.history.map((m) => m.role).lastIndexOf("user")) : [];
    history.current = r.history;
    setLog((l) => [...l, ...toolCallLines(added)].slice(-LOG_LINES));
    setReply({ ok: r.ok, text: r.reply });
    setText("");
    setBusy(false);
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  return (
    <div className={embedded ? undefined : `dock dock--tr ${styles.dock}`}>
      <section className={`hud ${styles.box}${embedded ? ` ${styles.embedded}` : ""}`} aria-label="Ask Grok">
        {!kiosk && (
          <form className={`row ${styles.form}`} onSubmit={onSubmit}>
            <label htmlFor="agent-q" className="sr-only">Ask Grok</label>
            <input
              id="agent-q"
              className={styles.input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about the rocket"
              autoComplete="off"
              disabled={busy}
            />
            <button type="submit" className={`btn btn-accent ${styles.send}`} disabled={busy || text.trim() === ""}>
              {busy ? "Thinking" : "Send"}
            </button>
          </form>
        )}
        <div className={`row ${styles.starters}`} role="group" aria-label="Example questions">
          {AGENT_STARTERS.map((q) => (
            <button key={q.label} type="button" className={`btn btn-outline ${styles.starter}`} disabled={busy} onClick={() => void ask(q.text)}>
              {q.label}
            </button>
          ))}
        </div>
        {reply && (
          <div className={`card ${styles.reply}`} aria-live="polite">
            {!reply.ok && <span className="chip chip--bad">Couldn&apos;t reach Grok</span>}
            <p className={`lead ${styles.replyText}`}>{reply.text}</p>
          </div>
        )}
        {!kiosk && log.length > 0 && (
          <ul className={`muted ${styles.log}`} aria-label="What Grok did">
            {log.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
