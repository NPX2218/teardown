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

function startSim(replay = "steer.json"): { stop: () => Promise<void> } {
  const child: ChildProcess = spawn(
    "npx",
    ["tsx", "scripts/sim-phone.ts", CODE, "--mount", "s24fe", "--replay", resolve(__dirname, replay)],
    {
      cwd: APP,
      env: {
        ...process.env,
        NEXT_PUBLIC_ROCKET_RELAY: "local",
        NEXT_PUBLIC_ROCKET_RELAY_URL: `ws://127.0.0.1:${process.env.KERBAL_RELAY_PORT || 8787}`,
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
  return Number(await page.locator("#flight-status").getAttribute("data-altitude-m") ?? 0) / 1000;
}

// Inspect the rendered canvas rather than its CSS clear color: atmosphere meshes can paint over black.
async function expectBlackSky(page: Page): Promise<void> {
  const png = await page.locator("[data-flight-mode='mission'] canvas").screenshot();
  const mean = await page.evaluate(async (base64) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(Math.floor(image.width * 0.7), Math.floor(image.height * 0.05), 40, 20).data;
    let brightness = 0;
    for (let i = 0; i < pixels.length; i += 4) brightness += Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    return brightness / (pixels.length / 4);
  }, png.toString("base64"));
  expect(mean, "Open sky stays black, allowing sparse stars").toBeLessThan(3);
}

test("phone steers custom flight and an optional mission guide", async ({ browser }) => {
  const view = await pair(browser);
  try {
    await readyMission(view.laptop);
    await view.laptop.screenshot({ path: resolve(ART, "pad.png") });
    let sim = startSim();
    try {
      await view.laptop.getByRole("button", { name: "Calibrate phone", exact: true }).click();
      await expect(view.phone.getByText("ARMED", { exact: true })).toBeVisible({ timeout: 20_000 });
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#throttle-control", 70);
      await expect.poll(async () => {
        return Math.abs(Number(await view.laptop.locator("[data-flight-mode='mission']").getAttribute("data-flight-pitch"))) * 180 / Math.PI;
      }).toBeGreaterThan(8); // 28° hand lean becomes 12.06° after the gentle quadratic response.
      await expect(view.laptop.locator("[data-map-marker]")).toHaveCount(0);
      await expect(view.laptop.getByRole("button", { name: "Calibrate phone", exact: true })).toHaveCount(0);
      await expect(view.laptop.locator("#flight-status")).toContainText("Carbon dioxide so far");
      await expect(view.laptop.locator("#flight-status")).not.toContainText("Height");
      await expect(view.laptop.getByRole("region", { name: "Flight controls", exact: true }).getByRole("button")).toHaveCount(2);
      await view.laptop.screenshot({ path: resolve(ART, "liftoff.png") });

      // Phone is the only steering control, including after pause and retry.
      await view.laptop.locator("[data-flight-mode='mission']").focus();
      await view.laptop.keyboard.press("Space");
      await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "paused");
      await view.laptop.waitForTimeout(3000);
      await view.laptop.screenshot({ path: resolve(ART, "phone-paused-settled.png") });
      await expect(view.laptop.getByRole("button", { name: "Use screen tilt", exact: true })).toHaveCount(0);
      await expect(view.laptop.getByRole("button", { name: "Use phone tilt", exact: true })).toHaveCount(0);
      await expect(view.laptop.locator("#pitch-control")).toHaveCount(0);
      await view.laptop.getByRole("button", { name: "Resume", exact: true }).click();
      await setRange(view.laptop, "#throttle-control", 70);
      await retryMission(view.laptop);
      await view.laptop.locator("#launch-flight").click();
      await expect(view.laptop.locator("#pitch-control")).toHaveCount(0);

      await retryMission(view.laptop);
      await view.laptop.getByRole("button", { name: "Mission", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Practice sample" }).click();
      await sim.stop();
      sim = startSim();
      await view.laptop.getByRole("button", { name: "Calibrate phone", exact: true }).click();
      await expect(view.phone.getByText("ARMED", { exact: true })).toBeVisible();
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#throttle-control", 60);
      await expect.poll(async () => {
        return Math.abs(Number(await view.laptop.locator("[data-flight-mode='mission']").getAttribute("data-flight-pitch"))) * 180 / Math.PI;
      }).toBeGreaterThan(8);

      // The same controls pause/resume both choices; the guide never owns the vehicle.
      await view.laptop.getByRole("button", { name: "Pause flight", exact: true }).click();
      const stage = view.laptop.locator("[data-flight-mode='mission']");
      const stoppedAt = await stage.getAttribute("data-flight-time");
      await view.laptop.waitForTimeout(350);
      await expect(stage).toHaveAttribute("data-flight-time", stoppedAt!);
      await view.laptop.getByRole("button", { name: "Resume", exact: true }).click();
      await expect.poll(async () => Number(await stage.getAttribute("data-flight-time"))).toBeGreaterThan(Number(stoppedAt));
      await expect(view.laptop.locator("[data-banner], [data-deviation]")).toHaveCount(0);
      await retryMission(view.laptop);
      await view.laptop.getByRole("button", { name: "Custom flight", exact: true }).click();
      await view.laptop.getByText("Flight options", { exact: true }).click();
      await view.laptop.getByRole("button", { name: "Short hop", exact: true }).click();
      await view.laptop.locator("#warp-8").click();
      await view.laptop.locator("#launch-flight").click();
      await setRange(view.laptop, "#throttle-control", 100);
      await expect.poll(() => heightKm(view.laptop), { timeout: 30_000 }).toBeGreaterThan(0.01);
      await setRange(view.laptop, "#throttle-control", 0);
      await expect(view.laptop.locator("[data-outcome='crashed']")).toBeVisible({ timeout: 40_000 });
      await expect(view.laptop.getByRole("dialog")).toBeVisible();
      await view.laptop.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Try again", exact: true }).click();
      await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
    } finally {
      await sim.stop();
    }
  } finally {
    await save(view, "steer");
  }
});

test("presentation reveals Earth curvature within forty seconds and offers realistic pacing", async ({ browser }) => {
  const view = await pair(browser);
  let sim: ReturnType<typeof startSim> | null = null;
  try {
    await readyMission(view.laptop);
    await expect(view.laptop.locator("#warp-8")).toHaveAttribute("aria-pressed", "true");
    sim = startSim("upright.json");
    await view.laptop.getByRole("button", { name: "Calibrate phone", exact: true }).click();
    await expect(view.phone.getByText("ARMED", { exact: true })).toBeVisible();
    await view.laptop.locator("#launch-flight").click();
    await setRange(view.laptop, "#throttle-control", 70);
    const started = Date.now();
    await expect.poll(() => heightKm(view.laptop), { timeout: 40_000 }).toBeGreaterThan(150);
    expect(Date.now() - started).toBeLessThan(40_000);
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "flying");
    await expect(view.laptop.getByRole("button", { name: "Calibrate phone", exact: true })).toHaveCount(0);
      await expect(view.laptop.locator("#flight-status")).toContainText("Carbon dioxide so far");
    const panel = view.laptop.getByRole("region", { name: "Flight controls", exact: true });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThan(1440 * 0.65);
    await view.laptop.screenshot({ path: resolve(ART, "presentation-curvature.png") });
    await view.laptop.getByRole("button", { name: "Pause flight", exact: true }).click();
    await view.laptop.locator("#warp-1").click();
    await expect(view.laptop.locator("#warp-1")).toHaveAttribute("aria-pressed", "true");
    await view.laptop.getByRole("button", { name: "Resume", exact: true }).click();
    const stage = view.laptop.locator("[data-flight-mode='mission']");
    const before = Number(await stage.getAttribute("data-flight-time"));
    await view.laptop.waitForTimeout(400);
    expect(Number(await stage.getAttribute("data-flight-time")) - before).toBeLessThan(1);
  } finally {
    await sim?.stop(); await save(view, "presentation");
  }
});

test("flight waits for a phone and exposes no screen steering", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  await page.goto("/?demo=1");
  await readyMission(page);
  await page.screenshot({ path: resolve(ART, "phone-required.png") });
  await expect(page.locator("#launch-flight")).toBeDisabled();
  await expect(page.getByText("Waiting for your phone. Connect it to launch.")).toBeVisible();
  await expect(page.locator("#pitch-control")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Use (screen|phone) tilt/ })).toHaveCount(0);
  await expect(page.locator("[data-map-marker]")).toHaveCount(0);
  const stage = page.locator("[data-flight-mode='mission']");
  await stage.focus();
  await page.keyboard.press("Space");
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
    await expectBlackSky(page);
    await expect(page.getByRole("button", { name: "Flight replay", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Mission", exact: true }).click();
    await page.getByRole("button", { name: "Practice sample", exact: true }).click();
    await expect(page.getByText("Simulated practice route, not a historical flight.", { exact: false })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator("[data-map-marker]")).toHaveCount(0);
    await page.screenshot({ path: resolve(ART, `transition-${cycle}-practice-guide.png`) });
    await page.getByRole("button", { name: /Sentinel-6/ }).click();
    await expect(page.getByText("Reference trajectory unavailable", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Custom flight", exact: true }).click();
    await expect(page.getByRole("button", { name: "Custom flight", exact: true })).toHaveAttribute("aria-pressed", "true");
    if (cycle === 1) {
      await page.getByRole("button", { name: "About", exact: true }).click();
      await expect(page.getByRole("heading", { name: "How flight paths reach the globe", exact: true })).toBeVisible();
      await expect(page.getByText(/no reusable measured trajectory/)).toBeVisible();
      await page.getByRole("button", { name: "Back to the rocket", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Explore", exact: true }).click();
    await expect(page.locator("[data-flight-mode]")).toHaveCount(0);
  }
});
