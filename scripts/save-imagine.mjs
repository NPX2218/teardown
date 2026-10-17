// scripts/save-imagine.mjs — one-off: ask the running dev server for a picture and save the demo cache file.
// Usage: npm run dev (in another terminal), with XAI_API_KEY and XAI_IMAGE_MODEL set, then
//   node scripts/save-imagine.mjs legs "the booster landing on a droneship at night, legs out"
// This script does not invent bytes. If the route fails, it exits without writing a file.
import { mkdir, writeFile } from "node:fs/promises";

const [partId, prompt] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
if (!partId || !prompt) {
  console.error('usage: node scripts/save-imagine.mjs <partId> "<prompt>"');
  process.exit(1);
}

const res = await fetch(`${base}/api/imagine`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ partId, prompt }),
  signal: AbortSignal.timeout(35_000),
});
const json = await res.json();
if (!res.ok) {
  console.error("failed:", res.status, json.error);
  process.exit(1);
}
if (typeof json.url !== "string") {
  console.error("failed: response had no picture url");
  process.exit(1);
}

let bytes;
if (json.url.startsWith("data:")) {
  bytes = Buffer.from(json.url.slice(json.url.indexOf(",") + 1), "base64");
} else {
  const img = await fetch(json.url, { signal: AbortSignal.timeout(30_000) });
  if (!img.ok) {
    console.error("download failed:", img.status);
    process.exit(1);
  }
  bytes = Buffer.from(await img.arrayBuffer());
}
await mkdir("public/imagine", { recursive: true });
await writeFile(`public/imagine/${partId}.jpg`, bytes);
console.log(`saved public/imagine/${partId}.jpg (${bytes.length} bytes)`);
