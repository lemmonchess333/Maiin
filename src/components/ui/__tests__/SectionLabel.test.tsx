/**
 * SectionLabel primitive tests.
 *
 * Pins the canonical contract that replaced ~60 hand-rolled uppercase
 * label variants:
 *   1. Two ROLE tiers at one size (12px, text-xs): "caption" (default)
 *      is semibold · tracking-wider · muted; "section" is bold ·
 *      tracking-widest · foreground. They differed by one pixel before,
 *      with the page-level tier the smaller one, and read as the same
 *      thing — which is what made a page look like one flat list.
 *   2. Both are uppercase; neither sits below the 12px micro floor.
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
    render(<SectionLabel>Macro distribution</SectionLabel>);
    const el = screen.getByText("Macro distribution");
    expect(el.tagName).toBe("P");
    expect(el.className).toContain("text-xs");
    expect(el.className).toContain("font-semibold");
    expect(el.className).toContain("uppercase");
    expect(el.className).toContain("tracking-wider");
    expect(el.className).toContain("text-muted-foreground");
  });

  it("renders the section tier heavier, wider and in the foreground — same size", () => {
    render(<SectionLabel tier="section">Running</SectionLabel>);
    const el = screen.getByText("Running");
    expect(el.className).toContain("text-xs");
    expect(el.className).toContain("font-bold");
    expect(el.className).toContain("tracking-widest");
    expect(el.className).toContain("text-foreground");
    expect(el.className).toContain("uppercase");
    // Nothing from the caption tier leaks across, and no 11px step remains.
    const tokens = el.className.split(/\s+/);
    expect(tokens).not.toContain("font-semibold");
    expect(tokens).not.toContain("tracking-wider");
    expect(tokens).not.toContain("text-muted-foreground");
    expect(tokens).not.toContain("text-caption");
  });

  it("the two tiers differ in weight, tracking and colour, not size", () => {
    // The whole point of having two: a stat caption inside a tile must
    // not look like the header of the group the tile sits in.
    render(
      <>
        <SectionLabel>Caption</SectionLabel>
        <SectionLabel tier="section">Section</SectionLabel>
      </>
    );
    const c = screen.getByText("Caption").className.split(/\s+/);
    const s = screen.getByText("Section").className.split(/\s+/);
    expect(c).toContain("text-xs");
    expect(s).toContain("text-xs");
    for (const axis of [/^font-/, /^tracking-/, /^text-(?!xs$)/]) {
      expect(c.find((k) => axis.test(k))).not.toBe(s.find((k) => axis.test(k)));
    }
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
