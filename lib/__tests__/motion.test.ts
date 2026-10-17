import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTION_DURATION_S, MOTION_EASE, MOTION_PACKAGE_VERSION } from "@/lib/ui/motion";

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1].trim();
}

function bezier(values: readonly number[]): string {
  return `cubic-bezier(${values.join(", ")})`;
}

describe("motion presets", () => {
  it("M1 durations and easings match the theme tokens", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    expect(token(css, "--dur-fast")).toBe(`${MOTION_DURATION_S.fast}s`);
    expect(token(css, "--dur")).toBe(`${MOTION_DURATION_S.base}s`);
    expect(token(css, "--dur-slow")).toBe(`${MOTION_DURATION_S.slow}s`);
    expect(token(css, "--ease-ui")).toBe(bezier(MOTION_EASE.ui));
    expect(token(css, "--ease-out")).toBe(bezier(MOTION_EASE.out));
    expect(token(css, "--ease-overlay")).toBe(bezier(MOTION_EASE.overlay));
  });

  it("M2 pins motion directly and does not add a second direct runtime", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.motion).toBe(MOTION_PACKAGE_VERSION);
    expect(pkg.dependencies["framer-motion"]).toBeUndefined();
    expect(pkg.devDependencies["framer-motion"]).toBeUndefined();
  });
});
