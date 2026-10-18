import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { ImagineSlot } from "@/components/imagine/ImagineSlot";
import { MissionPatch, MissionPatchCard } from "@/components/imagine/MissionPatch";
import { idleFlight } from "@/lib/flight/session";
import { buildPatchCard, patchShareUrl } from "@/lib/imagine/patch";
import { patchQrPath } from "@/lib/imagine/patch-qr";
import { resetImagineScene } from "@/lib/imagine/scene";
import { useScene } from "@/lib/store";
import type { FlightOutcome, FlightReadout } from "@/lib/types";

function readout(over: Partial<FlightReadout> = {}): FlightReadout {
  return {
    altitudeM: 12_000,
    radialSpeedMps: 10,
    tangentialSpeedMps: 20,
    totalSpeedMps: 22,
    pitchRad: 0,
    throttle: 0,
    activeStageId: "booster",
    propellantRemainingKg: 1,
    periapsisAltitudeM: null,
    apoapsisAltitudeM: 18_500,
    co2Kg: null,
    ...over,
  };
}

function outcome(over: Partial<FlightOutcome> = {}): FlightOutcome {
  return {
    kind: "failed",
    reason: "The engines stopped before the path was high enough.",
    readout: readout(),
    runId: "run-7",
    ...over,
  };
}

describe("mission patch popup", () => {
  beforeEach(() => {
    resetImagineScene();
    useScene.setState({ flight: idleFlight() });
  });

  it("stays quiet until a flight outcome exists", () => {
    expect(renderToStaticMarkup(<MissionPatch />)).toBe("");
    expect(renderToStaticMarkup(<ImagineSlot />)).not.toContain("TEARDOWN FLIGHT");
  });

  it("shows exact flight stats in HTML as soon as the outcome arrives", () => {
    const flightOutcome = outcome();
    useScene.setState({
      flight: { ...idleFlight(), status: "failed", runId: flightOutcome.runId, scenarioId: "classroom-custom", outcome: flightOutcome },
    });
    const html = renderToStaticMarkup(<ImagineSlot />);
    expect(html).toContain("TEARDOWN FLIGHT #7");
    expect(html).toContain("18.5 km");
    expect(html).toContain("Classroom custom");
    expect(html).toContain("The flight stopped");
    expect(html).toContain("7");
    expect(html).toContain("/patches/suborbital.svg");
    expect(html).toContain('data-tone="bad"');
    expect(html).toContain("Flight ended");
    expect(html).not.toContain("Making your mission patch");
    expect(html).toContain("Rapid unscheduled disassembly");
    expect(html).toContain('aria-label="Close"');
    expect(html).not.toContain("12345");
    expect(html).not.toContain("18500");
  });

  it("draws the QR only for a hosted patch url and keeps stats when the picture fails", () => {
    const card = buildPatchCard(outcome({ kind: "crashed", reason: "It hit the ground." }), "Classroom", 4);
    const share = patchShareUrl("https://show.example/", "/api/imagine/patch/123e4567-e89b-12d3-a456-426614174000");
    expect(share).toBe("https://show.example/api/imagine/patch/123e4567-e89b-12d3-a456-426614174000");
    expect(patchShareUrl("https://show.example", "https://evil.example/patch.jpg")).toBeNull();
    const qr = patchQrPath(share ?? "");
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.d).toContain("M0 0h1v1h-1z");

    const ready = renderToStaticMarkup(
      <MissionPatchCard card={card} phase="ready" imageUrl="/api/imagine/patch/123e4567-e89b-12d3-a456-426614174000" shareUrl={share} tone="bad" onClose={() => undefined} onRetry={() => undefined} />,
    );
    expect(ready).toContain("TEARDOWN FLIGHT #4");
    expect(ready).toContain('data-tone="bad"');
    expect(ready).toContain("Scan to keep this patch");
    expect(ready).toContain("/api/imagine/patch/123e4567-e89b-12d3-a456-426614174000");
    expect(ready).toContain("M0 0h1v1h-1z");

    const failed = renderToStaticMarkup(
      <MissionPatchCard card={card} phase="error" imageUrl={null} shareUrl={null} tone="bad" onClose={() => undefined} onRetry={() => undefined} />,
    );
    expect(failed).toContain("Grok could not draw this patch");
    expect(failed).toContain("It hit the ground.");
    expect(failed).toContain("Came back too hard");
    expect(failed).toContain("Try again");
    expect(failed).not.toContain("<img");
  });

  it("shows the saved orbit patch in the ok frame", () => {
    const flightOutcome = outcome({ kind: "orbit", reason: "You are in a stable orbit." });
    useScene.setState({
      flight: { ...idleFlight(), status: "orbit", runId: flightOutcome.runId, scenarioId: "classroom", outcome: flightOutcome },
    });
    const html = renderToStaticMarkup(<MissionPatch />);
    expect(html).toContain("/patches/orbit.svg");
    expect(html).toContain('data-tone="ok"');
    expect(html).toContain("In orbit");
    expect(html).toContain("Made it to orbit");
  });
});
