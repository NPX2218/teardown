import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const port = Number(process.env.FX_PORT || 3319);
const artifacts = process.env.FX_ARTIFACTS || "/opt/cursor/artifacts/fx";

export default defineConfig({
  testDir: ".",
  testMatch: "fx.spec.ts",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "node e2e/fx/serve.mjs",
    cwd: resolve(__dirname, "../.."),
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { ...process.env, FX_PORT: String(port) },
  },
  outputDir: resolve(artifacts, "test-results"),
});
