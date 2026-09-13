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

  it("numerals in the frames take the numeral font with tabular figures", () => {
    const { container } = render(<ProPreview />);
    for (const text of ["540", "2,336", "38g"]) {
      const el = Array.from(container.querySelectorAll("p, span")).find((n) =>
        n.textContent?.trim().startsWith(text)
      );
      expect(el, text).toBeDefined();
      expect(el!.className).toContain("font-mono");
      expect(el!.className).toContain("tabular-nums");
    }
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
  it("plays three beats when motion is allowed: the photo, Pro reading it, the result", () => {
    const { container } = render(
      <ProPreview variant="single" frames={["scan"]} />
    );
    const beats = (name: string) =>
      container.querySelectorAll(`[data-beat="${name}"]`).length;
    expect(beats("photo")).toBe(1);
    expect(beats("reading")).toBeGreaterThanOrEqual(1);
    expect(beats("result")).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Reading…")).toBeInTheDocument();
  });

  it("under reduced motion, renders the settled result and nothing that reads", () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    const { container } = render(
      <ProPreview variant="single" frames={["scan"]} />
    );
    expect(container.querySelectorAll("[data-beat]")).toHaveLength(0);
    expect(screen.queryByText("Reading…")).toBeNull();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("38g")).toBeInTheDocument();
  });

  it("keeps the glow recipe: one clock on the surface, and only opacity or transform ever animates", () => {
    const src = readFileSync(resolve(__dirname, "../ProPreview.tsx"), "utf8");
    // One ambient loop per surface: every layer shares LOOP, so the
    // literal appears once — the target frame never animates.
    expect(src.match(/repeat: Infinity/g)).toHaveLength(1);
    // Animating a filter, a size or a colour stutters in WKWebView; the
    // recipe is a static layer whose opacity / transform moves.
    for (const block of src.match(/animate=\{[\s\S]*?\}\s*$/gm) ?? []) {
      expect(block).not.toMatch(
        /filter|blur|width|height|background|scale|color/
      );
    }
    expect(src).not.toMatch(
      /animate=\{[^}]*(filter|blur|width|height|background)/
    );
  });
});
