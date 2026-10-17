/**
 * Bundles the FX preview and serves it for the Playwright screenshots.
 * Does not touch the Next app.
 */
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const port = Number(process.env.FX_PORT || 3319);
const outDir = resolve("/tmp/fx-preview");
mkdirSync(outDir, { recursive: true });

function loadEsbuild() {
  try {
    return createRequire(import.meta.url)("esbuild");
  } catch {
    const prefix = "/tmp/fx-esbuild";
    const installed = spawnSync("npm", ["install", "--prefix", prefix, "esbuild@0.25.5", "--no-audit", "--no-fund"], {
      stdio: "inherit",
    });
    if (installed.status !== 0) throw new Error("esbuild install failed");
    return createRequire(resolve(prefix, "package.json"))("esbuild");
  }
}

const esbuild = loadEsbuild();
await esbuild.build({
  absWorkingDir: root,
  entryPoints: [resolve(here, "preview.tsx")],
  outfile: resolve(outDir, "preview.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  alias: { "@": root },
  define: { "process.env.NODE_ENV": "\"production\"" },
  logLevel: "info",
});

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Rocket FX</title>
  <style>
    html, body, #root { margin: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/preview.js"></script>
</body>
</html>
`;
writeFileSync(resolve(outDir, "index.html"), html);

const server = createServer((req, res) => {
  const url = req.url?.split("?")[0] ?? "/";
  if (url === "/preview.js") {
    res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    res.end(read(resolve(outDir, "preview.js")));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});

function read(path) {
  return createRequire(import.meta.url)("node:fs").readFileSync(path);
}

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`fx preview http://127.0.0.1:${port}\n`);
});
