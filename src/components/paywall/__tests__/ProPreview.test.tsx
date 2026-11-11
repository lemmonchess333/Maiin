/**
 * ProPreview — the product frames the paywall leads with.
 *
 * Pins the two things that matter about a preview: each frame is a
 * labelled sample (a screen reader hears what the picture shows, and
 * that it is a sample), and the carousel scrolls inside its OWN
 * container — the page body must never scroll sideways, so the rail
 * carries the overflow, not the page.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: vi.fn(() => false),
}));

import { useReducedMotion } from "@/hooks/useReducedMotion";
import ProPreview from "../ProPreview";
import { framesForFeature } from "../previewFrames";

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

afterEach(cleanup);

describe("ProPreview", () => {
  it("carousel renders both frames as labelled samples", () => {
    render(<ProPreview />);
    const frames = screen.getAllByRole("img");
    expect(frames).toHaveLength(2);
    for (const f of frames) {
      expect(f.getAttribute("aria-label")).toMatch(/^Sample: /);
    }
  });

  it("the rail owns the horizontal overflow", () => {
    render(<ProPreview />);
    const rail = screen.getByRole("group", { name: "What Pro looks like" });
    expect(rail.className).toContain("overflow-x-auto");
    expect(rail.className).toContain("snap-x");
  });

  it("single variant renders exactly the frame asked for", () => {
    render(<ProPreview variant="single" frames={["scan"]} />);
    const frames = screen.getAllByRole("img");
    expect(frames).toHaveLength(1);
    expect(frames[0].getAttribute("aria-label")).toMatch(/meal photo/);
    expect(
      screen.queryByRole("group", { name: "What Pro looks like" })
    ).toBeNull();
  });

  it("numerals in the frames take their number tier with tabular figures", () => {
    /* Two tiers (DESIGN_GUIDE §4). Every number here carries one of the
       two number classes with tabular figures; the headline figures —
       the scan's 720 and the target's 2,336, each on its own at display
       size — are the figure tier (Archivo), while the 95 in the "g
       protein · g carbs" line and the diary row's 720 are inline. */
    const { container } = render(<ProPreview />);
    // The element whose OWN text is the number: a parent that only wraps
    // it (the calorie line wraps the number and its unit) is not it.
    const ownText = (n: Element) =>
      Array.from(n.childNodes)
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => c.textContent ?? "")
        .join("")
        .trim();
    const tiers = (text: string) =>
      Array.from(container.querySelectorAll("p, span"))
        .filter((n) => ownText(n) === text)
        .map((n) => {
          expect(n.className, text).toContain("tabular-nums");
          return /\bfont-figure\b/.test(n.className)
            ? "figure"
            : /\bfont-mono\b/.test(n.className)
              ? "inline"
              : "none";
        });
    expect(tiers("720")).toContain("figure");
    expect(tiers("2,336")).toContain("figure");
    expect(tiers("95")).toEqual(["inline"]);
    for (const text of ["720", "2,336", "95"])
      expect(tiers(text), text).not.toContain("none");
  });

  it("frame order follows the feature that brought the user, and never invents one", () => {
    expect(framesForFeature("ai_food_logging")).toEqual(["scan", "target"]);
    expect(framesForFeature("adaptive_tdee")).toEqual(["target", "scan"]);
    expect(framesForFeature("adaptive_macros")).toEqual(["target", "scan"]);
    expect(framesForFeature(undefined)).toEqual(["scan", "target"]);
    expect(framesForFeature(null)).toEqual(["scan", "target"]);
  });

  it("renders the frames in the order asked", () => {
    render(<ProPreview frames={["target", "scan"]} />);
    const frames = screen.getAllByRole("img");
    expect(frames[0].getAttribute("aria-label")).toMatch(/calorie target/);
    expect(frames[1].getAttribute("aria-label")).toMatch(/meal photo/);
  });
});

describe("ProPreview — the scan, happening", () => {
  it("plays the whole log when motion is allowed: aiming, reading, the result, the diary", () => {
    const { container } = render(
      <ProPreview variant="single" frames={["scan"]} />
    );
    const beats = (name: string) =>
      container.querySelectorAll(`[data-beat="${name}"]`).length;
    expect(beats("aim")).toBeGreaterThanOrEqual(1);
    expect(beats("reading")).toBeGreaterThanOrEqual(1);
    expect(beats("result")).toBe(1);
    // After Log, the meal is a row in the day's food log.
    expect(beats("logged")).toBe(1);
    // The scanner's own words, so the demo reads as the product.
    expect(
      screen.getByText("Fit the whole plate in the frame")
    ).toBeInTheDocument();
    expect(screen.getByText("Reading your plate…")).toBeInTheDocument();
    expect(screen.getByText("Counting the macros…")).toBeInTheDocument();
    expect(screen.getByText("Food log · 4 items")).toBeInTheDocument();
  });

  it("draws the app's screens without adding a heading to the page it sits on", () => {
    // The Upgrade page and the Pro popup own their one h1, and the
    // authenticated a11y e2e counts every h1 in the document, hidden or not.
    for (const reduce of [false, true]) {
      vi.mocked(useReducedMotion).mockReturnValue(reduce);
      const { container, unmount } = render(
        <ProPreview variant="single" frames={["scan"]} />
      );
      expect(
        container.querySelectorAll("h1, h2, h3, h4, h5, h6"),
        reduce ? "reduced motion" : "motion"
      ).toHaveLength(0);
      unmount();
    }
  });

  it("scans a real photo, not a blank slot", () => {
    const { container } = render(
      <ProPreview variant="single" frames={["scan"]} />
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/rigatoni/);
  });

  it("under reduced motion, renders the settled result and nothing that aims or reads", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = render(
      <ProPreview variant="single" frames={["scan"]} />
    );
    expect(container.querySelectorAll("[data-beat]")).toHaveLength(0);
    expect(screen.queryByText("Reading your plate…")).toBeNull();
    expect(screen.queryByText("Fit the whole plate in the frame")).toBeNull();
    expect(screen.getByText("720")).toBeInTheDocument();
    expect(screen.getByText("Log to Dinner")).toBeInTheDocument();
  });

  it("the preview file itself never animates: the scan's loop lives in ScanDemo", () => {
    const src = readFileSync(resolve(__dirname, "../ProPreview.tsx"), "utf8");
    expect(src).not.toMatch(/repeat: Infinity/);
    expect(src).not.toMatch(/animate=/);
  });
});
