/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// framer-motion → plain elements (strip animation props)
vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_t: any, prop: string) {
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _tr,
              variants: _v,
              whileTap: _w,
              layout: _l,
              ...rest
            } = props;
            const Tag = prop === "create" ? "div" : prop;
            return <Tag {...rest} />;
          };
        },
      }
    ),
    AnimatePresence: function ({ children }: any) {
      return children;
    },
  };
});

const { hapticMock } = vi.hoisted(function () {
  return { hapticMock: vi.fn() };
});
vi.mock("@/lib/haptic", function () {
  return { haptic: hapticMock };
});

// Keep the test focused on the always-on affordance, not ring internals.
vi.mock("@/components/home/MacroRing", function () {
  return { default: () => <div data-testid="macro-ring" /> };
});
vi.mock("@/components/home/BreakdownRow", function () {
  return { default: () => <div data-testid="breakdown-row" /> };
});

import TodayEnergy from "../TodayEnergy";

/**
 * The expand state is PERSISTED now (usePersistedToggle), so a test that
 * opens the card writes that choice to localStorage and every later test
 * in this file inherits an already-expanded card.
 *
 * That is the feature working — the card is supposed to remember — but
 * jsdom keeps one localStorage for the whole file, so without this the
 * "collapsed summary" tests silently start asserting against the
 * expanded body. It surfaced as `Unable to find "P 0g · C 0g · F 0g
 * left"` on a test that never touched the toggle.
 */
beforeEach(() => {
  window.localStorage.clear();
});

const burn: any = {
  phase: null,
  phaseLabel: "Maintain",
  phaseAdjustedTdee: 2200,
  workoutCalories: 0,
  runCalories: 0,
  stepCalories: 0,
};
const targets: any = {
  finalTarget: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
};

function renderAt(props: any = {}) {
  return render(
    <MemoryRouter>
      <TodayEnergy
        calories={0}
        protein={0}
        carbs={0}
        fat={0}
        burn={burn}
        targets={targets}
        {...props}
      />
    </MemoryRouter>
  );
}

describe("TodayEnergy — always-on Log affordance (#973)", function () {
  it("renders a Log affordance routing to /food", function () {
    renderAt();
    const link = screen.getByRole("link", { name: "Log food" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/food");
  });

  it("is present for the empty/new segment (no meals ever logged)", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.getByRole("link", { name: "Log food" })).toBeInTheDocument();
  });

  it("is present for an active segment (meals logged today)", function () {
    renderAt({
      calories: 1450,
      protein: 90,
      carbs: 150,
      fat: 45,
      totalLifetimeMeals: 420,
    });
    expect(screen.getByRole("link", { name: "Log food" })).toBeInTheDocument();
  });

  it("fires haptic feedback on tap", function () {
    hapticMock.mockClear();
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    fireEvent.click(screen.getByRole("link", { name: "Log food" }));
    expect(hapticMock).toHaveBeenCalled();
  });
});

describe("TodayEnergy — collapsed macro summary vs expanded rings (Wave3 E1)", function () {
  it("collapsed default shows the compact eaten/target macro line, NOT the rings", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    // Same framing as the calorie line above it: eaten / target per macro.
    expect(
      screen.getByText("P 80/160g · C 56/220g · F 38/70g")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("macro-ring")).toBeNull();
  });

  it("frames the calories as eaten / target in words, not just a slash", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    expect(screen.getByText("eaten")).toBeInTheDocument();
    expect(screen.getByText("/ 2,200 kcal")).toBeInTheDocument();
  });

  it("expanding the card reveals the three macro rings", function () {
    renderAt({
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
    });
    fireEvent.click(screen.getByText("Today's Energy"));
    expect(screen.getAllByTestId("macro-ring")).toHaveLength(3);
    // summary line hides once expanded (rings carry the detail)
    expect(screen.queryByText(/P 80\/160g/)).toBeNull();
  });

  it("REMEMBERS an expand across a remount, per account", function () {
    /* The reported friction. `expanded` was plain useState, so the card
       re-collapsed on every arrival at Home and anyone who wanted the
       macro breakdown re-opened it every single visit.

       Asserted at the CARD, not just the hook: usePersistedToggle has
       its own unit tests, and they would all pass while this component
       still called useState — the wiring is the part that regressed.

       The closed default is untouched (Wave3 E1); what is pinned here is
       that a tap counts as a choice, and that the choice is uid-scoped so
       a shared device doesn't carry one account's layout into another. */
    const props = {
      calories: 1450,
      protein: 80,
      carbs: 56,
      fat: 38,
      totalLifetimeMeals: 420,
      uid: "user-A",
    };
    const first = renderAt(props);
    expect(screen.queryByTestId("macro-ring")).toBeNull();
    fireEvent.click(screen.getByText("Today's Energy"));
    expect(screen.getAllByTestId("macro-ring")).toHaveLength(3);
    first.unmount();

    // Same account returns → still open, with no second tap.
    const second = renderAt(props);
    expect(screen.getAllByTestId("macro-ring")).toHaveLength(3);
    second.unmount();

    // A different account on the same device → their own default.
    renderAt({ ...props, uid: "user-B" });
    expect(screen.queryByTestId("macro-ring")).toBeNull();
  });

  it("an over-target macro reads plainly (200/160g) — never clamped away", function () {
    renderAt({
      calories: 3000,
      protein: 200,
      carbs: 300,
      fat: 90,
      totalLifetimeMeals: 420,
    });
    expect(
      screen.getByText("P 200/160g · C 300/220g · F 90/70g")
    ).toBeInTheDocument();
  });

  it("cold-start (no meals ever) shows neither the summary line nor the rings", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(screen.queryByText(/P \d+\/\d+g/)).toBeNull();
    expect(screen.queryByTestId("macro-ring")).toBeNull();
    expect(
      screen.getByText("Log a meal to see your daily energy")
    ).toBeInTheDocument();
  });
});

describe("TodayEnergy — one logging action, no duplicated target rows (cohesion V02)", function () {
  const foodLinks = () =>
    screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/food");

  it("an active day has exactly one way into the food log", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    expect(foodLinks()).toHaveLength(1);
    fireEvent.click(screen.getByText("Today's Energy"));
    // Expanding must not add a second one ("View food log" is gone).
    expect(foodLinks()).toHaveLength(1);
  });

  it("cold-start explains with a status line and still offers exactly one link", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 0 });
    expect(foodLinks()).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Log a meal to see your daily energy"
    );
  });

  it("a lapsed user (3+ days without a meal) gets a note, not a second link", function () {
    renderAt({ calories: 0, totalLifetimeMeals: 40, daysSinceLastMeal: 5 });
    expect(screen.getByText("Nothing logged yet today")).toBeInTheDocument();
    expect(foodLinks()).toHaveLength(1);
  });

  it("the details omit the plan-target row when it equals the header target", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    fireEvent.click(screen.getByText("Today's Energy"));
    // burn.phaseAdjustedTdee (2200) === targets.finalTarget (2200), and no
    // activity burned: nothing in the details restates the header.
    expect(screen.queryAllByTestId("breakdown-row")).toHaveLength(0);
  });

  it("the details show the plan target once adaptation has moved the header away from it", function () {
    renderAt({
      calories: 1450,
      totalLifetimeMeals: 420,
      burn: { ...burn, phaseAdjustedTdee: 2400 },
    });
    fireEvent.click(screen.getByText("Today's Energy"));
    expect(screen.getAllByTestId("breakdown-row")).toHaveLength(1);
  });

  it("labels the disclosure — Details — and reports its state", function () {
    renderAt({ calories: 1450, totalLifetimeMeals: 420 });
    const header = screen.getByRole("button", { name: /today's energy/i });
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Details")).toBeInTheDocument();
    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });
});

describe("TodayEnergy — HOME-TARGET-01 truthful targets/copy", () => {
  it("phase chip shows the label WITHOUT a fabricated +300/−500 delta", () => {
    renderAt({
      calories: 1000,
      burn: { ...burn, phase: "cut" },
    });
    expect(screen.getByText("Cut")).toBeInTheDocument();
    expect(screen.queryByText(/−500/)).toBeNull();
    expect(screen.queryByText(/\+300/)).toBeNull();
  });

  it("bulk phase likewise shows only the label", () => {
    renderAt({
      calories: 1000,
      burn: { ...burn, phase: "lean bulk" },
    });
    expect(screen.getByText("Bulk")).toBeInTheDocument();
    expect(screen.queryByText(/\+300/)).toBeNull();
  });

  it("post-lift protein nudge ties to the target, not a recovery claim", () => {
    renderAt({
      calories: 1200,
      postWorkoutNudge: { type: "lift", proteinRemaining: 40 },
    });
    expect(screen.getByText(/40g protein to your target/i)).toBeInTheDocument();
    expect(screen.queryByText(/for recovery/i)).toBeNull();
  });
});

/**
 * Three-surface consistency: a target the split cannot fund is named in
 * the same sentence on Home, Food and Settings (macroInfeasibility.ts).
 * Before this Home read "P 125/0g" — 0 g rendered as the goal — while only
 * Settings warned.
 */
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";

describe("TodayEnergy — infeasible target notice", function () {
  it("renders the shared sentence when the target cannot fund essential fat", function () {
    renderAt({
      calories: 1790,
      protein: 125,
      carbs: 172,
      fat: 56,
      totalLifetimeMeals: 40,
      targets: {
        ...targets,
        finalTarget: 100,
        protein: 0,
        carbs: 0,
        fat: 42,
        targetInfeasible: true,
        minFeasibleKcal: 378,
      },
    });
    expect(
      screen.getByText(macroInfeasibilityMessage(378))
    ).toBeInTheDocument();
  });

  it("says nothing on an ordinary target", function () {
    renderAt({ targets: { ...targets, targetInfeasible: false } });
    expect(screen.queryByText(/essential fat alone exceeds/)).toBeNull();
  });
});
