/**
 * HeroDrillDownSheet — training-aware fuel story + honest Pro gate.
 *
 * Pins that the drill-down explains WHY today's grams differ using the exact
 * delta the nutrition engine already computed (Pro), shows an honest
 * capability gate for free users (never claims an unapplied change), and opens
 * the contextual ProModal only after the BottomSheet has closed (no nested
 * focus traps).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import HeroDrillDownSheet from "../HeroDrillDownSheet";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import type { TrainingFuelAdjustment } from "@/hooks/useEffectiveTargets";

let mockIsPro = false;
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: mockIsPro }),
}));

// Micro reference targets read profile.sex via useAuth — stub it.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { sex: "male" } }),
  useUid: () => null,
}));

// Stub ProModal so we can assert it mounts with the right feature key without
// dragging in its heavy dependency tree.
vi.mock("@/components/ProModal", () => ({
  default: ({ featureKey }: { featureKey?: string }) => (
    <div data-testid="pro-modal" data-feature={featureKey} />
  ),
}));

afterEach(() => {
  cleanup();
  mockIsPro = false;
});

const fuel = (o: Partial<TrainingFuelAdjustment>): TrainingFuelAdjustment => ({
  intensity: "HARD",
  eligible: true,
  applied: true,
  carbDeltaG: 0,
  fatDeltaG: 0,
  proteinDeltaG: 0,
  ...o,
});

function targets(o: Partial<EffectiveTargets> = {}): EffectiveTargets {
  return {
    baseTarget: 2500,
    dayType: "lift",
    isRunDay: false,
    actualBurn: 0,
    actualLiftBurn: 0,
    actualRunBurn: 0,
    hasCompletedActivity: false,
    finalTarget: 2500,
    adaptiveSource: "formula",
    showWarmup: false,
    warmupFraction: 0,
    adaptiveStalled: false,
    protein: 180,
    carbs: 300,
    fat: 60,
    annotation: "Hard session",
    caption: null,
    targetTooAggressive: false,
    taperActive: false,
    trainingFuel: fuel({ eligible: false, applied: false }),
    ...o,
  };
}

const totals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sodium: 0,
};

// Controlled wrapper so onOpenChange(false) actually closes the sheet (the
// queued-paywall flow depends on the `open` prop flipping to false).
function Harness({ dailyTargets }: { dailyTargets: EffectiveTargets }) {
  const [open, setOpen] = useState(true);
  return (
    <HeroDrillDownSheet
      open={open}
      onOpenChange={setOpen}
      selectedDate="2026-07-13"
      isToday
      dailyTotals={totals}
      dailyTargets={dailyTargets}
    />
  );
}

describe("HeroDrillDownSheet — training-aware fuel", () => {
  it("rest day: no training-fuel section", () => {
    render(<Harness dailyTargets={targets()} />);
    expect(screen.queryByLabelText("Training-aware fuel")).toBeNull();
  });

  it("Pro hard day: shows the exact -fat / +carbs delta", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          trainingFuel: fuel({
            carbDeltaG: 40,
            fatDeltaG: 18,
            proteinDeltaG: 0,
          }),
        })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toContain("-18g fat");
    expect(section.textContent).toContain("+40g carbs");
    expect(
      screen.queryByRole("button", { name: /training-aware macros/i })
    ).toBeNull();
  });

  it("Pro constrained day: fat→protein protection copy, no fake carb claim", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          targetTooAggressive: true,
          trainingFuel: fuel({
            carbDeltaG: 0,
            fatDeltaG: 12,
            proteinDeltaG: 9,
          }),
        })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toContain("-12g fat");
    expect(section.textContent).toContain("+9g protein");
    expect(section.textContent).not.toContain("+0g carbs");
  });

  it("free hard day: capability copy that never claims the shift happened", () => {
    render(
      <Harness
        dailyTargets={targets({ trainingFuel: fuel({ applied: false }) })}
      />
    );
    const section = screen.getByLabelText("Training-aware fuel");
    expect(section.textContent).toMatch(/Pro shifts carbs up and fat down/i);
    expect(section.textContent).not.toMatch(/Today uses/i); // no applied-change claim
    expect(
      screen.getByRole("button", { name: /See training-aware macros/i })
    ).toBeInTheDocument();
  });

  it("free CTA opens ProModal (adaptive_macros) only after the sheet closes", async () => {
    render(
      <Harness
        dailyTargets={targets({ trainingFuel: fuel({ applied: false }) })}
      />
    );
    // Not mounted before the request — the paywall is queued until the
    // controlled `open` prop is observed false (no nested focus traps).
    expect(screen.queryByTestId("pro-modal")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /See training-aware macros/i })
    );
    const modal = await waitFor(() => screen.getByTestId("pro-modal"));
    expect(modal.getAttribute("data-feature")).toBe("adaptive_macros");
  });

  it("Pro user never sees the paywall CTA", () => {
    mockIsPro = true;
    render(
      <Harness
        dailyTargets={targets({
          trainingFuel: fuel({ carbDeltaG: 20, fatDeltaG: 9 }),
        })}
      />
    );
    expect(
      screen.queryByRole("button", { name: /training-aware macros/i })
    ).toBeNull();
  });
});

/**
 * The macro bars must move the same direction as the tile that opened this
 * sheet.
 *
 * `MacroColumn` documents the property — the bar is "mode-locked to the big
 * number's direction so both signals move in lockstep" — and this sheet was
 * the one surface that never received the mode. It drew consumed%
 * unconditionally, so the SAME protein data rendered as a 9.2%-full bar on
 * the tile and an 88.7%-full bar here, one tap apart, measured off the Food
 * capture frames.
 *
 * Rendered rather than unit-tested on the helper, because the helper's own
 * suite already passes when this component ignores it: reverting the sheet
 * to raw `pct` leaves `calorieRingFill.test.ts` green and typechecks
 * cleanly. The wiring is the thing that broke, so the wiring is what this
 * asserts.
 */
describe("HeroDrillDownSheet — bars follow the hero's display mode", () => {
  /** Inline widths of the three MACRO bars.
   *
   *  Scoped to the "Macros" section deliberately. The micronutrient rows
   *  below it use the same `h-1.5` bar, and they must NOT follow this
   *  mode: fiber is a goal and sugar/sodium are limits, so "remaining"
   *  does not mean the same thing there. An unscoped query caught a
   *  fourth bar sitting at 32% in both modes — correct behaviour that a
   *  sloppier assertion would have called a bug.
   *
   *  Read from `document`, not render's `container`: `BottomSheet` portals
   *  its content to the body, which is why every other test here uses
   *  `screen`. */
  function barWidths(): string[] {
    const heading = Array.from(document.querySelectorAll("p")).find(
      (el) => el.textContent?.trim() === "Macros"
    );
    const section = heading?.closest("section");
    if (!section) return [];
    return Array.from(section.querySelectorAll<HTMLElement>("div"))
      .filter(
        (el) =>
          el.style.width.endsWith("%") &&
          (el.parentElement?.className ?? "").includes("h-1.5")
      )
      .map((el) => el.style.width);
  }

  /* Rendered directly rather than through `Harness`, which hardcodes
     all-zero totals — at 0% consumed the two directions are 100 and 0,
     which sums correctly even if one of them is a constant. Partial
     consumption is what makes the assertion mean something. */
  function renderAt(mode: "left" | "eaten") {
    window.localStorage.setItem("tropos.food.calorieRingMode", mode);
    return render(
      <HeroDrillDownSheet
        open
        onOpenChange={() => {}}
        selectedDate="2026-07-13"
        isToday
        dailyTotals={{
          calories: 1000,
          protein: 56,
          carbs: 110,
          fat: 30,
          fiber: 12,
          sugar: 20,
          sodium: 900,
        }}
        dailyTargets={targets({
          protein: 140,
          carbs: 273,
          fat: 61,
        } as Partial<EffectiveTargets>)}
      />
    );
  }

  it("drains in LEFT mode and fills in EATEN mode — opposite, not offset", () => {
    const { unmount } = renderAt("left");
    const left = barWidths();
    expect(left.length, "no macro bars rendered").toBeGreaterThanOrEqual(3);
    unmount();

    renderAt("eaten");
    const eaten = barWidths();

    expect(eaten).toHaveLength(left.length);
    left.forEach((w, i) => {
      const l = Number.parseFloat(w);
      const e = Number.parseFloat(eaten[i]);
      expect(
        l + e,
        `macro bar ${i}: LEFT ${w} + EATEN ${eaten[i]} should be one full ` +
          `bar. If they are EQUAL the sheet is ignoring the mode, which is ` +
          `the defect that put a 9% bar on the tile and an 89% bar here.`
      ).toBeCloseTo(100, 4);
    });
  });
});
