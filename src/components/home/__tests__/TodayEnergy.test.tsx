/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { hapticMock } = vi.hoisted(function () {
  return { hapticMock: vi.fn() };
});
vi.mock("@/lib/haptic", function () {
  return { haptic: hapticMock };
});
/* Figures count up unless motion is reduced. With it reduced they render
   their final value at once, which is what these assertions read. */
vi.mock("@/hooks/useReducedMotion", function () {
  return { useReducedMotion: () => true };
});

import TodayEnergy from "../TodayEnergy";
import { setCalorieRingMode } from "@/hooks/useCalorieRingMode";
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

const A_DAY = {
  calories: 1450,
  protein: 80,
  carbs: 56,
  fat: 38,
};

/** The calorie ring: a button named for what it shows. */
const ring = () => screen.getByRole("button", { name: / calories / });

/** A macro tile, and its number and label. */
function tile(key: "protein" | "carbs" | "fat") {
  const el = document.querySelector<HTMLElement>(`[data-macro="${key}"]`);
  if (!el) throw new Error(`no ${key} tile`);
  return el;
}
function reads(key: "protein" | "carbs" | "fat", value: string, word: string) {
  const t = within(tile(key));
  expect(t.getByText(value)).toBeInTheDocument();
  expect(t.getByText(word)).toBeInTheDocument();
}

beforeEach(function () {
  /* The left/logged switch is a module-level store over localStorage.
     Clearing storage alone leaves the store holding the last test's mode
     for the first render, and the ring fades that stale label out while
     the next assertion is looking: reset the store itself, then storage. */
  setCalorieRingMode("left");
  localStorage.clear();
  hapticMock.mockClear();
});

describe("TodayEnergy — the Food page's ring and tiles", function () {
  it("draws Food's own ring and tiles, not copies of them", function () {
    /* Home and Food showing the same day as two different things is the
       defect this card exists to end: the same components, at two sizes,
       keep them one object. A copy here would drift the way the old card
       did. */
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../TodayEnergy.tsx"), "utf8");
    expect(src).toMatch(/from "@\/components\/food\/CalorieRing"/);
    expect(src).toMatch(/from "@\/components\/food\/MacroColumn"/);
    expect(src).toMatch(/size="compact"/);
  });

  it("leads with what is left of the target, inside the ring", function () {
    renderAt(A_DAY);
    expect(ring()).toHaveAccessibleName(
      /^1450 of 2200 calories logged, 750 remaining/
    );
    expect(screen.getByText(groupText(750))).toBeInTheDocument();
    expect(screen.getByText("kcal left")).toBeInTheDocument();
  });

  it("counts the macros down too, so the card agrees with itself", function () {
    renderAt(A_DAY);
    reads("protein", "80", "left");
    reads("carbs", "164", "left");
    reads("fat", "32", "left");
    for (const key of ["protein", "carbs", "fat"] as const) {
      expect(within(tile(key)).queryByText("logged")).toBeNull();
    }
  });

  it("sets the macros on the card itself, with no box of their own", function () {
    /* The card is already the box; a grey tile per macro inside it was a
       box in a box (owner call; DS3's STATUS lines). */
    renderAt(A_DAY);
    for (const key of ["protein", "carbs", "fat"] as const) {
      expect(tile(key).parentElement!.className).not.toMatch(/\bbg-|rounded/);
    }
  });

  it("shows all three macros, named in full, without any interaction", function () {
    renderAt(A_DAY);
    expect(screen.getByText("Protein")).toBeInTheDocument();
    expect(screen.getByText("Carbs")).toBeInTheDocument();
    expect(screen.getByText("Fat")).toBeInTheDocument();
    // No cramped summary line, and nothing behind a disclosure.
    expect(screen.queryByText(/P \d+\/\d+g/)).toBeNull();
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

describe("TodayEnergy — the day's shape", function () {
  it("reads the whole target as left on an empty day, and still shows the macros", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    // The figure above "kcal left" in the ring. Raw textContent, so the
    // runtime's own grouping (`group`), not Testing Library's normalized
    // form: fr-FR groups with U+202F.
    expect(screen.getByText("kcal left").previousSibling?.textContent).toBe(
      group(2200)
    );
    // Zero is information, not a reason to hide the macros.
    reads("protein", "160", "left");
  });

  it("says how far past the target a high day is, plainly", function () {
    renderAt({ calories: 3000, protein: 200, carbs: 300, fat: 90 });
    expect(screen.getByText(groupText(800))).toBeInTheDocument();
    expect(screen.getByText("kcal over")).toBeInTheDocument();
    // Over-target macros read plainly — never clamped away.
    reads("protein", "40", "over");
    reads("carbs", "80", "over");
    reads("fat", "20", "over");
  });

  it("drops the lapsed 'Nothing logged yet today' row — the zeros say it", function () {
    renderAt({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(screen.queryByText("Nothing logged yet today")).toBeNull();
  });
});

describe("TodayEnergy — one left/logged switch, shared with Food", function () {
  /* The ring fades its old figure out before the new one mounts
     (AnimatePresence), so its half is awaited; the tiles change at once. */
  it("switches every figure to logged when the ring is tapped", async function () {
    renderAt(A_DAY);
    fireEvent.click(ring());
    expect(await screen.findByText("kcal logged")).toBeInTheDocument();
    expect(screen.getByText(groupText(1450))).toBeInTheDocument();
    reads("protein", "80", "logged");
    reads("carbs", "56", "logged");
    reads("fat", "38", "logged");
    expect(hapticMock).toHaveBeenCalled();
  });

  it("switches from any tile too, and back again", async function () {
    renderAt(A_DAY);
    fireEvent.click(tile("fat"));
    expect(await screen.findByText("kcal logged")).toBeInTheDocument();
    fireEvent.click(tile("protein"));
    expect(await screen.findByText("kcal left")).toBeInTheDocument();
  });

  it("is the Food page's switch: a change on either screen shows on both", async function () {
    renderAt(A_DAY);
    // A tap here is saved where the Food page reads it…
    fireEvent.click(ring());
    expect(localStorage.getItem("tropos.food.calorieRingMode")).toBe("eaten");
    expect(await screen.findByText("kcal logged")).toBeInTheDocument();
    // …and a change made there shows here.
    act(() => setCalorieRingMode("left"));
    expect(await screen.findByText("kcal left")).toBeInTheDocument();
    reads("protein", "80", "left");
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
    renderAt(A_DAY);
    screen.getByRole("link", { name: "Log food" }).click();
    expect(hapticMock).toHaveBeenCalled();
  });
});

describe("TodayEnergy — a reached target is announced, not signalled by colour alone", function () {
  /* Food's tile rule, since these are Food's tiles: a macro at or past
     its target is reached, and past it the tile also says "over". */
  it("names the reached target in the tile's accessible name", function () {
    renderAt({ calories: 2200, protein: 165, carbs: 56, fat: 38 });
    expect(tile("protein")).toHaveAccessibleName(/Protein goal reached/);
    // Carbs is nowhere near its 220 g target, so it must not claim one.
    expect(tile("carbs")).not.toHaveAccessibleName(/goal reached/);
  });

  it("does not claim a target that is only close", function () {
    renderAt({ calories: 2200, protein: 155, carbs: 56, fat: 38 });
    expect(tile("protein")).not.toHaveAccessibleName(/goal reached/);
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
    // Whatever the phase, the card works from the target and never shows
    // a +300/-500 delta.
    renderAt({ ...A_DAY, targets: { ...targets, finalTarget: 1700 } });
    expect(ring()).toHaveAccessibleName(/^1450 of 1700 calories logged/);
    expect(screen.queryByText(/[+−-]\s?\d{3}/)).toBeNull();
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

describe("TodayEnergy — the tiles take the Food page's colours", function () {
  it("colours each icon and bar with the macro's own colour, as Food does", function () {
    renderAt(A_DAY);
    const icon = tile("protein").querySelector("svg")!;
    expect(icon.getAttribute("style")).toMatch(
      /color: (#EC4899|rgb\(236, 72, 153\))/i
    );
    const fill = tile("protein").querySelector(
      "[data-macro-bar] > div"
    ) as HTMLElement;
    expect(fill.getAttribute("style")).toMatch(
      /background: (#EC4899|rgb\(236, 72, 153\))/i
    );
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
      calories: 90,
      protein: 80,
      carbs: 56,
      fat: 38,
      targets: infeasible,
    });
    // No goal, so nothing is "left" of one: what was logged, plainly.
    reads("protein", "80", "logged");
    reads("carbs", "56", "logged");
    // Fat keeps its floor figure.
    reads("fat", "4", "left");
    expect(screen.queryByText(/\/ 0 ?g/)).toBeNull();
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
   * yesterday. In this card it would read as the whole target left.
   */
  it("shows no calorie figure while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    expect(screen.queryByText("kcal left")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: / calories / })).toBeNull();
    expect(
      screen.getByRole("status", { name: /calories still loading/i })
    ).toBeInTheDocument();
  });

  it("shows no macro figures while meals are still loading", function () {
    renderAt({ calories: 0, mealsLoading: true });
    expect(document.querySelector("[data-macro]")).toBeNull();
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
    reads("protein", "70", "left");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps figures it already has rather than flickering back to a skeleton", function () {
    // A refetch with data in hand must not blank the card: the guard is
    // `calories === 0`, not `mealsLoading` alone.
    renderAt({ ...A_DAY, protein: 90, mealsLoading: true });
    expect(screen.getByText(groupText(750))).toBeInTheDocument();
    reads("protein", "70", "left");
  });

  it("still shows a real zero once loading is done", function () {
    renderAt({ calories: 0, mealsLoading: false });
    expect(ring()).toHaveAccessibleName(/^0 of 2200 calories logged/);
    reads("protein", "160", "left");
  });
});
