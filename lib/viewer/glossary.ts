export interface GlossarySegment { text: string; term?: string; definition?: string }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function splitGlossary(text: string, glossary: Record<string, string>): GlossarySegment[] {
  if (text === "") return [];
  const terms = Object.keys(glossary).filter((t) => t.trim() !== "").sort((a, b) => b.length - a.length);
  if (terms.length === 0) return [{ text }];
  const byLower = new Map(terms.map((t) => [t.toLowerCase(), t]));
  const re = new RegExp(`(?<![A-Za-z0-9])(${terms.map(escapeRe).join("|")})s?(?![A-Za-z0-9])`, "gi");
  const out: GlossarySegment[] = [];
  let last = 0;
  for (const m of Array.from(text.matchAll(re))) {
    const start = m.index ?? 0;
    const key = byLower.get(m[1].toLowerCase());
    if (key === undefined) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: m[0], term: key, definition: glossary[key] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
