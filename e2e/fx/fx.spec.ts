import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { test, type Browser, type Page } from "@playwright/test";

const ART = process.env.FX_ARTIFACTS || "/opt/cursor/artifacts/fx";
mkdirSync(ART, { recursive: true });

const SHOTS: ReadonlyArray<{ name: string; shot: string; frame: number; ageMin?: number }> = [
  { name: "liftoff", shot: "liftoff", frame: 18 },
  { name: "overhead", shot: "overhead", frame: 14 },
  { name: "climb", shot: "climb", frame: 10 },
  { name: "pad", shot: "pad", frame: 6 },
  { name: "max-q", shot: "max-q", frame: 8 },
  { name: "vacuum", shot: "vacuum", frame: 8 },
  { name: "staging", shot: "staging", frame: 4 },
  { name: "explosion", shot: "explosion", frame: 8, ageMin: 0.65 },
  { name: "clouds", shot: "clouds", frame: 6 },
];

async function waitForShot(page: Page, frame: number, ageMin?: number) {
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    const ready = await page.evaluate(({ frame: minFrame, ageMin: minAge }: { frame: number; ageMin: number | null }) => {
      const fx = window as unknown as { __fxFrame?: number; __fxAge?: number };
      const frames = fx.__fxFrame ?? 0;
      const age = fx.__fxAge ?? 0;
      return frames >= minFrame && (minAge == null || age >= minAge);
    }, { frame, ageMin: ageMin ?? null });
    if (ready) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("fx preview did not draw a frame");
}

async function litPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return 0;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return 0;
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 70) lit += 1;
    }
    return lit;
  }) as Promise<number>;
}

test("rocket fx screenshots", async ({ browser }: { browser: Browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  for (const shot of SHOTS) {
    await page.goto(`/?shot=${shot.shot}`);
    await waitForShot(page, shot.frame, shot.ageMin);
    const lit = await litPixels(page);
    if (lit <= 80) throw new Error(`${shot.name} drew only ${lit} bright samples`);
    await page.screenshot({ path: resolve(ART, `${shot.name}.png`) });
  }

  const errors = await page.evaluate(() => (window as unknown as { __fxErrors?: string[] }).__fxErrors ?? []) as string[];
  if (errors.length > 0) throw new Error(errors.join("\n"));
  await context.close();
});
