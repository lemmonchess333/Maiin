import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import WaterCard from "../WaterCard";
import WeightStepsTiles from "../WeightStepsTiles";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/platform", () => ({ isNativePlatform: () => false }));

/**
 * Water and Weight are PEER compact tiles: the same row on Home, the
 * same rank, one in each half of the pyramid's right column. They are
 * rendered by two different components, so nothing local to either one
 * could notice that they had drifted a full typographic tier apart —
 * water at `text-xl` / 700 with a `text-xs` unit, weight at `text-2xl`
 * / 800 with a `text-sm` unit.
 *
 * Visible in the Home capture as the water figure reading smaller and
 * lighter than the weight figure beside it, and a direct breach of
 * DESIGN_GUIDE's weight rule: "Never mix 700 and 800 in the same visual
 * tier."
 *
 * A per-file scan cannot catch this class — within each component the
 * treatment was self-consistent. Only a test that renders the PAIR can.
 */
function numeralOf(root: HTMLElement, text: RegExp): HTMLElement {
  const el = Array.from(root.querySelectorAll("p")).find(
    (p) => text.test(p.textContent ?? "") && p.className.includes("font-mono")
  );
  if (!el) throw new Error(`no numeral matching ${text} in ${root.innerHTML}`);
  return el as HTMLElement;
}

describe("Home compact tiles share one numeral tier", () => {
  it("the water figure is rendered at the same size and weight as the weight figure", () => {
    const { container: water } = render(
      <WaterCard compact ml={0} targetMl={2000} onLog={vi.fn()} />
    );
    const { container: weight } = render(
      <WeightStepsTiles
        lastWeight="70.0"
        weightUnit="kg"
        onLogWeight={vi.fn()}
        lastWeightDate="From profile"
      />
    );

    const waterNum = numeralOf(water, /0/);
    const weightNum = numeralOf(weight, /70\.0/);

    for (const cls of ["text-2xl", "font-extrabold", "tabular-nums"]) {
      expect(waterNum, `water numeral missing ${cls}`).toHaveClass(cls);
      expect(weightNum, `weight numeral missing ${cls}`).toHaveClass(cls);
    }
    // The pair, stated as the invariant rather than as two coincidences.
    expect(waterNum.className.match(/text-\dxl/)?.[0]).toBe(
      weightNum.className.match(/text-\dxl/)?.[0]
    );
  });

  it("both tiles keep their unit secondary to the figure", () => {
    const { container: water } = render(
      <WaterCard compact ml={0} targetMl={2000} onLog={vi.fn()} />
    );
    const unit = Array.from(water.querySelectorAll("span")).find((s) =>
      /\/\s*2/.test(s.textContent ?? "")
    );
    expect(unit).toBeDefined();
    expect(unit).toHaveClass("text-sm");
    expect(unit).not.toHaveClass("text-2xl");
  });
});
