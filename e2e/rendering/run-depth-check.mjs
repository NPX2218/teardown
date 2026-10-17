import { build } from "esbuild";
import { chromium } from "playwright";

const bundled = await build({ entryPoints: ["e2e/rendering/depth-check.ts"], bundle: true, write: false, format: "esm" });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.fulfill(route.request().url().endsWith("/main.js")
    ? { contentType: "text/javascript", body: bundled.outputFiles[0].text }
    : { contentType: "text/html", body: '<!doctype html><title>Flight shader checks</title><script type="module" src="/main.js"></script>' }));
  await page.goto("http://flight-shader-check.local/");
  const result = JSON.parse(await page.locator("#depth-results").innerText({ timeout: 30_000 }));
  console.log(JSON.stringify(result, null, 2));
  if (result.passed !== result.total) process.exitCode = 1;
} finally {
  await browser.close();
}
