import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pagesExport = process.env.PAGES_EXPORT === "1";
const basePath = "/teardown";

// Route handlers (app/api/*) cannot be statically exported. Park them for this
// process only; the client already falls back when /api/* 404s. Restored on exit.
if (pagesExport) {
  process.env.NEXT_PUBLIC_BASE_PATH = basePath;
  // Same-browser phone pairing. Pages has no relay server.
  process.env.NEXT_PUBLIC_ROCKET_RELAY = "broadcast";
  parkApiRoutes(root);
}

/** @type {import('next').NextConfig} */
const nextConfig = pagesExport
  ? {
      output: "export",
      basePath,
      assetPrefix: basePath,
      trailingSlash: true,
      images: { unoptimized: true },
      env: {
        NEXT_PUBLIC_BASE_PATH: basePath,
        NEXT_PUBLIC_ROCKET_RELAY: "broadcast",
      },
      // app/api is parked, so tests that import those routes cannot typecheck.
      // The normal build (PAGES_EXPORT unset) still typechecks.
      typescript: { ignoreBuildErrors: true },
    }
  : {};

export default nextConfig;

function parkApiRoutes(rootDir) {
  const apiDir = path.join(rootDir, "app", "api");
  const parked = path.join(rootDir, ".pages-api-parked");
  const marker = path.join(rootDir, ".pages-api-parked-owner");

  const pidAlive = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  const readOwner = () => {
    try {
      return Number(readFileSync(marker, "utf8"));
    } catch {
      return NaN;
    }
  };

  const restore = () => {
    try {
      if (readOwner() !== process.pid) return;
      if (existsSync(parked) && !existsSync(apiDir)) renameSync(parked, apiDir);
      rmSync(marker, { force: true });
    } catch (err) {
      console.error("[pages] failed to restore app/api:", err);
    }
  };

  const claim = () => {
    writeFileSync(marker, String(process.pid));
    process.once("exit", restore);
    process.once("SIGINT", () => {
      restore();
      process.exit(130);
    });
    process.once("SIGTERM", () => {
      restore();
      process.exit(143);
    });
  };

  if (existsSync(apiDir)) {
    if (existsSync(parked)) rmSync(parked, { recursive: true, force: true });
    renameSync(apiDir, parked);
    claim();
    console.log("[pages] parked app/api for the static export");
    return;
  }

  if (existsSync(parked) && !pidAlive(readOwner())) claim();
}
