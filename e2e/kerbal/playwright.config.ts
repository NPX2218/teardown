import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const appDir = resolve(process.env.KERBAL_APP_DIR || process.cwd());
const artifacts = resolve(process.env.KERBAL_ARTIFACTS || "test-results/kerbal");
const port = Number(process.env.KERBAL_PORT || 3222);
// The October 17 phone-steering verification runs while a visitor uses the tunnel.
// That tunnel owns the usual local relay port and must keep serving their handset.
// Let the isolated browser suite choose its own relay without stopping the preview.
// Both the exhibit and simulated handset use this same value.
// The default remains the standalone test relay used by the existing test command.
const relayPort = Number(process.env.KERBAL_RELAY_PORT || 8787);

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: resolve(artifacts, "playwright-report.json") }]],
  outputDir: resolve(artifacts, "results"),
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
      port: relayPort,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...process.env, ROCKET_RELAY_PORT: String(relayPort) },
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
        NEXT_PUBLIC_ROCKET_RELAY_URL: `ws://127.0.0.1:${relayPort}`,
      },
    },
  ],
});
