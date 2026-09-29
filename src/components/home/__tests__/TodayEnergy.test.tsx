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

import TodayEnergy from "../TodayEnergy";
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";
import { group, groupText } from "@/test/localeGrouping";

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
        targets={targets}
        {...props}
      />
    </MemoryRouter>
  );
}

/**
 * Matches text that spans child elements. Figures set in the numeral font
 * sit in their own spans ("80 / 160 g" is a `<p>` wrapping two), so a
 * plain string matcher finds nothing. The children check excludes
 * ancestors, which would otherwise match too.
 */
function spanning(text: string) {
  const norm = (s: string | null | undefined) =>
    (s ?? "").replace(/\s+/g, " ").trim();
  return (_: string, el: Element | null) =>
    !!el &&
    norm(el.textContent) === text &&
    !Array.from(el.children).some((c) => norm(c.textContent) === text);
}

const A_DAY = {
  calories: 1450,
  protein: 80,
  carbs: 56,
  fat: 38,
};

describe("TodayEnergy — everything visible, no disclosure", function () {
  /* Calories and macros are everyday information; they once sat behind a
     "Details" toggle with an abbreviated "P 80/160g · C 56/220g" line
     standing in for them. */
  it("shows all three macros, each against its target, without any interaction", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carbs")).toBeInTheDocument();
    expect(screen.getByText("Fat")).toBeInTheDocument();
    expect(screen.getByText(spanning("80 / 160 g"))).toBeInTheDocument();
    expect(screen.getByText(spanning("56 / 220 g"))).toBeInTheDocument();
    expect(screen.getByText(spanning("38 / 70 g"))).toBeInTheDocument();
    // The cramped summary line is gone in every state.
    expect(screen.queryByText(/P \d+\/\d+g/)).toBeNull();
  });

  it("offers no expand/collapse control at all", function () {
    renderAt(A_DAY);
    expect(screen.queryByText("Details")).toBeNull();
    for (const el of screen.queryAllByRole("button")) {
      expect(el).not.toHaveAttribute("aria-expanded");
    }
  });

  it("renders no stray source comment as visible text", function () {
    /* A `/* ... *\/` block placed directly between JSX elements is not a
       comment — JSX renders it as text. It survives `tsc`, lint and every
       assertion that only looks for strings it EXPECTS. */
    const { container } = renderAt(A_DAY);
    const text = container.textContent ?? "";
    expect(text).not.toContain("/*");
    expect(text).not.toContain("*/");
  });

  it("titles itself Food, and names its region for what it summarises", function () {
    renderAt(A_DAY);
    expect(screen.getByRole("heading", { name: "Food" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Today's food" })
    ).toBeInTheDocument();
  });
});

describe("TodayEnergy — the calorie line is about the LOG", function () {
  it("says what was logged, not what was eaten", function () {
    /* The app knows what reached the diary; it does not know what
       reached the person. An empty diary is a statement about the log. */
    renderAt(A_DAY);
    expect(
      screen.getByText(
        spanning(`${groupText(1450)} of ${groupText(2200)} kcal logged`)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/eaten/)).toBeNull();
  });

  it("leads with what is left of the target", function () {
    renderAt(A_DAY);
    expect(screen.getByText(groupText(750))).toBeInTheDocument();
    expect(screen.getByText("kcal left")).toBeInTheDocument();
  });

  it("reads the whole target as left on an empty day, and still shows the macros", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    // The headline is the figure beside "kcal left". Raw textContent, so
    // the runtime's own grouping (`group`), not Testing Library's
    // normalized form: fr-FR groups with U+202F.
    expect(screen.getByText("kcal left").previousSibling?.textContent).toBe(
      group(2200)
    );
    expect(
      screen.getByText(spanning(`0 of ${groupText(2200)} kcal logged`))
    ).toBeInTheDocument();
    // Zero is information, not a reason to hide the macros.
    expect(screen.getByText(spanning("0 / 160 g"))).toBeInTheDocument();
  });

  it("says how far past the target a high day is, plainly", function () {
    renderAt({ calories: 3000, protein: 200, carbs: 300, fat: 90 });
    expect(screen.getByText(groupText(800))).toBeInTheDocument();
    expect(screen.getByText("kcal over")).toBeInTheDocument();
    // Over-target macros read plainly — never clamped away.
    expect(screen.getByText(spanning("200 / 160 g"))).toBeInTheDocument();
    expect(screen.getByText(spanning("300 / 220 g"))).toBeInTheDocument();
    expect(screen.getByText(spanning("90 / 70 g"))).toBeInTheDocument();
  });

  it("drops the lapsed 'Nothing logged yet today' row — the zeros say it", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(screen.queryByText("Nothing logged yet today")).toBeNull();
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

describe("TodayEnergy — a reached target is announced, not signalled by colour alone", function () {
  it("names the reached target in the macro's accessible name", function () {
    renderAt({ calories: 2200, protein: 155, carbs: 56, fat: 38 });
    expect(
      screen.getByRole("group", {
        name: "Protein 155 of 160 grams, target reached",
      })
    ).toBeInTheDocument();
    // Carbs is nowhere near its 220 g target, so it must not claim one.
    expect(
      screen.getByRole("group", { name: "Carbs 56 of 220 grams" })
    ).toBeInTheDocument();
  });

  it("reads reached as within 10% of the target, the rings' rule, not any amount past it", function () {
    // 200 g of a 160 g target is 125%: over it, not "reached".
    // `macroRingState` holds the band; the card must use it rather than a
    // one-sided threshold of its own.
    renderAt({ calories: 2200, protein: 200, carbs: 56, fat: 38 });
    expect(
      screen.getByRole("group", { name: "Protein 200 of 160 grams" })
    ).toBeInTheDocument();
  });
});

describe("TodayEnergy — HOME-TARGET-01 truthful targets/copy", () => {
  it("carries no nutrition-phase chip", () => {
    renderAt(A_DAY);
    for (const phase of ["Cut", "Bulk", "Recomp"]) {
      expect(screen.queryByText(phase)).toBeNull();
    }
  });

  it("never fabricates a target adjustment", () => {
    // Whatever the phase, the card states the target and never a
    // +300/-500 delta.
    renderAt({ ...A_DAY, targets: { ...targets, finalTarget: 1700 } });
    expect(
      screen.getByText(
        spanning(`${groupText(1450)} of ${groupText(1700)} kcal logged`)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/[+\u2212-]\s?\d{3}/)).toBeNull();
  });

  it("post-lift protein nudge ties to the target, not a recovery claim", () => {
    renderAt({
      calories: 1200,
      postWorkoutNudge: { type: "lift", proteinRemaining: 40 },
    });
    expect(
      screen.getByText(/40 g protein to your target/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/for recovery/i)).toBeNull();
  });

  it("post-run nudge carries no literal plus sign", () => {
    renderAt({
      calories: 1200,
      postWorkoutNudge: { type: "run", proteinRemaining: 40 },
    });
    expect(
      screen.getByText("Post-run: refuel with carbs and protein soon")
    ).toBeInTheDocument();
  });

  it("does not restate the activity breakdown Food's drill-down owns", () => {
    /* Food's nutrition breakdown carries the activity figures and the
       "already counted, no need to eat it back" sentence. The target this
       card shows is unchanged by activity (no eat-back). */
    renderAt(A_DAY);
    expect(screen.queryByText(/already in your target/i)).toBeNull();
    expect(screen.queryByText("Workout")).toBeNull();
    expect(screen.queryByText(/Plan target/)).toBeNull();
  });
});

describe("TodayEnergy — the macro colours follow the theme", function () {
  it("colours each icon with the palette's text step and each bar with the identity", function () {
    const { container } = renderAt(A_DAY);
    const protein = container.querySelector('[data-macro="protein"]')!;
    const icon = protein.querySelector("svg")!;
    // jsdom has no dark class here, so the palette serves the light text
    // step: the raw #EC4899 accent is under AA as text on white.
    expect(icon.getAttribute("style")).toMatch(
      /color: (#BE185D|rgb\(190, 24, 93\))/i
    );
    const bar = protein.querySelector("[style*='width']") as HTMLElement;
    expect(bar.style.backgroundColor).toMatch(/#EC4899|rgb\(236, 72, 153\)/i);
  });
});

/**
 * Three-surface consistency: a target the split cannot fund is named in
 * the same sentence on Home, Food and Settings (macroInfeasibility.ts).
 */
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

  it("Nutr3: below the floor, protein and carbs carry NO goal", function () {
    renderAt({
      calories: 900,
      protein: 80,
      carbs: 56,
      fat: 38,
      targets: infeasible,
    });
    expect(screen.getAllByText(/No target/)).toHaveLength(2);
    expect(screen.getByText(spanning("38 / 42 g"))).toBeInTheDocument();
    expect(screen.queryByText(/\/ 0 g/)).toBeNull();
  });

  it("says nothing on an ordinary target", function () {
    renderAt({ targets: { ...targets, targetInfeasible: false } });
    expect(screen.queryByText(/essential fat alone exceeds/)).toBeNull();
  });
});

describe("TodayEnergy — loading is not the same as having logged nothing", function () {
  /**
   * A confident "0 kcal" while the day's meals are still in flight is a
   * false statement rather than a neutral placeholder: it is identical to
   * the display for a user who genuinely logged nothing, and the reader
   * most likely to meet it is the returning user who logged a full day
   * yesterday.
   */
  it("shows no calorie figure while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    expect(screen.queryByText("kcal left")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: /calories still loading/i })
    ).toBeInTheDocument();
  });

  it("shows no macro figures while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    expect(screen.queryByText(spanning("0 / 160 g"))).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Protein loading" })
    ).toBeInTheDocument();
  });

  it("shows the real figures once meals have loaded", function () {
    renderAt({
      ...A_DAY,
      protein: 90,
      carbs: 150,
      fat: 45,
      mealsLoading: false,
    });
    expect(screen.getByText(groupText(750))).toBeInTheDocument();
    expect(screen.getByText(spanning("90 / 160 g"))).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps figures it already has rather than flickering back to a skeleton", function () {
    // A refetch with data in hand must not blank the card: the guard is
    // `calories === 0`, not `mealsLoading` alone.
    renderAt({ ...A_DAY, protein: 90, mealsLoading: true });
    expect(screen.getByText(groupText(750))).toBeInTheDocument();
    expect(screen.getByText(spanning("90 / 160 g"))).toBeInTheDocument();
  });

  it("still shows a real zero once loading is done", function () {
    renderAt({ calories: 0, mealsLoading: false });
    expect(
      screen.getByText(spanning(`0 of ${groupText(2200)} kcal logged`))
    ).toBeInTheDocument();
    expect(screen.getByText(spanning("0 / 160 g"))).toBeInTheDocument();
  });
});
