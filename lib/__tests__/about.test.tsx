import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AboutButton } from "@/components/about/AboutButton";
import { AboutSheet } from "@/components/about/AboutSheet";
import { ABOUT } from "@/components/about/copy";

describe("about copy", () => {
  it("paraphrases SpaceX's stated mission and cites the mission page", () => {
    expect(ABOUT.sourceHref).toBe("https://www.spacex.com/mission/");
    expect(ABOUT.mission.join(" ")).toMatch(/multiplanetary/i);
    expect(ABOUT.mission.join(" ")).toMatch(/Mars/);
    expect(ABOUT.mission.join(" ")).toMatch(/reusable/i);
    expect(ABOUT.quotes.map((q) => q.text).join(" ")).toContain(
      "capable of carrying humans to Mars and other destinations in the solar system",
    );
    expect(ABOUT.quotes.map((q) => q.text).join(" ")).toContain(
      "substantially reduce the cost of space access",
    );
  });

  it("says why Teardown exists, in the exhibit motto", () => {
    expect(ABOUT.motto).toBe("Bringing rocket science down to Earth.");
    const why = ABOUT.why.join(" ");
    expect(why).toMatch(/hands-on/i);
    expect(why).toContain(
      "We built it at HackHarvard. A few weeks earlier, we talked with engineers and recruiters at a university event. Those talks made the mission even more fascinating to us than before.",
    );
    expect(why).not.toMatch(/recruiters there/);
  });

  it("credits the makers, the model licence, and the student disclaimer", () => {
    expect(ABOUT.authors).toBe("Made by Neel Bansal and Anders Haroldson");
    expect(ABOUT.disclaimer).toBe("Student project. Not affiliated with SpaceX or xAI.");
    expect(ABOUT.model).toContain("Stanley Creative");
    expect(ABOUT.model).toContain("CC BY 4.0");
    expect(ABOUT.modelHref).toBe("https://creativecommons.org/licenses/by/4.0/");
  });
});

describe("AboutSheet", () => {
  const html = renderToStaticMarkup(<AboutSheet titleId="about-title" onClose={() => {}} />);

  it("shows the cinematic hero, the motto, and a way back to the rocket", () => {
    expect(html).toContain("Down to Earth");
    expect(html).toContain("Bringing rocket science down to Earth.");
    expect(html).toContain("Back to the rocket");
  });

  it("links the source, keeps credits visible, and tucks the long quotes in a disclosure", () => {
    expect(html).toContain('href="https://www.spacex.com/mission/"');
    expect(html).toContain("Made by Neel Bansal and Anders Haroldson");
    expect(html).toContain("Student project. Not affiliated with SpaceX or xAI.");
    expect(html).toContain("Stanley Creative");
    expect(html).toContain("<details");
    expect(html).toContain("capable of carrying humans to Mars and other destinations in the solar system");
  });

  it("does not include a SpaceX logo", () => {
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/spacex[-_ ]?logo/i);
  });
});

describe("AboutButton", () => {
  it("is a visible control that can open the about dialog", () => {
    const html = renderToStaticMarkup(<AboutButton />);
    expect(html).toContain(">About<");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
  });
});
