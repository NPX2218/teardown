import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const CODE = "ABCD";
const APP = resolve(process.env.SMOKE_APP_DIR || process.cwd());
const ART = process.env.SMOKE_ARTIFACTS || "/opt/cursor/artifacts/smoke";
const VIDEO_TMP = "/tmp/teardown-smoke-video";
const REPLAYS = resolve(__dirname, "replays");

mkdirSync(ART, { recursive: true });
mkdirSync(VIDEO_TMP, { recursive: true });

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

// Headless Chromium never fires motion events, so /rocket would hide the shell word after 3s.
// Dispatch still readings so the word stays, and drop the page's own frames so only sim-phone steers.
const PHONE_STUB = `
(() => {
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    let text = "";
    if (typeof data === "string") text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    if (text.includes('"k":"frame"') || text.includes('"k": "frame"')) return;
    return send.call(this, data);
  };
  const tick = () => {
    try {
      window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", {
        alpha: 0, beta: 0, gamma: 0, absolute: false,
      }));
      window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
        acceleration: { x: 0, y: 0, z: 0 },
        accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 },
        rotationRate: { alpha: 0, beta: 0, gamma: 0 },
        interval: 16,
      }));
    } catch (err) {
      window.__sensorStubError = String(err);
    }
  };
  setInterval(tick, 50);
})();
`;

interface Pair {
  laptop: Page;
  phone: Page;
  laptopContext: BrowserContext;
  phoneContext: BrowserContext;
}

async function pair(browser: Browser): Promise<Pair> {
  const laptopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO_TMP, size: { width: 1440, height: 900 } },
  });
  await laptopContext.addInitScript(() => {
    localStorage.setItem("teardown.demoPairCode", "ABCD");
  });
  const phoneContext = await browser.newContext({
    viewport: { width: 780, height: 360 },
    isMobile: true,
    hasTouch: true,
    userAgent: PHONE_UA,
    recordVideo: { dir: VIDEO_TMP, size: { width: 780, height: 360 } },
  });
  await phoneContext.addInitScript({ content: PHONE_STUB });
  const laptop = await laptopContext.newPage();
  const phone = await phoneContext.newPage();
  await laptop.goto("/?demo=1");
  await expect(laptop.getByText(CODE, { exact: true })).toBeVisible();
  await phone.goto(`/rocket?code=${CODE}&debug=1`);
  await phone.getByRole("button", { name: "Tap to start your rocket" }).click();
  await expect(phone.getByText(`Connected to exhibit ${CODE}`)).toBeVisible();
  return { laptop, phone, laptopContext, phoneContext };
}

function startSim(replay: string): { child: ChildProcess; output: () => string; stop: () => Promise<void> } {
  let text = "";
  const child = spawn(
    "npx",
    ["tsx", "scripts/sim-phone.ts", CODE, "--mount", "s24fe", "--replay", resolve(REPLAYS, replay)],
    {
      cwd: APP,
      env: {
        ...process.env,
        NEXT_PUBLIC_ROCKET_RELAY: "local",
        NEXT_PUBLIC_ROCKET_RELAY_URL: "ws://127.0.0.1:8787",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  const stopped = new Promise<void>((done) => {
    child.on("exit", () => done());
  });
  return {
    child,
    output: () => text,
    stop: async () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      await Promise.race([
        stopped,
        new Promise((done) => setTimeout(done, 3000)),
      ]);
    },
  };
}

async function save(pair: Pair, name: string): Promise<void> {
  const laptopVideo = pair.laptop.video();
  const phoneVideo = pair.phone.video();
  await pair.laptopContext.close();
  await pair.phoneContext.close();
  if (laptopVideo) await laptopVideo.saveAs(resolve(ART, `${name}-laptop.webm`));
  if (phoneVideo) await phoneVideo.saveAs(resolve(ART, `${name}-phone.webm`));
}

async function shot(pair: Pair, name: string): Promise<void> {
  await pair.laptop.screenshot({ path: resolve(ART, `${name}-laptop.png`) });
  await pair.phone.screenshot({ path: resolve(ART, `${name}-phone.png`) });
}

async function setThrottle(page: Page, percent: number): Promise<void> {
  const slider = page.locator("#throttle-control");
  await expect(slider).toBeEnabled();
  await slider.evaluate((el: HTMLInputElement, value: number) => {
    const input = el as HTMLInputElement;
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    proto?.set?.call(input, String(value));
    const tracker = (input as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } })._valueTracker;
    tracker?.setValue("");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, percent);
}

async function phoneWord(phone: Page, word: string): Promise<void> {
  // role=status is not named in this Chromium build, so the accessible name lookup misses the shell word.
  await expect(phone.getByText(word, { exact: true })).toBeVisible();
}

async function readyMission(laptop: Page): Promise<void> {
  await laptop.getByRole("button", { name: "Your mission" }).click();
  await expect(laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
  // The flight globe compiles on this click. Sensor frames during that stall
  // reset the 2s upright hold, so wait until the scene has painted.
  await expect(laptop.getByText("Earth imagery: NASA")).toBeVisible({ timeout: 30_000 });
}

async function finish(view: Pair, sim: { output: () => string; stop: () => Promise<void> } | null, name: string): Promise<void> {
  await shot(view, name).catch(() => {});
  if (sim) {
    writeFileSync(resolve(ART, `${name}-sim.txt`), sim.output());
    await sim.stop();
  }
  await save(view, name);
}

test("calibrate", async ({ browser }) => {
  const view = await pair(browser);
  const sim = startSim("still.json");
  try {
    await expect(view.laptop.getByRole("button", { name: "Calibrate" })).toBeVisible();
    await view.laptop.getByRole("button", { name: "Calibrate" }).click();
    await phoneWord(view.phone, "ARMED");
  } finally {
    await finish(view, sim, "calibrate");
  }
});

test("lift to launch", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  const sim = startSim("lift.json");
  try {
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "flying");
    await phoneWord(view.phone, "LIFTOFF");
  } finally {
    await finish(view, sim, "lift");
  }
});

test("tilt steering", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  const sim = startSim("tilt.json");
  try {
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "flying");
    await expect.poll(async () => {
      const text = await view.laptop.locator("#flight-status").innerText();
      const match = text.match(/tilt\s+(-?\d+)/i);
      return match ? Math.abs(Number(match[1])) : 0;
    }).toBeGreaterThan(15);
  } finally {
    await finish(view, sim, "tilt");
  }
});

test("flick to stage", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  const sim = startSim("flick.json");
  try {
    await expect(view.laptop.locator("#flight-status")).toContainText("Second stage");
  } finally {
    await finish(view, sim, "flick");
  }
});

test("nose-down abort", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  const sim = startSim("abort.json");
  try {
    await expect(view.laptop.getByText("Aborted: the rocket was held upside down.")).toBeVisible();
    await phoneWord(view.phone, "ABORT");
  } finally {
    await finish(view, sim, "abort");
  }
});

test("free-flight crash", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  await view.laptop.getByRole("button", { name: "Free flight" }).click();
  await view.laptop.getByRole("button", { name: "Short hop" }).click();
  await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
  // A lift impulse takes throttle ownership at ~12% and the short hop never leaves the pad.
  // Launch from the screen, keep throttle on the laptop, then let the phone tip it over.
  const sim = startSim("crash.json");
  try {
    await view.laptop.getByRole("button", { name: "Use phone tilt" }).click();
    await phoneWord(view.phone, "ARMED");
    await view.laptop.locator("#launch-flight").click();
    await setThrottle(view.laptop, 100);
    await expect(view.laptop.locator("[data-outcome='crashed']")).toBeVisible({ timeout: 30_000 });
  } finally {
    await finish(view, sim, "crash");
  }
});

test("mission drift warning then failure", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  await view.laptop.getByRole("button", { name: "Mission", exact: true }).click();
  await view.laptop.getByRole("button", { name: "Practice sample" }).click();
  const sim = startSim("drift.json");
  try {
    await view.laptop.locator("#launch-flight").click();
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "flying");
    await view.laptop.locator("#warp-8").click();
    await expect(view.laptop.getByText(/Drifting off track|Return to trajectory|Mission failed: off nominal/)).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await finish(view, sim, "drift");
  }
});

test("sentinel-6 milestones", async ({ browser }) => {
  const view = await pair(browser);
  await readyMission(view.laptop);
  await view.laptop.getByRole("button", { name: "Mission", exact: true }).click();
  await view.laptop.getByRole("button", { name: "Sentinel-6 Michael Freilich" }).click();
  await view.laptop.locator("#flight-status summary", { hasText: "About this flight" }).click();
  await expect(view.laptop.getByText("Reference trajectory unavailable").first()).toBeVisible();
  const sim = startSim("sentinel.json");
  try {
    await view.laptop.locator("#launch-flight").click();
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "flying");
    await view.laptop.locator("#warp-8").click();
    await expect(view.laptop.locator("#warp-8")).toHaveAttribute("aria-pressed", "true");
    await view.laptop.locator("#flight-status summary", { hasText: "More numbers" }).click();
    await expect(view.laptop.locator("#flight-status")).toContainText(/Milestones:.*liftoff/);
    await expect(view.laptop.locator("#flight-status")).toContainText("staging", { timeout: 45_000 });
    await expect(view.laptop.getByText("Reference trajectory unavailable").first()).toBeVisible();
  } finally {
    await finish(view, sim, "sentinel");
  }
});

test("mascot voice states", async ({ browser }) => {
  const view = await pair(browser);
  const states: Array<[string, string]> = [
    ["idle", "rest"],
    ["listening", "listening"],
    ["user-speaking", "user-speaking"],
    ["thinking", "thinking"],
    ["speaking", "talking"],
  ];
  try {
    await expect(view.laptop.locator("[data-mood]")).toBeVisible();
    for (const [state, mood] of states) {
      await view.laptop.evaluate((next: string) => {
        const hook = (window as unknown as { __teardownSetVoiceState?: (value: string) => void }).__teardownSetVoiceState;
        if (typeof hook !== "function") throw new Error("setVoiceState is not on window");
        hook(next);
      }, state);
      await expect(view.laptop.locator("[data-mood]")).toHaveAttribute("data-mood", mood);
      await view.laptop.screenshot({ path: resolve(ART, `mascot-${state}.png`) });
    }
    await view.phone.screenshot({ path: resolve(ART, "mascot-phone.png") });
  } finally {
    await save(view, "mascot");
  }
});
