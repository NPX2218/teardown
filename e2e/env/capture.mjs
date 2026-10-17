import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import WebSocket from "ws";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = process.env.ENV_ARTIFACTS || "/opt/cursor/artifacts/env";
const port = 4177;
const shots = [
  ["starbase", "pad", "starbase-2m.png"],
  ["starbase", "chase", "starbase-chase.png"],
  ["starbase", "overhead", "starbase-overhead.png"],
  ["starbase", "1km", "starbase-1km.png"],
  ["starbase", "10km", "starbase-10km.png"],
  ["starbase", "60km", "starbase-60km.png"],
  ["cape", "pad", "cape-2m.png"],
];

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>html,body,#root{margin:0;height:100%;background:#07080c;overflow:hidden}</style>
</head>
<body><div id="root"></div><script src="/preview.js"></script></body>
</html>`;

function contentType(file) {
  if (file.endsWith(".js")) return "text/javascript";
  if (file.endsWith(".webp")) return "image/webp";
  return "text/html";
}

async function buildBundle(file) {
  await esbuild.build({
    entryPoints: [path.join(root, "e2e/env/preview.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    outfile: file,
    jsx: "automatic",
    alias: { "@": root },
    define: { "process.env.NODE_ENV": '"production"' },
    legalComments: "none",
  });
}

function startServer(bundle) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/preview.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(readFileSync(bundle));
      return;
    }
    if (url.pathname.startsWith("/textures/")) {
      const file = path.join(root, "public", url.pathname);
      res.writeHead(200, { "content-type": contentType(file) });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  ws.on("message", (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function waitForJson(url) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chrome is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`chrome debug port did not open: ${url}`);
}

async function shot(send, site, name, file) {
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/?site=${site}&shot=${name}` });
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    const result = await send("Runtime.evaluate", {
      expression: "window.__envReady === true",
      returnByValue: true,
    });
    if (result.result?.value === true) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`scene was not ready for ${file}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const png = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(outDir, file), Buffer.from(png.data, "base64"));
  console.log("wrote", file);
}

const bundle = path.join(outDir, "preview.js");
mkdirSync(outDir, { recursive: true });
await buildBundle(bundle);
const server = await startServer(bundle);
const chrome = spawn("google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--no-sandbox",
  "--remote-debugging-port=9222",
  "--user-data-dir=/tmp/chrome-env-19a",
  "--window-size=1440,900",
  "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

try {
  const version = await waitForJson("http://127.0.0.1:9222/json/version");
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    browser.once("open", resolve);
    browser.once("error", reject);
  });
  const browserSend = cdp(browser);
  const { targetId } = await browserSend("Target.createTarget", { url: "about:blank" });
  const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
  const pageTarget = list.find((target) => target.id === targetId);
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error("missing page target");
  const { webSocketDebuggerUrl } = pageTarget;
  const page = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    page.once("open", resolve);
    page.once("error", reject);
  });
  const send = cdp(page);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const [site, name, file] of shots) await shot(send, site, name, file);
  page.close();
  browser.close();
} finally {
  chrome.kill();
  server.close();
}
