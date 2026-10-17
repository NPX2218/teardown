import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { EMISSIONS } from "@/lib/emissions-data";
import { estimateFromReadout } from "@/lib/emissions";
import { getEmissionsView, publishFlightFuelReadout, resetEmissionsSeam } from "@/lib/emissions-seam";
import { EmissionsReadout } from "@/components/emissions/EmissionsReadout";
import { EmissionsSlot } from "@/components/emissions/EmissionsSlot";
import { SourcesPanel } from "@/components/emissions/SourcesPanel";

describe("embedded emissions readout", () => {
  beforeEach(() => resetEmissionsSeam());

  it("renders the estimate inside the slot and has no emissions mode switch", () => {
    publishFlightFuelReadout({
      runId: "run",
      scope: "interactive",
      tSeconds: 4,
      frozen: false,
      consumedRp1Kg: { 1: 1000, 2: 200 },
    });
    const html = renderToStaticMarkup(<EmissionsSlot />);
    expect(html).toContain("3.78 t CO₂");
    expect(html.toLowerCase()).toContain("estimated");
    expect(html).toContain('data-emissions-surface="embedded"');
    expect(html).not.toContain("Rocket · Emissions");
    expect(html).not.toContain("setLens");
    expect(html.toLowerCase()).toContain("not a measured plume");
    expect(html.toLowerCase()).not.toContain("this is a measured plume");
    expect(getEmissionsView().status).toBe("estimate");
  });

  it("shows Estimate unavailable instead of a fabricated zero", () => {
    publishFlightFuelReadout({
      runId: "run",
      scope: "interactive",
      tSeconds: 1,
      frozen: false,
      consumedRp1Kg: null,
    });
    const html = renderToStaticMarkup(<EmissionsSlot />);
    expect(html).toContain("Estimate unavailable");
    expect(html).not.toContain("0 kg CO₂");
  });

  it("the sources disclosure lists the factor and the caveats without leaving the flight", () => {
    const view = estimateFromReadout(
      { runId: "run", scope: "historical", tSeconds: 2, frozen: false, consumedRp1Kg: { 1: 10, 2: 0 } },
      EMISSIONS,
    );
    const html = renderToStaticMarkup(
      <SourcesPanel file={EMISSIONS} view={view} open onClose={() => undefined} />,
    );
    expect(html).toContain("Where these numbers come from");
    expect(html).toContain("3.15");
    expect(html).toContain("Estimate");
    expect(html).toContain("not a measured plume");
    expect(html).toContain("https://");
    expect(html).not.toContain("Rocket · Emissions");
  });

  // REGRESSION GUARD for the 2026-10-17 crowded prelaunch emissions card.
  it("E1: the summary shows one total and keeps supporting comparisons behind a closed disclosure (2026-10-17 report)", () => {
    const view = estimateFromReadout(
      { runId: "ready", scope: "interactive", tSeconds: 0, frozen: false, consumedRp1Kg: { 1: 0, 2: 0 } }, EMISSIONS,
    );
    const html = renderToStaticMarkup(<EmissionsReadout view={view} file={EMISSIONS} onDetails={() => undefined} />);
    const summary = html.split("<details")[0];
    expect(summary).toContain("Carbon dioxide so far");
    expect(summary).toContain("0 kg CO₂");
    expect(summary.toLowerCase()).toContain("estimated");
    expect(summary.toLowerCase()).toContain("not a measured plume");
    expect(summary).not.toContain("No carbon dioxide");
    expect(summary).not.toContain("Booster:");
    expect(summary).not.toContain("typical car");
    expect(html).toContain("<summary>Estimate details</summary>");
    expect(html).toContain("Booster:");
    expect(html).toContain("typical car");
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("the readout button is present for a direct view", () => {
    const view = estimateFromReadout(
      { runId: "run", scope: "interactive", tSeconds: 1, frozen: true, consumedRp1Kg: { 1: 0, 2: 0 } },
      EMISSIONS,
    );
    const html = renderToStaticMarkup(<EmissionsReadout view={view} file={EMISSIONS} onDetails={() => undefined} />);
    expect(html).toContain("Where do these numbers come from?");
    expect(html).toContain("0 kg CO₂");
    expect(html).toContain("stopped");
  });
});
