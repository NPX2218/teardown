// Ambient types so `tsc` and `next build` accept the smoke specs.
// `@playwright/test` is installed by scripts/smoke/smoke.sh, not by the app.
declare module "@playwright/test" {
  export interface Browser {
    newContext(options?: unknown): Promise<BrowserContext>;
  }
  export interface BrowserContext {
    addInitScript(script: unknown): Promise<void>;
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }
  export interface Page {
    goto(url: string): Promise<unknown>;
    locator(selector: string, options?: unknown): Locator;
    getByRole(role: string, options?: unknown): Locator;
    getByText(text: unknown, options?: unknown): Locator;
    screenshot(options?: unknown): Promise<unknown>;
    evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
    waitForTimeout(ms: number): Promise<void>;
    keyboard: { down(key: string): Promise<void>; up(key: string): Promise<void>; press(key: string): Promise<void> };
    video(): { saveAs(path: string): Promise<void> } | null;
  }
  export interface Locator {
    click(options?: unknown): Promise<void>;
    first(): Locator;
    innerText(): Promise<string>;
    getAttribute(name: string): Promise<string | null>;
    evaluate(fn: unknown, arg?: unknown): Promise<unknown>;
    scrollIntoViewIfNeeded(): Promise<void>;
    screenshot(options?: unknown): Promise<unknown>;
  }
  interface Assertion {
    toBeVisible(options?: unknown): Promise<void>;
    toHaveCount(count: number): Promise<void>;
    toHaveText(value: unknown, options?: unknown): Promise<void>;
    toHaveAttribute(name: string, value: unknown, options?: unknown): Promise<void>;
    toContainText(value: unknown, options?: unknown): Promise<void>;
    toBeEnabled(options?: unknown): Promise<void>;
  }
  interface Expect {
    (value?: unknown): Assertion;
    poll(fn: () => Promise<unknown>, options?: unknown): {
      toBeGreaterThan(value: number): Promise<void>;
      toMatch(pattern: RegExp): Promise<void>;
    };
  }
  export const test: {
    (name: string, fn: (args: { browser: Browser }) => Promise<void> | void): void;
    setTimeout(ms: number): void;
  };
  export const expect: Expect;
  export function defineConfig(config: unknown): unknown;
}
