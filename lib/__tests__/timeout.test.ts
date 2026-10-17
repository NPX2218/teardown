import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXT_TIMEOUT_MS, withTimeout } from "@/lib/timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout (04 Task 2)", () => {
  it("T1 rejects after 8 s", async () => {
    vi.useFakeTimers();
    let settled = false;
    const p = withTimeout(new Promise<never>(() => {}), TEXT_TIMEOUT_MS);
    p.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(TEXT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).rejects.toThrow("timeout");
    expect(TEXT_TIMEOUT_MS).toBe(8000);
  });

  it("T2 passes through", async () => {
    await expect(withTimeout(Promise.resolve(42), TEXT_TIMEOUT_MS)).resolves.toBe(42);
  });

  it("T3 clears its timer once the promise settles", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve("x"), TEXT_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("T4 a rejection passes through unchanged", async () => {
    const err = new Error("offline");
    await expect(withTimeout(Promise.reject(err), TEXT_TIMEOUT_MS)).rejects.toBe(err);
  });
});
