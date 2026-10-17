import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const appDir = resolve(process.env.KERBAL_APP_DIR || process.cwd());
const artifacts = process.env.KERBAL_ARTIFACTS || "/opt/cursor/artifacts/kerbal";
const port = Number(process.env.KERBAL_PORT || 3222);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: resolve(artifacts, "playwright-report.json") }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    headless: true,
    launchOptions: { args: ["--use-angle=swiftshader", "--ignore-gpu-blocklist"] },
    actionTimeout: 15_000,
  },
  webServer: [
    {
      command: "npm run relay:dev",
      cwd: appDir,
      port: 8787,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, ROCKET_RELAY_PORT: "8787" },
    },
    {
      command: `npx next dev --hostname 127.0.0.1 --port ${port}`,
      cwd: appDir,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_ROCKET_RELAY: "local",
        NEXT_PUBLIC_ROCKET_RELAY_URL: "ws://127.0.0.1:8787",
      },
    },
  ],
});
