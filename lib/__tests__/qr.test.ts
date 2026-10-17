import { describe, expect, it } from "vitest";
import { qrSvgPath, rocketUrl } from "@/lib/rocket/qr";

describe("qr (11 Task 2)", () => {
  it("QR1 rocketUrl joins the origin and the code with no double slash", () => {
    expect(rocketUrl("https://teardown.example", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
    expect(rocketUrl("https://teardown.example/", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
    expect(rocketUrl("https://teardown.example///", "AB2C")).toBe("https://teardown.example/rocket?code=AB2C");
  });

  it("QR2 rocketUrl encodes the code", () => {
    expect(rocketUrl("https://t.example", "A B&C")).toBe("https://t.example/rocket?code=A%20B%26C");
  });

  it("QR3 qrSvgPath returns a real QR: size >= 21, non-empty path of unit-square subpaths", () => {
    const { size, d } = qrSvgPath("https://teardown.example/rocket?code=AB2C");
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0); // QR sizes are 21, 25, 29, ...
    expect(d.length).toBeGreaterThan(0);
    const squares = d.split("z").filter(Boolean);
    expect(squares.length).toBeGreaterThan(size); // far more dark modules than one per row
    for (const s of squares) {
      const m = /^M(\d+) (\d+)h1v1h-1$/.exec(s);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeLessThan(size);
      expect(Number(m![2])).toBeLessThan(size);
    }
  });

  it("QR4 the three finder squares are drawn (top-left, top-right, bottom-left corner modules are dark)", () => {
    const { size, d } = qrSvgPath("https://teardown.example/rocket?code=AB2C");
    expect(d).toContain("M0 0h1v1h-1z");
    expect(d).toContain(`M${size - 1} 0h1v1h-1z`);
    expect(d).toContain(`M0 ${size - 1}h1v1h-1z`);
  });

  it("QR5 deterministic for the same text; different text gives a different path", () => {
    const a = qrSvgPath("https://t.example/rocket?code=AB2C");
    expect(qrSvgPath("https://t.example/rocket?code=AB2C")).toEqual(a);
    expect(qrSvgPath("https://t.example/rocket?code=ZZ99").d).not.toBe(a.d);
  });
});
