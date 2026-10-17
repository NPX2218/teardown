// The rocket on the pad must show its own skin, not a wall of steam drawn over it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { padBankOpacity, padSteamOpacity } from "@/components/flight/fx/falcon";
import { padCloudFragment, padCloudVertex } from "@/components/flight/fx/shaders";

describe("pad steam", () => {
  it("S1 there is no steam before the engines light", () => {
    expect(padSteamOpacity(0, false)).toBe(0);
    expect(padSteamOpacity(0, true)).toBe(padBankOpacity(0));
    expect(padSteamOpacity(0, true)).toBeGreaterThan(0.5);
  });

  it("S2 steam writes log depth, so the opaque rocket hides steam behind it", () => {
    expect(padCloudVertex).toContain("#include <logdepthbuf_pars_vertex>");
    expect(padCloudVertex).toContain("#include <logdepthbuf_vertex>");
    expect(padCloudFragment).toContain("#include <logdepthbuf_pars_fragment>");
    expect(padCloudFragment).toContain("#include <logdepthbuf_fragment>");
  });

  it("S3 the steam bank and column keep depth testing on", () => {
    const src = readFileSync("components/flight/fx/CloudLayer.tsx", "utf8");
    expect(src).not.toMatch(/depthTest:\s*false/);
  });
});
