import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  it("XAI_API_KEY is read only in the server voice and text clients", () => {
    const hits: string[] = [];
    for (const file of [...walk(path.join(root, "lib")), ...walk(path.join(root, "app")), ...walk(path.join(root, "components"))]) {
      const text = readFileSync(file, "utf8");
      if (text.includes("XAI_API_KEY")) hits.push(path.relative(root, file));
      expect(text, path.relative(root, file)).not.toMatch(/NEXT_PUBLIC_XAI/);
    }
    expect(hits.sort()).toEqual(["lib/grok.ts", "lib/voice/xai.ts"]);
  });
});
