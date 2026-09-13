/**
 * ProPreview — the product frames the paywall leads with.
 *
 * Pins the two things that matter about a preview: each frame is a
 * labelled sample (a screen reader hears what the picture shows, and
 * that it is a sample), and the carousel scrolls inside its OWN
 * container — the page body must never scroll sideways, so the rail
 * carries the overflow, not the page.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProPreview from "../ProPreview";

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
});
