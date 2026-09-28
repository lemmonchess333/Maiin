/**
 * SectionLabel primitive tests.
 *
 * Pins the contract of the small label that lives inside a card:
 *   1. The caption tier (default) is 12px semibold muted, in SENTENCE
 *      case — no `uppercase`, no letter-spacing. DS3 (2026-09-27) took
 *      the capitals off: a stat's name reads the way it is written.
 *   2. The section tier is the small group label inside a sheet or list
 *      (the Food details sheet, the food suggestions): 12px bold in the
 *      foreground, sentence case since the Food pass. Groups on a page
 *      open with a `SectionHeading`. Both tiers are 12px.
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
  it("defaults to the caption tier: 12px semibold muted, sentence case", () => {
    render(<SectionLabel>Macro distribution</SectionLabel>);
    const el = screen.getByText("Macro distribution");
    expect(el.tagName).toBe("P");
    const tokens = el.className.split(/\s+/);
    expect(tokens).toContain("text-xs");
    expect(tokens).toContain("font-semibold");
    expect(tokens).toContain("text-muted-foreground");
    // DS3: no capitals and no letter-spacing on a caption.
    expect(tokens).not.toContain("uppercase");
    expect(tokens.some((k) => k.startsWith("tracking-"))).toBe(false);
  });

  it("keeps the section tier bold and in the foreground, same size, sentence case", () => {
    render(<SectionLabel tier="section">Your pantry</SectionLabel>);
    const el = screen.getByText("Your pantry");
    const tokens = el.className.split(/\s+/);
    expect(tokens).toContain("text-xs");
    expect(tokens).toContain("font-bold");
    expect(tokens).toContain("text-foreground");
    // The Food pass took the capitals and letter-spacing off this tier too.
    expect(tokens).not.toContain("uppercase");
    expect(tokens.some((k) => k.startsWith("tracking-"))).toBe(false);
    // Nothing from the caption tier leaks across, and no 11px step remains.
    expect(tokens).not.toContain("font-semibold");
    expect(tokens).not.toContain("text-muted-foreground");
    expect(tokens).not.toContain("text-caption");
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
    render(<SectionLabel as="h3">Weekly insights</SectionLabel>);
    expect(screen.getByText("Weekly insights").tagName).toBe("H3");
  });
});
