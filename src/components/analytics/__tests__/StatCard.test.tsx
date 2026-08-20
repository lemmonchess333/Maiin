import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatCard from "../StatCard";

/* Pins the delta-chip sentiment → token-class mapping. The chip colour
 * is the running copy of the trend-sentiment rule (up-good vs down-good
 * vs neutral); a regression here is invisible in tsc/lint, so it's
 * pinned explicitly. Tokens: good → text-success-strong, bad → text-destructive-strong,
 * neutral/no-delta → text-muted-foreground. */
describe("StatCard delta sentiment colour", () => {
  function deltaEl() {
    return screen.getByText(/vs last/).closest("p");
  }

  it("increase on an up-good metric is success-coloured", () => {
    render(
      <StatCard
        label="Volume"
        value="20,000"
        direction="up-good"
        delta={{ value: "20%", positive: true }}
      />
    );
    expect(deltaEl()).toHaveClass("text-success-strong");
  });

  it("decrease on an up-good metric is destructive-coloured", () => {
    render(
      <StatCard
        label="Volume"
        value="16,000"
        direction="up-good"
        delta={{ value: "20%", positive: false }}
      />
    );
    expect(deltaEl()).toHaveClass("text-destructive-strong");
  });

  it("decrease on a down-good metric (e.g. weight on a cut) is success-coloured", () => {
    render(
      <StatCard
        label="Weight"
        value="80"
        direction="down-good"
        delta={{ value: "2%", positive: false }}
      />
    );
    expect(deltaEl()).toHaveClass("text-success-strong");
  });

  it("neutral direction greys the chip regardless of sign", () => {
    render(
      <StatCard
        label="Calories"
        value="2,100"
        direction="neutral"
        delta={{ value: "1%", positive: true }}
      />
    );
    expect(deltaEl()).toHaveClass("text-muted-foreground");
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
