/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

/* MacroRing is NOT stubbed here, deliberately. The card's contract is
   that a reader sees three macros without tapping anything, and a
   `data-testid` placeholder cannot tell a rendered gram figure from an
   empty div — the previous suite counted stubs and would have passed
   with the rings rendering nothing at all. BreakdownRow stays stubbed;
   its own content is not what these tests are about. */
import TodayEnergy from "../TodayEnergy";

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

const A_DAY = {
  calories: 1450,
  protein: 80,
  carbs: 56,
  fat: 38,
};

describe("TodayEnergy — everything visible, no disclosure", function () {
  /* The reported defect. Calories and macros are everyday information;
     they sat behind a "Details" toggle with an abbreviated
     "P 80/160g · C 56/220g · F 38/70g" line standing in for the rings. */
  it("shows all three macros without any interaction", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carbs")).toBeInTheDocument();
    expect(screen.getByText("Fat")).toBeInTheDocument();
    expect(screen.getByText("80g")).toBeInTheDocument();
    expect(screen.getByText("56g")).toBeInTheDocument();
    expect(screen.getByText("38g")).toBeInTheDocument();
  });

  it("names every macro target rather than abbreviating them into a row", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Target 160g")).toBeInTheDocument();
    expect(screen.getByText("Target 220g")).toBeInTheDocument();
    expect(screen.getByText("Target 70g")).toBeInTheDocument();
    // The cramped summary line is gone in every state.
    expect(screen.queryByText(/P \d+\/\d+g/)).toBeNull();
  });

  it("offers no expand/collapse control at all", function () {
    renderAt(A_DAY);
    expect(screen.queryByText("Details")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /today's (energy|nutrition)/i })
    ).toBeNull();
    // Nothing in the card claims an expanded/collapsed state.
    for (const el of screen.queryAllByRole("button")) {
      expect(el).not.toHaveAttribute("aria-expanded");
    }
  });

  it("renders no stray source comment as visible text", function () {
    /* A `/* ... *\/` block placed directly between JSX elements is not a
       comment — JSX renders it as text. It survives `tsc`, lint and every
       assertion that only looks for strings it EXPECTS, so the first
       signal was the card measuring 584px in a browser instead of 274.
       Comment JSX with braces, or put the prose in the doc header. */
    const { container } = renderAt(A_DAY);
    const text = container.textContent ?? "";
    expect(text).not.toContain("/*");
    expect(text).not.toContain("*/");
  });

  it("titles itself Today's nutrition", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Today's nutrition")).toBeInTheDocument();
  });
});

describe("TodayEnergy — the calorie line is about the LOG", function () {
  it("says what was logged, not what was eaten", function () {
    /* The app knows what reached the diary; it does not know what
       reached the person. An empty diary is a statement about the log. */
    renderAt(A_DAY);
    expect(screen.getByText(/kcal logged/)).toBeInTheDocument();
    expect(screen.queryByText("eaten")).toBeNull();
  });

  it("reads 0 kcal logged on an empty day, and still shows the macros", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText(/kcal logged/)).toBeInTheDocument();
    // Zero is information, not a reason to hide the rings.
    expect(screen.getAllByText("0g")).toHaveLength(3);
    expect(screen.getByText("Target 160g")).toBeInTheDocument();
  });

  it("labels the daily target", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Target 2,200 kcal")).toBeInTheDocument();
  });

  it("drops the lapsed 'Nothing logged yet today' row — the zeros say it", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(screen.queryByText("Nothing logged yet today")).toBeNull();
  });

  it("drops the cold-start block that duplicated the Log food action", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(
      screen.queryByText("Log a meal to see your daily energy")
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Log food" })).toBeInTheDocument();
  });
});

describe("TodayEnergy — always-on Log affordance (#973)", function () {
  const foodLinks = () =>
    screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/food");

  it("renders a Log affordance routing to /food", function () {
    renderAt();
    const link = screen.getByRole("link", { name: "Log food" });
    expect(link).toHaveAttribute("href", "/food");
  });

  it("is present for the empty/new segment and the active one alike", function () {
    const { unmount } = renderAt({ calories: 0 });
    expect(foodLinks()).toHaveLength(1);
    unmount();
    renderAt(A_DAY);
    expect(foodLinks()).toHaveLength(1);
  });

  it("fires haptic feedback on tap", function () {
    hapticMock.mockClear();
    renderAt(A_DAY);
    screen.getByRole("link", { name: "Log food" }).click();
    expect(hapticMock).toHaveBeenCalled();
  });
});

describe("TodayEnergy — over target stays truthful", function () {
  it("an over-target macro reads plainly — never clamped away", function () {
    renderAt({ calories: 3000, protein: 200, carbs: 300, fat: 90 });
    expect(screen.getByText("200g")).toBeInTheDocument();
    expect(screen.getByText("300g")).toBeInTheDocument();
    expect(screen.getByText("90g")).toBeInTheDocument();
    // The targets they are over are still named beside them.
    expect(screen.getByText("Target 160g")).toBeInTheDocument();
  });

  it("a reached target is announced, not signalled by colour alone", function () {
    renderAt({ calories: 2200, protein: 155, carbs: 56, fat: 38 });
    expect(screen.getByText("Protein target reached")).toBeInTheDocument();
    expect(screen.queryByText("Carbs target reached")).toBeNull();
  });
});

describe("TodayEnergy — HOME-TARGET-01 truthful targets/copy", () => {
  it("phase chip shows the label WITHOUT a fabricated +300/−500 delta", () => {
    renderAt({ calories: 1000, burn: { ...burn, phase: "cut" } });
    expect(screen.getByText("Cut")).toBeInTheDocument();
    expect(screen.queryByText(/−500/)).toBeNull();
    expect(screen.queryByText(/\+300/)).toBeNull();
  });

  it("bulk phase likewise shows only the label", () => {
    renderAt({ calories: 1000, burn: { ...burn, phase: "lean bulk" } });
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

  it("never restates a 'plan target' row, whatever the breakdown's base says", () => {
    // The row this pinned could not render in the app: Home builds the
    // breakdown FROM the header's target (HOME-TARGET-01), so the two
    // never differed and the branch was dead.
    renderAt({ ...A_DAY, burn: { ...burn, phaseAdjustedTdee: 2400 } });
    expect(screen.queryByText(/Plan target/)).toBeNull();
  });

  it("does not restate the activity breakdown Food's drill-down owns", () => {
    /* Nutr1 is not weakened by this — Food's "Nutrition breakdown" sheet
       carries the same figures split by lifting and running, the total,
       and the "already counted, no need to eat it back" sentence. Home
       paid 93px for the copy, and only on days the user had trained,
       which is exactly when the card is most crowded. */
    renderAt({
      ...A_DAY,
      burn: { ...burn, workoutCalories: 420, runCalories: 310 },
    });
    expect(screen.queryByText(/already in your target/i)).toBeNull();
    expect(screen.queryByText("Workout")).toBeNull();
    expect(screen.queryByText("Run")).toBeNull();
    // The calorie target itself is unchanged by activity (no eat-back).
    expect(screen.getByText("Target 2,200 kcal")).toBeInTheDocument();
  });
});

/**
 * Three-surface consistency: a target the split cannot fund is named in
 * the same sentence on Home, Food and Settings (macroInfeasibility.ts).
 */
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";

describe("TodayEnergy — infeasible target notice", function () {
  const infeasible = {
    ...targets,
    finalTarget: 100,
    protein: 0,
    carbs: 0,
    fat: 42,
    targetInfeasible: true,
    minFeasibleKcal: 378,
  };

  it("renders the shared sentence when the target cannot fund essential fat", function () {
    renderAt({
      calories: 1790,
      protein: 125,
      carbs: 172,
      fat: 56,
      targets: infeasible,
    });
    expect(
      screen.getByText(macroInfeasibilityMessage(378))
    ).toBeInTheDocument();
  });

  it("Nutr3: below the floor, protein and carbs carry NO goal on the rings", function () {
    renderAt({
      calories: 900,
      protein: 80,
      carbs: 56,
      fat: 38,
      targets: infeasible,
    });
    expect(screen.getAllByText("No target")).toHaveLength(2);
    expect(screen.getByText("Target 42g")).toBeInTheDocument();
    expect(screen.queryByText(/Target 0g/)).toBeNull();
  });

  it("says nothing on an ordinary target", function () {
    renderAt({ targets: { ...targets, targetInfeasible: false } });
    expect(screen.queryByText(/essential fat alone exceeds/)).toBeNull();
  });
});

describe("TodayEnergy — loading is not the same as having logged nothing", function () {
  /**
   * A confident "0 kcal logged" while the day's meals are still in
   * flight is a false statement rather than a neutral placeholder: it is
   * byte-identical to the display for a user who has genuinely logged
   * nothing, and the reader most likely to meet it is the returning user
   * who logged a full day yesterday. Home has no page-level skeleton
   * past the profile load, so this component owns the distinction — and
   * now owns it for the MACROS too, which are no longer behind a tap.
   */
  it("shows no calorie figure while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: /calories still loading/i })
    ).toBeInTheDocument();
  });

  it("shows no macro figures while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    // The literal a pre-fix render produced for every macro at once.
    expect(screen.queryByText("0g")).not.toBeInTheDocument();
    expect(screen.queryByText("Target 160g")).not.toBeInTheDocument();
  });

  it("shows the real figures once meals have loaded", function () {
    renderAt({
      ...A_DAY,
      protein: 90,
      carbs: 150,
      fat: 45,
      mealsLoading: false,
    });
    expect(screen.getByText("1,450")).toBeInTheDocument();
    expect(screen.getByText("90g")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps figures it already has rather than flickering back to a skeleton", function () {
    // A refetch with data in hand must not blank the card: the guard is
    // `calories === 0`, not `mealsLoading` alone.
    renderAt({ ...A_DAY, protein: 90, mealsLoading: true });
    expect(screen.getByText("1,450")).toBeInTheDocument();
    expect(screen.getByText("90g")).toBeInTheDocument();
  });

  it("still shows a real zero once loading is done", function () {
    renderAt({ calories: 0, mealsLoading: false });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getAllByText("0g")).toHaveLength(3);
  });
});
