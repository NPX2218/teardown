import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The only modules allowed to read the xAI key. Missing files are fine. Extra files are not. */
export const SERVER_ONLY_KEY_MODULES = [
  "lib/grok.ts",
  "lib/voice/xai.ts",
  "lib/imagine/server.ts",
  "app/api/imagine/route.ts",
] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "__tests__") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|md)$/.test(name)) out.push(full);
  }
  return out;
}

describe("secrets stay server-only", () => {
  it("XAI_API_KEY is read only in the server-only allow-list", () => {
    const allow = new Set<string>(SERVER_ONLY_KEY_MODULES);
    const hits: string[] = [];
    for (const file of [...walk(path.join(root, "lib")), ...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
      const text = readFileSync(file, "utf8");
      const relative = path.relative(root, file);
      if (text.includes("XAI_API_KEY")) hits.push(relative);
      expect(text, relative).not.toMatch(/NEXT_PUBLIC_XAI/);
    }
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.filter((file) => !allow.has(file))).toEqual([]);
    expect(hits).toContain("lib/grok.ts");
  });
});
