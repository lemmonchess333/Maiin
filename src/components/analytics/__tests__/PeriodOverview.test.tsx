import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PeriodOverview from "../PeriodOverview";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

/**
 * The three summary columns are a number, a progress ring and an icon.
 * Each stat object has carried a `label` since it was written — but the
 * render spent it only as the React `key`, so it reached the screen
 * nowhere. Meaning was left to the glyph: a shoe, a dumbbell and a fork.
 *
 * That is the regression these tests exist to catch. `key={s.label}`
 * looks like a use, so the field reads as rendered when it is not, and a
 * future refactor could drop the visible line without anything failing.
 */
function renderOverview() {
  return render(
    <PeriodOverview
      runCount={4}
      runDistance={21.1}
      liftCount={3}
      liftVolume={12400}
      avgCalories={2143}
      nutritionAdherence={87}
      rangeDays={7}
    />
  );
}

describe("PeriodOverview column labels", () => {
  it("names all three columns in text, not by icon alone", () => {
    renderOverview();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Adherence")).toBeInTheDocument();
  });

  it("renders the label as a word, not in the numeral face", () => {
    // font-mono/tabular-nums are scoped to numeric displays (CLAUDE.md);
    // the number above it keeps them, the label must not.
    renderOverview();
    const label = screen.getByText("Runs");
    expect(label).not.toHaveClass("font-mono");
    expect(label).toHaveClass("text-caption");
  });

  it("truncates the free-text sub-value rather than growing the row", () => {
    // Sub-values are strings like "12.4k vol" / "2,143 kcal/day" in a
    // column a third of a phone card wide.
    renderOverview();
    const sub = screen.getByText("12.4k vol");
    expect(sub).toHaveClass("truncate");
    expect(sub).toHaveClass("font-mono");
  });

  it("still shows each column's number", () => {
    renderOverview();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
  });
});
