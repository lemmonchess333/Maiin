import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MacroDistribution from "../MacroDistribution";

/**
 * The hole in the macro donut read "avg" — a label for a figure that was
 * not there. It holds the figure now.
 *
 * The interesting assertion is the second one. The component can already
 * compute a calorie number: `total` is the Atwater reconstruction of the
 * three gram props, sitting three lines from where the centre renders,
 * and it is the obvious wrong answer. It is not the average of logged
 * calories — barcode, AI and parsed entries store calories and macros
 * independently, and a drink carries calories with no macro at all.
 *
 * The fixture is the repo's own capture seed for exactly that reason:
 * 48 / 72 / 14 g reconstructs to 606, while the day's logged total is
 * 620. A component that derived the figure would print 606 in the hole
 * while the stat card two rows above printed 620 — one quantity, two
 * numbers, one screen. That is the defect class the nutrition sweep
 * named, and this test is what stops it recurring here.
 *
 * jsdom gives ResponsiveContainer no dimensions so no slice paints, but
 * the centre overlay and the legend are plain DOM outside Recharts and
 * render normally.
 */

describe("macro donut centre", () => {
  it("shows the logged calorie average, not the Atwater sum of the macros", () => {
    render(
      <MacroDistribution protein={48} carbs={72} fat={14} avgCalories={620} />
    );
    expect(screen.getByText("620")).toBeInTheDocument();
    // 48*4 + 72*4 + 14*9 = 606 — what deriving from the rings would give.
    expect(screen.queryByText("606")).toBeNull();
  });

  it("names the unit under the figure", () => {
    render(
      <MacroDistribution protein={48} carbs={72} fat={14} avgCalories={620} />
    );
    expect(screen.getByText("kcal/day")).toBeInTheDocument();
  });

  it("no longer labels the hole with a bare word", () => {
    render(
      <MacroDistribution protein={48} carbs={72} fat={14} avgCalories={620} />
    );
    expect(screen.queryByText("avg")).toBeNull();
  });

  it("keeps the figure in the numeral face and the unit out of it", () => {
    /* The house rule both ways: digits get Archivo (which forces tabular
       figures), letters do not — the repo has a sweep that fails a bare
       word carrying `font-mono`, so the unit line must stay plain. */
    const { container } = render(
      <MacroDistribution protein={48} carbs={72} fat={14} avgCalories={620} />
    );
    const figure = screen.getByText("620");
    expect(figure.className).toContain("font-mono");
    expect(screen.getByText("kcal/day").className).not.toContain("font-mono");
    expect(container.querySelector(".font-mono")).toBe(figure);
  });
});
