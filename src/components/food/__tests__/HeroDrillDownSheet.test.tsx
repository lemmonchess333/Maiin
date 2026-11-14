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
import { setCalorieRingMode } from "@/hooks/useCalorieRingMode";
import { groupRe, groupTextRe } from "@/test/localeGrouping";
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
    learnedMaintenance: null,
    showWarmup: false,
    warmupFraction: 0,
    adaptiveStalled: false,
    personalTarget: null,
    protein: 180,
    carbs: 300,
    fat: 60,
    annotation: "Hard session",
    fuelLabel: null,
    caption: null,
    targetTooAggressive: false,
    targetInfeasible: false,
    minFeasibleKcal: 0,
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
 * The macro bars must be drawn the way the macro that opened this sheet
 * is: with what is logged, whichever way the numbers count (Food11 call
 * 5; `loggedFill` in `calorieRingFill.ts` has the rule and its reasons).
 *
 * This sheet was once the surface that broke it. The tile's bar emptied
 * in "left" and the sheet drew what was logged, so the SAME protein was a
 * 9.2%-full bar on the tile and an 88.7%-full bar here, one tap apart,
 * measured off the Food capture frames. Food10 fixed that by making the
 * sheet empty too; Food11 turned the wheel, the bars and this sheet round
 * together, so they still agree and none of them depends on the mode.
 *
 * Rendered, because the wiring is what broke: a helper's own suite stays
 * green when a component stops calling it.
 */
describe("HeroDrillDownSheet — bars are what is logged, in both modes", () => {
  /** Inline widths of the three MACRO bars.
   *
   *  Scoped to the "Macros" section deliberately. The micronutrient rows
   *  below it use the same `h-1.5` bar and are their own rule: fiber is
   *  a goal and sugar and sodium are limits.
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
     all-zero totals: at nothing logged a bar that follows the rule and
     one stuck at zero look the same. Partial amounts are what make the
     assertion mean something. */
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

  it("draws the logged share in LEFT mode, the same bars as in LOGGED mode", () => {
    const { unmount } = renderAt("left");
    const left = barWidths();
    // 56 of 140g, 110 of 273g, 30 of 61g.
    expect(left).toEqual(["40%", "40%", "49%"]);
    unmount();

    renderAt("eaten");
    expect(barWidths()).toEqual(left);
  });

  it("prints the logged share beside the grams logged in LEFT mode", () => {
    renderAt("left");
    // The headline counts what is left; the line under the bar says what
    // is logged, and the percentage is the bar's.
    expect(screen.getByText("56g logged · 40%")).toBeInTheDocument();
    expect(screen.getByText("30g logged · 49%")).toBeInTheDocument();
  });

  it("draws the calorie bar the same way", () => {
    renderAt("left");
    const heading = Array.from(document.querySelectorAll("p")).find(
      (el) => el.textContent?.trim() === "Calories"
    );
    const section = heading!.closest("section")!;
    const fill = section.querySelector<HTMLElement>(".h-2 > div")!;
    const pct = Number.parseFloat(fill.style.width);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
    expect(section).toHaveTextContent(`${pct}%`);
    expect(section).toHaveTextContent(
      new RegExp(`${groupTextRe(1000)} kcal logged`)
    );
  });
});

describe("HeroDrillDownSheet — counts the way the card does (Food10 (1))", () => {
  /* The headline led with what was logged in both modes, so in left mode
     "64%" of what was left sat beside the calories eaten. */
  const day = { ...totals, calories: 993, protein: 73 };
  function open() {
    render(
      <HeroDrillDownSheet
        open
        onOpenChange={() => {}}
        selectedDate="2026-07-13"
        isToday
        dailyTotals={day}
        dailyTargets={targets()}
      />
    );
  }
  afterEach(() => setCalorieRingMode("left"));

  it("leads with what is left while the card shows what is left", () => {
    setCalorieRingMode("left");
    open();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(
      new RegExp(`${groupRe(1507)}\\s*left of ${groupRe(2500)} kcal`)
    );
    expect(text).toMatch(/993 kcal logged/);
    expect(text).toMatch(/107g left of 180g/);
    expect(text).toMatch(/73g logged/);
  });

  it("leads with what is logged while the card shows what is logged", () => {
    setCalorieRingMode("eaten");
    open();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(new RegExp(`993\\s*/ ${groupRe(2500)} kcal`));
    expect(text).toMatch(/73\s*\/ 180g/);
    expect(text).not.toMatch(/left of/);
  });
});

describe("HeroDrillDownSheet — other nutrients keep each unit's treatment", () => {
  /* Grams are the food surface's house style, unspaced; milligrams are
     not grams, so they take the app's spaced unit and are grouped. The
     rows shared one template that glued whichever unit it was handed, so
     sodium read "2300mg" two rows under fiber's "38g". */
  it("writes fiber in grams unspaced and sodium in spaced, grouped milligrams", () => {
    render(
      <HeroDrillDownSheet
        open
        onOpenChange={() => {}}
        selectedDate="2026-07-13"
        isToday
        dailyTotals={{ ...totals, fiber: 18, sodium: 1840 }}
        dailyTargets={targets()}
      />
    );
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/18\s*\/ 38g/);
    expect(text).toMatch(/20g to goal/);
    expect(text).toMatch(
      new RegExp(`${groupRe(1840)}\\s*/ ${groupRe(2300)} mg`)
    );
    expect(text).toMatch(/460 mg left/);
    expect(text).not.toMatch(/\dmg\b/);
  });
});

describe("HeroDrillDownSheet — the way to the week", () => {
  /* The weekly reading (days on target, protein, the weekend) lives on
     Analytics' Food page; this row is the way there from a day. */
  it("offers This week and hands the tap to the page", () => {
    const onOpenWeek = vi.fn();
    render(
      <HeroDrillDownSheet
        open
        onOpenChange={() => {}}
        selectedDate="2026-07-13"
        isToday
        dailyTotals={totals}
        dailyTargets={targets()}
        onOpenWeek={onOpenWeek}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^This week/ }));
    expect(onOpenWeek).toHaveBeenCalledTimes(1);
  });

  it("draws no row when the page gives it nowhere to go", () => {
    render(<Harness dailyTargets={targets()} />);
    expect(screen.getByText("Macros")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^This week/ })).toBeNull();
  });
});
