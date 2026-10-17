// lib/imagine/prompt.ts — grounded Grok Imagine prompt (09 Task 2). Owner: Anders.
// Pure and browser-safe: the client and the route both import it. No secrets, no fetch.

// 00-index Global Constraints: image calls are slower than text, so 30 s instead of the 8 s text timeout.
export const IMAGE_TIMEOUT_MS = 30000;

// Plan 09 Task 2: "Max 1,000 characters (truncate `role` first)".
export const MAX_PROMPT_CHARS = 1000;
// A part name is a few words; 120 is a guess (tune Saturday) that only stops a junk name from eating the budget.
export const MAX_NAME_CHARS = 120;

/** Used when the request text is empty. Also what the "Show in action" button sends (plan 09 Task 4 Step 1). */
export const DEFAULT_IMAGINE_PROMPT = "Show this part in action";

// Fixed style line, word for word from plan 09 Task 2.
export const STYLE_LINE =
  "Photorealistic, cinematic, real Falcon 9 hardware, accurate proportions, no logos or text.";

/** Only the fields the prompt reads, so tests can pass plain objects. */
export interface ImagineSubject {
  name: string;
  role: string;
}

const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * "<request>\nSubject: <name>, <role>\n<style line>", at most MAX_PROMPT_CHARS long.
 * Plan 09: "truncate role first". The role is cut to whatever room is left; only when even an empty role does not
 * fit is the request cut too. The style line and the name are never cut (the name is capped at MAX_NAME_CHARS).
 */
export function buildImaginePrompt(part: ImagineSubject, userPrompt: string): string {
  const name = tidy(String(part.name ?? "")).slice(0, MAX_NAME_CHARS);
  const subject = `\nSubject: ${name}`;
  const tail = `\n${STYLE_LINE}`;
  const requestRoom = MAX_PROMPT_CHARS - subject.length - tail.length;
  const request = tidy(String(userPrompt ?? "")).slice(0, requestRoom) || DEFAULT_IMAGINE_PROMPT;
  const head = `${request}${subject}`;
  const role = tidy(String(part.role ?? ""));
  const room = MAX_PROMPT_CHARS - head.length - tail.length - ", ".length;
  if (!role || room < 1) return head + tail;
  const shown = role.length <= room ? role : `${role.slice(0, room - 1).trimEnd()}…`;
  return `${head}, ${shown}${tail}`;
}
