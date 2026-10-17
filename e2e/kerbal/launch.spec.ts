import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const CODE = "ABCD";
const APP = resolve(process.env.KERBAL_APP_DIR || process.cwd());
const ART = resolve(process.env.KERBAL_ARTIFACTS || "test-results/kerbal");
const VIDEO_TMP = "/tmp/teardown-kerbal-video";
mkdirSync(ART, { recursive: true });
mkdirSync(VIDEO_TMP, { recursive: true });

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

let browserErrors: string[] = [];

async function watchBrowserErrors(page: Page): Promise<void> {
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /THREE\.WebGLProgram|shader.*(?:error|failed)|(?:GL_)?INVALID_(?:OPERATION|VALUE|ENUM)|WebGL.*(?:error|failed)/i.test(message.text())) {
      browserErrors.push(message.text());
    }
  });
  // Mode tests exercise local media fallbacks without paid image or narration requests.
  for (const endpoint of ["imagine", "voice"] as const) {
    await page.route(`**/api/${endpoint}`, (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Media generation is unavailable in browser tests." }),
    }));
  }
}

test.beforeEach(async ({ page }) => {
  browserErrors = [];
  await watchBrowserErrors(page);
});

test.afterEach(() => {
  expect(browserErrors, "Unhandled browser errors and shader failures").toEqual([]);
});

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

function startSim(): { stop: () => Promise<void> } {
  const child: ChildProcess = spawn(
    "npx",
    ["tsx", "scripts/sim-phone.ts", CODE, "--mount", "s24fe", "--replay", resolve(__dirname, "steer.json")],
    {
      cwd: APP,
      env: {
        ...process.env,
        NEXT_PUBLIC_ROCKET_RELAY: "local",
        NEXT_PUBLIC_ROCKET_RELAY_URL: "ws://127.0.0.1:8787",
      },
      stdio: "ignore",
    },
  );
  const stopped = new Promise<void>((done) => child.on("exit", () => done()));
  return {
    stop: async () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      await Promise.race([stopped, new Promise((done) => setTimeout(done, 3000))]);
    },
  };
}

async function pair(browser: Browser): Promise<{ laptop: Page; phone: Page; laptopContext: BrowserContext; phoneContext: BrowserContext }> {
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
  });
  await phoneContext.addInitScript({ content: PHONE_STUB });
  const laptop = await laptopContext.newPage();
  const phone = await phoneContext.newPage();
  await Promise.all([watchBrowserErrors(laptop), watchBrowserErrors(phone)]);
  await laptop.goto("/?demo=1");
  await expect(laptop.getByText(CODE, { exact: true })).toBeVisible();
  await phone.goto(`/rocket?code=${CODE}&debug=1`);
  await phone.getByRole("button", { name: "Tap to start your rocket" }).click();
  await expect(phone.getByText(`Connected to exhibit ${CODE}`)).toBeVisible();
  return { laptop, phone, laptopContext, phoneContext };
}

async function save(
  view: { laptop: Page; laptopContext: BrowserContext; phoneContext: BrowserContext },
  name: string,
): Promise<void> {
  const laptopVideo = view.laptop.video();
  await view.laptopContext.close();
  await view.phoneContext.close();
  if (laptopVideo) await laptopVideo.saveAs(resolve(ART, `${name}.webm`));
}

async function readyMission(laptop: Page): Promise<void> {
  await laptop.getByRole("button", { name: "Your mission" }).click();
  await expect(laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
  await expect(laptop.locator("[data-flight-mode='mission'] canvas")).toBeVisible({ timeout: 30_000 });
}

async function retryMission(laptop: Page): Promise<void> {
  await laptop.locator("[data-flight-mode='mission']").focus();
  await laptop.keyboard.press("r");
  await expect(laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
}

async function setRange(page: Page, id: string, percent: number): Promise<void> {
  const slider = page.locator(id);
  await expect(slider).toBeEnabled();
  await slider.evaluate((el: HTMLInputElement, value: number) => {
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    proto?.set?.call(el, String(value));
    const tracker = (el as HTMLInputElement & { _valueTracker?: { setValue: (next: string) => void } })._valueTracker;
    tracker?.setValue("");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, percent);
}

async function heightKm(page: Page): Promise<number> {
  const text = await page.locator("#flight-status").innerText();
  const match = text.match(/Height\s+([0-9.]+)\s*km/i);
  return match ? Number(match[1]) : 0;
}

test("phone steers free flight, mission, and replay", async ({ browser }) => {
  const view = await pair(browser);
  try {
    await readyMission(view.laptop);
    await view.laptop.screenshot({ path: resolve(ART, "pad.png") });
    let sim = startSim();
    try {
      await view.laptop.getByRole("button", { name: "Use phone tilt" }).click();
      await expect(view.phone.getByText("ARMED", { exact: true })).toBeVisible({ timeout: 20_000 });
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#throttle-control", 70);
      await expect.poll(async () => {
        const text = await view.laptop.locator("#flight-status").innerText();
        const match = text.match(/tilt\s+(-?\d+)/i);
        return match ? Math.abs(Number(match[1])) : 0;
      }).toBeGreaterThan(15);
      await expect(view.laptop.locator("[data-map-marker]")).toHaveCount(0);
      await view.laptop.screenshot({ path: resolve(ART, "liftoff.png") });

      // REGRESSION GUARD for PR #34: a connected phone must honor screen handoff.
      await view.laptop.locator("[data-flight-mode='mission']").focus();
      await view.laptop.keyboard.press("Space");
      await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "paused");
      await view.laptop.waitForTimeout(3000);
      await view.laptop.screenshot({ path: resolve(ART, "phone-paused-settled.png") });
      await view.laptop.getByRole("button", { name: "Use screen tilt", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Resume", exact: true }).click();
      await setRange(view.laptop, "#pitch-control", 12);
      await expect(view.laptop.locator("#pitch-control")).toHaveValue("12");
      await retryMission(view.laptop);
      await view.laptop.getByRole("button", { name: "Use phone tilt", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Use screen tilt", exact: true }).click();
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#pitch-control", 10);
      await expect(view.laptop.locator("#pitch-control")).toHaveValue("10");

      await retryMission(view.laptop);
      await view.laptop.getByRole("button", { name: "Mission", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Practice sample" }).click();
      await view.laptop.getByRole("button", { name: "Use phone tilt", exact: true }).click();
      await sim.stop();
      sim = startSim();
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#throttle-control", 60);
      await expect.poll(async () => {
        const text = await view.laptop.locator("#flight-status").innerText();
        const match = text.match(/tilt\s+(-?\d+)/i);
        return match ? Math.abs(Number(match[1])) : 0;
      }).toBeGreaterThan(15);

      await view.laptop.getByRole("button", { name: "Flight replay" }).click();
      await view.laptop.getByRole("button", { name: "Practice sample" }).click();
      await view.laptop.locator("[data-flight-mode='replay']").click();
      await view.laptop.keyboard.down("w");
      await expect(view.laptop.locator("[data-flight-status='flying']")).toBeVisible({ timeout: 15_000 });
      await view.laptop.keyboard.up("w");
      await expect.poll(async () => {
        const raw = await view.laptop.locator("[data-flight-mode='replay']").getAttribute("data-flight-pitch");
        return Math.abs(Number(raw ?? 0));
      }).toBeGreaterThan(0.2);
      await expect(view.laptop.locator("[data-map-marker]")).toHaveCount(0);
      await view.laptop.screenshot({ path: resolve(ART, "replay-steering.png") });

      // REGRESSION GUARD for PR #34: replay playback also controls the steered rocket.
      const replayPanel = view.laptop.getByRole("region", { name: "Flight replay", exact: true });
      const pause = replayPanel.getByRole("button", { name: "Pause", exact: true });
      if (!(await pause.isVisible())) await replayPanel.getByRole("button", { name: "Play", exact: true }).click();
      await pause.click();
      await expect(view.laptop.locator("[data-flight-mode='replay']")).toHaveAttribute("data-flight-status", "paused");
      const replayStage = view.laptop.locator("[data-flight-mode='replay']");
      const stoppedAt = await replayStage.getAttribute("data-flight-time");
      // Observe several frames with the simulator still sending tilt samples.
      await view.laptop.waitForTimeout(350);
      await expect(replayStage).toHaveAttribute("data-flight-time", stoppedAt!);
      await replayPanel.getByRole("button", { name: "Play", exact: true }).click();
      await expect(view.laptop.locator("[data-flight-mode='replay']")).toHaveAttribute("data-flight-status", "flying");
      await expect.poll(async () => Number(await replayStage.getAttribute("data-flight-time"))).toBeGreaterThan(Number(stoppedAt));
      await replayPanel.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(view.laptop.locator("[data-flight-mode='replay']")).toHaveAttribute("data-flight-status", "idle");
    } finally {
      await sim.stop();
    }
  } finally {
    await save(view, "steer");
  }
});

test("screen controls climb, pause, retry, and crash without a phone", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.goto("/?demo=1");
  await readyMission(page);
  await page.screenshot({ path: resolve(ART, "screen-pad.png") });
  await page.getByRole("button", { name: "Free flight", exact: true }).click();
  await page.locator("#launch-flight").click();
  await setRange(page, "#throttle-control", 100);
  await expect.poll(() => heightKm(page), { timeout: 30_000 }).toBeGreaterThan(0.1);
  await expect(page.locator("[data-map-marker]")).toHaveCount(0);
  await page.screenshot({ path: resolve(ART, "screen-climb.png") });
  await setRange(page, "#pitch-control", 18);
  await expect(page.locator("#pitch-control")).toHaveValue("18");
  const stage = page.locator("[data-flight-mode='mission']");
  await stage.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#flight-status")).toHaveAttribute("data-status", "paused");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator("#flight-status")).toHaveAttribute("data-status", "flying");
  await retryMission(page);
  await expect(page.locator("#throttle-control")).toHaveValue("0");
  await expect(page.locator("#pitch-control")).toHaveValue("0");
  await page.getByRole("button", { name: "Short hop", exact: true }).click();
  await page.locator("#warp-8").click();
  await page.locator("#launch-flight").click();
  await setRange(page, "#throttle-control", 100);
  // Leave the pad before tilting: a horizontal rocket with no altitude cannot fall.
  await expect.poll(() => heightKm(page), { timeout: 30_000 }).toBeGreaterThan(0.01);
  await setRange(page, "#pitch-control", 85);
  await expect(page.locator("[data-outcome='crashed']")).toBeVisible({ timeout: 40_000 });
  // The optional mission-patch dialog covers the retry button after an outcome.
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.screenshot({ path: resolve(ART, "crash.png") });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("#flight-status")).toHaveAttribute("data-status", "ready");
  await stage.focus();
  await page.keyboard.press("m");
  await expect(page.locator("[data-flight-view='overview']")).toBeVisible();
  const markers = page.locator("[data-map-marker]");
  await expect(markers.first()).toBeVisible();
  for (const marker of await markers.all()) {
    const bounds = await marker.boundingBox();
    expect(bounds?.width).toBeLessThan(300);
    expect(bounds?.height).toBeLessThan(80);
  }
  await page.screenshot({ path: resolve(ART, "map.png") });
});

test("normal mode transitions keep map geometry out of the flight view", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.goto("/?demo=1");
  for (const cycle of [1, 2]) {
    await readyMission(page);
    await page.screenshot({ path: resolve(ART, `transition-${cycle}-mission-load.png`) });
    await page.waitForTimeout(800);
    await expect(page.locator("[data-map-marker]")).toHaveCount(0);
    await page.screenshot({ path: resolve(ART, `transition-${cycle}-mission-ready.png`) });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: resolve(ART, `transition-${cycle}-mission-settled.png`) });
    await page.getByRole("button", { name: "Flight replay", exact: true }).click();
    await page.getByRole("button", { name: "Practice sample", exact: true }).click();
    const panel = page.getByRole("region", { name: "Flight replay", exact: true });
    await panel.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.locator("[data-map-marker]")).toHaveCount(0);
    await page.screenshot({ path: resolve(ART, `transition-${cycle}-replay.png`) });
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(page.locator("[data-flight-mode]")).toHaveCount(0);
  }
});
