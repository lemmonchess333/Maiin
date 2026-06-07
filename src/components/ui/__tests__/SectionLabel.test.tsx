/**
 * SectionLabel primitive tests.
 *
 * Pins the canonical contract that replaced ~60 hand-rolled uppercase
 * label variants:
 *   1. Default tier "caption" → 12px (text-xs); "section" → 10px.
 *   2. Always carries the canonical treatment (semibold · tracking-wider
 *      · uppercase · muted) regardless of tier.
 *   3. `className` rides through (spacing + token colour overrides like
 *      text-running win over the muted default via twMerge).
 *   4. `style` passthrough for JS theme colours.
 *   5. `as` swaps the rendered element (default <p>).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import SectionLabel from "../SectionLabel";

afterEach(() => cleanup());

describe("SectionLabel", () => {
  it("defaults to the caption tier (12px) with the canonical treatment", () => {
    render(<SectionLabel>Macro Distribution</SectionLabel>);
    const el = screen.getByText("Macro Distribution");
    expect(el.tagName).toBe("P");
    expect(el.className).toContain("text-xs");
    expect(el.className).toContain("font-semibold");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("tracking-wider");
    expect(el.className).toContain("text-muted-foreground");
  });

  it("renders the section tier at 10px", () => {
    render(<SectionLabel tier="section">Running</SectionLabel>);
    const el = screen.getByText("Running");
    expect(el.className).toContain("text-[10px]");
    expect(el.className).not.toContain("text-xs");
  });

  it("merges a token colour override over the muted default", () => {
    render(<SectionLabel className="text-running">Running</SectionLabel>);
    const el = screen.getByText("Running");
    expect(el.className).toContain("text-running");
    // twMerge drops the conflicting muted colour
    expect(el.className).not.toContain("text-muted-foreground");
  });

  it("forwards inline style for JS theme colours", () => {
    render(
      <SectionLabel style={{ color: "rgb(123, 114, 233)" }}>
        Performance
      </SectionLabel>
    );
    const el = screen.getByText("Performance");
    expect(el).toHaveStyle({ color: "rgb(123, 114, 233)" });
  });

  it("swaps the rendered element via `as`", () => {
    render(<SectionLabel as="h3">Weekly Insights</SectionLabel>);
    expect(screen.getByText("Weekly Insights").tagName).toBe("H3");
  });
});
