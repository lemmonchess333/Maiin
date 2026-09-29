import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "../StatCard";

/* The change on the previous range is grey whichever way it moved. It was
 * green or red by whether the move suited the goal (up-good / down-good),
 * which graded a 1% wobble in average calories as a success or a failure;
 * the house voice states what the data shows (2026-09-29). */
describe("StatCard change colour", () => {
  function deltaEl() {
    return screen.getByText(/vs last/).closest("p");
  }

  it.each([
    ["a rise", true],
    ["a drop", false],
  ])("draws %s in grey, with no success or warning colour", (_name, up) => {
    render(
      <StatCard
        label="Avg calories"
        value="2,100"
        delta={{ value: "1%", positive: up }}
      />
    );
    const change = deltaEl()!;
    expect(change).toHaveClass("text-muted-foreground");
    expect(change.className).not.toMatch(/success|destructive|warning/);
    expect(change).toHaveTextContent(up ? "↑1% vs last" : "↓1% vs last");
  });
});

/* Value TREATMENT is chosen by `valueKind`, not by string length — and
 * that distinction is the point, so it is pinned here.
 *
 * A length-based scale was proposed (shrink long values, keep font-mono
 * throughout, truncate on overflow). It was declined: mono + tabular-nums
 * align DIGITS and do nothing for letters, CLAUDE.md scopes that treatment
 * to numeric displays, and truncating a word cuts it in half rather than
 * letting it wrap. These tests fail if any of that is reversed. */
describe("StatCard value treatment", () => {
  function valueEl(text: string) {
    return screen.getByText(text);
  }

  it("a numeric value gets the full numeral treatment and never wraps", () => {
    render(<StatCard label="Volume" value="20,000" />);
    const el = valueEl("20,000");
    expect(el).toHaveClass("text-3xl");
    expect(el).toHaveClass("font-mono");
    expect(el).toHaveClass("tabular-nums");
    expect(el).toHaveClass("whitespace-nowrap");
  });

  it("a long WORD value drops the numeral treatment and wraps instead of truncating", () => {
    // "Establishing" is a real value on the trend cards. Rendering it in
    // a monospace numeral face is the failure mode this pins.
    render(<StatCard label="Trend" value="Establishing" valueKind="text" />);
    const el = valueEl("Establishing");
    expect(el).toHaveClass("text-xl");
    expect(el).not.toHaveClass("font-mono");
    expect(el).not.toHaveClass("tabular-nums");
    expect(el).toHaveClass("break-words");
    expect(el).not.toHaveClass("truncate");
  });

  it("the unit is visibly secondary to the value, and is never the part that shrinks", () => {
    // A narrow card must take width from the figure, not from the unit
    // that gives it meaning — so the unit is shrink-0, not the value.
    render(<StatCard label="Calories" value="2,143" unit="kcal/day" />);
    const unit = valueEl("kcal/day");
    expect(unit).toHaveClass("text-caption");
    expect(unit).toHaveClass("shrink-0");
    expect(unit).not.toHaveClass("text-3xl");
  });
});
