import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsButton } from "@/components/settings/SettingsButton";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { SETTINGS_COPY } from "@/components/settings/copy";
import { DEFAULT_SETTINGS } from "@/lib/settings/prefs";
import { VIBRATION_UNSUPPORTED_NOTE } from "@/lib/settings/vibrate";

describe("settings sheet", () => {
  it("shows engine sound, master sound, and vibration with the SpaceXAI controls", () => {
    const html = renderToStaticMarkup(
      <SettingsSheet
        settings={{ engineSound: true, masterPercent: 80, vibration: false, musicPercent: 40 }}
        titleId="settings-title"
        onEngineSound={() => {}}
        onMaster={() => {}}
        onMusic={() => {}}
        onVibration={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain(SETTINGS_COPY.title);
    expect(html).toContain(SETTINGS_COPY.engineTitle);
    expect(html).toContain(SETTINGS_COPY.engineBody);
    expect(html).toContain(SETTINGS_COPY.masterTitle);
    expect(html).toContain(SETTINGS_COPY.masterBody);
    expect(html).toContain(SETTINGS_COPY.vibrationTitle);
    expect(html).toContain("80%");
    expect(html).toContain('aria-valuetext="80 percent"');
    expect(html).toContain('type="range"');
    expect(html).toContain("btn");
    expect(html).toContain("card");
    expect(html).toContain("sheet");
    expect(html).toContain(">Done<");
    expect(html).not.toContain(VIBRATION_UNSUPPORTED_NOTE);
    expect(DEFAULT_SETTINGS.masterPercent).toBe(100);
  });

  it("shows a music slider under the master level", () => {
    const html = renderToStaticMarkup(
      <SettingsSheet
        settings={{ engineSound: true, masterPercent: 100, vibration: true, musicPercent: 40 }}
        titleId="settings-title"
        onEngineSound={() => {}}
        onMaster={() => {}}
        onMusic={() => {}}
        onVibration={() => {}}
        onClose={() => {}}
      />,
    );
    const masterAt = html.indexOf("Master sound");
    const musicAt = html.indexOf(">Music<");
    expect(masterAt).toBeGreaterThan(-1);
    expect(musicAt).toBeGreaterThan(masterAt);
    expect(html).toContain("40%");
    expect(html).toContain('aria-valuetext="40 percent"');
    expect(html).toContain('type="range"');
  });

  it("is a nav control that can open the sheet", () => {
    const html = renderToStaticMarkup(<SettingsButton />);
    expect(html).toContain(">Settings<");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("<svg");
  });
});
