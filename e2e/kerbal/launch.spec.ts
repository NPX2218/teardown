import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const CODE = "ABCD";
const APP = resolve(process.env.KERBAL_APP_DIR || process.cwd());
const ART = process.env.KERBAL_ARTIFACTS || "/opt/cursor/artifacts/kerbal";
mkdirSync(ART, { recursive: true });

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S721B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

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
  const laptopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
  await laptop.goto("/?demo=1");
  await expect(laptop.getByText(CODE, { exact: true })).toBeVisible();
  await phone.goto(`/rocket?code=${CODE}&debug=1`);
  await phone.getByRole("button", { name: "Tap to start your rocket" }).click();
  await expect(phone.getByText(`Connected to exhibit ${CODE}`)).toBeVisible();
  return { laptop, phone, laptopContext, phoneContext };
}

async function readyMission(laptop: Page): Promise<void> {
  await laptop.getByRole("button", { name: "Your mission" }).click();
  await expect(laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
  await expect(laptop.getByText("Earth imagery: NASA")).toBeVisible({ timeout: 30_000 });
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
    const sim = startSim();
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
      await view.laptop.screenshot({ path: resolve(ART, "liftoff.png") });

      await view.laptop.getByRole("button", { name: "Mission", exact: true }).click();
      await view.laptop.getByRole("button", { name: "Practice sample" }).click();
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
    } finally {
      await sim.stop();
    }
  } finally {
    await view.laptopContext.close();
    await view.phoneContext.close();
  }
});

test("climb screenshots and a crash", async ({ browser }) => {
  const view = await pair(browser);
  try {
    await readyMission(view.laptop);
    await view.laptop.waitForTimeout(2800);
    await view.laptop.screenshot({ path: resolve(ART, "pad-framed.png") });
    await view.laptop.getByRole("button", { name: "Use screen tilt" }).click();
    await view.laptop.locator("#launch-flight").click();
    await setRange(view.laptop, "#pitch-control", 18);
    await setRange(view.laptop, "#throttle-control", 100);
    await view.laptop.locator("#warp-8").click();
    const seen = new Set<string>();
    const marks: Array<[string, number]> = [["10km", 10], ["60km", 60], ["orbit", 150]];
    await expect.poll(async () => {
      const status = await view.laptop.locator("#flight-status").getAttribute("data-status");
      const km = await heightKm(view.laptop);
      for (const [name, gate] of marks) {
        if (!seen.has(name) && km >= gate) {
          seen.add(name);
          await view.laptop.screenshot({ path: resolve(ART, `${name}.png`) });
        }
      }
      if (status === "orbit" || status === "crashed" || status === "failed") return status;
      return seen.has("orbit") ? "orbit" : `alt-${km.toFixed(1)}`;
    }, { timeout: 150_000, intervals: [500] }).toMatch(/orbit|crashed|failed/);
    if (!seen.has("orbit")) {
      const status = await view.laptop.locator("#flight-status").getAttribute("data-status");
      if (status === "orbit") await view.laptop.screenshot({ path: resolve(ART, "orbit.png") });
    }
    await view.laptop.keyboard.press("m");
    await expect(view.laptop.locator("[data-flight-view='overview']")).toBeVisible();
    await view.laptop.screenshot({ path: resolve(ART, "map.png") });

    await view.laptop.getByRole("button", { name: "Free flight" }).click();
    await view.laptop.getByRole("button", { name: "Short hop" }).click();
    await expect(view.laptop.locator("#flight-status")).toHaveAttribute("data-status", "ready");
    await view.laptop.getByRole("button", { name: "Use screen tilt" }).click();
    await view.laptop.locator("#launch-flight").click();
    await setRange(view.laptop, "#pitch-control", 85);
    await setRange(view.laptop, "#throttle-control", 100);
    await expect(view.laptop.locator("[data-outcome='crashed']")).toBeVisible({ timeout: 40_000 });
    await view.laptop.screenshot({ path: resolve(ART, "crash.png") });
  } finally {
    await view.laptopContext.close();
    await view.phoneContext.close();
  }
});
