/**
 * Rebuild the offline bundle in public/presentation/.
 * Does not touch package.json. From a checkout that already has the bundle,
 * opening public/presentation/index.html does not need this script.
 *
 *   npm install --prefix /tmp/teardown-deck esbuild react@18.3.1 react-dom@18.3.1
 *   NODE_PATH=/tmp/teardown-deck/node_modules node components/presentation/build-preview.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(here, "../../public/presentation");
const esbuildBin = process.env.ESBUILD ?? "esbuild";

const result = spawnSync(
  esbuildBin,
  [
    resolve(here, "entry.tsx"),
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    "--minify",
    `--outdir=${outdir}`,
    "--entry-names=deck",
    "--loader:.woff2=file",
    "--asset-names=fonts/[name]",
    "--public-path=./",
  ],
  { stdio: "inherit", env: process.env },
);

if (result.status !== 0) process.exit(result.status ?? 1);
