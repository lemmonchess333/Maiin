/**
 * FoodHeroCard — single shared display mode invariant.
 *
 * The hero used to split its left⇄eaten framing across two owners: the
 * calorie ring carried `mode`, while each macro tile tracked its own
 * independent state. That let the ring read "… kcal LEFT" while all three
 * tiles read "…g eaten" — two opposite framings on one card. This suite
 * pins the unification: the ring AND all three macro tiles share ONE mode,
 * tapping the ring OR any tile flips all four together, and the choice
 * persists under the calorie-ring storage key.
 *
 * isToday={false} keeps the test on the mode wiring only — it skips the
 * glance line, warmup bar, and celebration sequence, none of which are
 * relevant to the shared-mode contract.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import FoodHeroCard from "../FoodHeroCard";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import { setCalorieRingMode } from "@/hooks/useCalorieRingMode";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ profile: { targetCalories: 2000 } }),
  useUid: () => null,
  // The celebration key is uid-scoped (localStorage is per-device); this
  // suite is about display, so a fixed uid is enough.
  useUidForStorageKey: () => "u-test",
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

const MODE_STORAGE_KEY = "tropos.food.calorieRingMode";

// Under-target totals so the macro tiles read "left" (not "over") in left mode.
const dailyTotals = { calories: 1000, protein: 50, carbs: 80, fat: 20 };

const dailyTargets = {
  finalTarget: 2000,
  protein: 150,
  carbs: 200,
  fat: 60,
  showWarmup: false,
} as unknown as EffectiveTargets;

function renderHero() {
  return render(
    <MemoryRouter>
      <FoodHeroCard
        selectedDate="2026-06-09"
        isToday={false}
        dailyTargets={dailyTargets}
        dailyTotals={dailyTotals}
      />
    </MemoryRouter>
  );
}

// The three macro tiles render as <button data-macro="…">. Their label
// (<p>left</p> / <p>logged</p>) is the per-tile framing we assert on.
// The stored mode for the second is "eaten"; the tile says "logged".
function tileModes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-macro]")).map((btn) => {
    const text = btn.textContent ?? "";
    if (text.includes("logged")) return "logged";
    if (text.includes("over")) return "over";
    if (text.includes("left")) return "left";
    return "?";
  });
}

// The ring is the only button carrying the toggle aria-label.
function ringButton() {
  return screen.getByRole("button", {
    name: /toggle between calories left and calories logged/i,
  });
}

describe("FoodHeroCard — the targets gear has left the card", () => {
  it("draws no targets link: it is in the page's header row (Food11)", () => {
    renderHero();
    expect(
      screen.queryByRole("link", { name: /adjust nutrition targets/i })
    ).toBeNull();
  });
});

describe("FoodHeroCard — the macros are one row with no boxes", () => {
  it("draws the three macros in the row form, outside any card", () => {
    // Food11 call 4. Three boxed tiles under the boxed ring were four of
    // the twelve boxes the first screen carried.
    const { container } = renderHero();
    const macros = Array.from(container.querySelectorAll("[data-macro]"));
    expect(macros.map((m) => m.getAttribute("data-macro"))).toEqual([
      "protein",
      "carbs",
      "fat",
    ]);
    for (const macro of macros) {
      expect(macro).toHaveClass("text-left");
      expect(macro.closest(".card-shadow")).toBeNull();
      expect(macro.closest(".bg-card")).toBeNull();
    }
    const grid = macros[0].parentElement!;
    expect(grid).toHaveClass("grid", "grid-cols-3");
    expect(macros.every((m) => m.parentElement === grid)).toBe(true);
  });
});

describe("FoodHeroCard — single shared display mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to 'left' for the ring and all three tiles", () => {
    const { container } = renderHero();
    expect(tileModes(container)).toEqual(["left", "left", "left"]);
    expect(ringButton().getAttribute("aria-label")).toMatch(/remaining/i);
  });

  it("tapping a macro tile flips the ring AND all three tiles to 'logged'", () => {
    const { container } = renderHero();

    const proteinTile = within(container).getByRole("button", {
      name: /protein/i,
    });
    fireEvent.click(proteinTile);

    // All three tiles flipped together — not just the tapped one.
    expect(tileModes(container)).toEqual(["logged", "logged", "logged"]);
    // The ring flipped too: its logged view names no remainder. (Its tap
    // hint names both views, so matching the word alone proves nothing.)
    expect(ringButton().getAttribute("aria-label")).not.toMatch(/remaining/i);
    // Persisted under the shared key.
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");
  });

  it("tapping the ring flips all three tiles too", () => {
    const { container } = renderHero();

    fireEvent.click(ringButton());

    expect(tileModes(container)).toEqual(["logged", "logged", "logged"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");

    // …and back again — ring + tiles stay in lockstep.
    fireEvent.click(ringButton());
    expect(tileModes(container)).toEqual(["left", "left", "left"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("left");
  });

  it("hydrates the shared mode from the persisted calorie-ring key", () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, "eaten");
    const { container } = renderHero();
    expect(tileModes(container)).toEqual(["logged", "logged", "logged"]);
    expect(ringButton().getAttribute("aria-label")).not.toMatch(/remaining/i);
  });
});

describe("FoodHeroCard — no day-type caption on the card", () => {
  /* The top-left line carried "{dayType} · {rationale}" ("Lift day · Hard
     session") on training days. Owner call from the hero-glow options:
     the card is the ring and its number, not a briefing — the line goes.
     The day type and rationale still exist on the targets and still
     render in the Details sheet (HeroDrillDownSheet's own tests), so
     this pins ABSENCE on the card while the data stays: the targets are
     handed the caption and the annotation, and neither reaches the
     surface. Anchored on the ring being present, so an empty render
     could not pass it. */
  function renderWithDayType(isToday: boolean) {
    const targets = {
      ...dailyTargets,
      annotation: "Hard session",
      caption: { trainingType: "Run day", adjustment: "" },
    } as unknown as EffectiveTargets;
    return render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday={isToday}
          dailyTargets={targets}
          dailyTotals={dailyTotals}
        />
      </MemoryRouter>
    );
  }

  it("today: neither the day type nor the rationale renders on the card", () => {
    renderWithDayType(true);
    expect(ringButton()).toBeInTheDocument();
    expect(screen.queryByText(/Run day/)).toBeNull();
    expect(screen.queryByText(/Hard session/)).toBeNull();
  });

  it("diary views: the same — the caption was never a date-specific thing", () => {
    renderWithDayType(false);
    expect(ringButton()).toBeInTheDocument();
    expect(screen.queryByText(/Run day/)).toBeNull();
  });
});

describe("FoodHeroCard — the glow behind the ring", () => {
  it("is the food orange alone, with no purple (owner, 7 November 2026)", () => {
    /* It was a wash from orange into the brand purple, the only two-hue
       gradient on an everyday screen in 178 measured (DS4 §14m rule 13),
       and dark was 2.5x louder than light. One hue now, drawn by its
       class (components.css), faint enough to count in neither theme. */
    const { container } = render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday
          dailyTargets={dailyTargets}
          dailyTotals={dailyTotals}
        />
      </MemoryRouter>
    );
    const glow = container.querySelector(".food-hero-glow") as HTMLElement;
    expect(glow, "the glow layer").toBeTruthy();
    expect(glow).toHaveAttribute("aria-hidden", "true");
    expect(glow).toHaveClass("absolute", "inset-0");
    expect(container.innerHTML).not.toContain("--primary");
  });
});

describe("FoodHeroCard — calm summary", () => {
  it("keeps decorative photos and empty encouragement off the calorie summary", () => {
    const { container } = render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday
          dailyTargets={dailyTargets}
          dailyTotals={{ calories: 0, protein: 0, carbs: 0, fat: 0 }}
        />
      </MemoryRouter>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText("Ready when you are")).toBeNull();
    expect(ringButton()).toBeInTheDocument();
  });
});

/**
 * Three-surface consistency: a target the split cannot fund is named in
 * the same sentence on Food, Home and Settings (macroInfeasibility.ts).
 * Before this the macro tiles here read "125 / 0g PROTEIN" — 0 g rendered
 * as the goal — while only Settings warned.
 */
import { macroInfeasibilityMessage } from "@/lib/macroInfeasibility";

describe("FoodHeroCard — infeasible target notice", () => {
  const infeasibleTargets = {
    ...dailyTargets,
    finalTarget: 100,
    protein: 0,
    carbs: 0,
    fat: 42,
    targetInfeasible: true,
    minFeasibleKcal: 378,
  } as unknown as EffectiveTargets;

  it("renders the shared sentence when the target cannot fund essential fat", () => {
    render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday={true}
          dailyTargets={infeasibleTargets}
          dailyTotals={{ calories: 1790, protein: 125, carbs: 172, fat: 56 }}
        />
      </MemoryRouter>
    );
    expect(
      screen.getByText(macroInfeasibilityMessage(378))
    ).toBeInTheDocument();
  });

  it("says nothing on an ordinary target", () => {
    renderHero();
    expect(screen.queryByText(/essential fat alone exceeds/)).toBeNull();
  });
});

describe("FoodHeroCard — Nutr3: below the floor, protein and carbs carry no goal", () => {
  it("renders — for the protein and carb targets and keeps fat's floor figure", () => {
    render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday={true}
          dailyTargets={
            {
              ...dailyTargets,
              protein: 0,
              carbs: 0,
              fat: 42,
              targetInfeasible: true,
              minFeasibleKcal: 378,
            } as unknown as EffectiveTargets
          }
          dailyTotals={{ calories: 900, protein: 80, carbs: 56, fat: 38 }}
        />
      </MemoryRouter>
    );
    const tiles = Array.from(document.querySelectorAll("[data-macro]"));
    const protein = tiles.find(
      (t) => t.getAttribute("data-macro") === "protein"
    )!;
    const fat = tiles.find((t) => t.getAttribute("data-macro") === "fat")!;
    // The big number animates from 0 (count-up), so assert the ratio line's
    // shape rather than the settled figure.
    expect(protein).toHaveAccessibleName(/no target/);
    expect(protein).not.toHaveAccessibleName(/of 0g/);
    expect(fat).toHaveAccessibleName(/of 42g/);
    expect(screen.getByRole("status")).toHaveTextContent(
      /essential fat alone exceeds/
    );
  });
});

describe("FoodHeroCard — drawIn", () => {
  /* Food remounts the hero per day so a day switch fires no log haptic
     or celebration. drawIn={false} makes that remount arrive at the
     day's figures rather than counting every number up from zero.
     Protein in the left view: 150 − 50 = 100g left.

     The mode store keeps its last value in memory, and an earlier test
     can leave it at "eaten". Then the first render reads the logged
     figure, the store re-reads storage on subscribe, and the tile
     animates from 50 to 100. Setting the store as well as storage keeps
     the first render on the left view, whatever ran before. */
  function renderHeroDrawIn(drawIn?: boolean) {
    window.localStorage.setItem(MODE_STORAGE_KEY, "left");
    setCalorieRingMode("left");
    return render(
      <MemoryRouter>
        <FoodHeroCard
          selectedDate="2026-06-09"
          isToday={false}
          dailyTargets={dailyTargets}
          dailyTotals={dailyTotals}
          drawIn={drawIn}
        />
      </MemoryRouter>
    );
  }

  it("false paints the macro figure on the first frame", () => {
    const { container } = renderHeroDrawIn(false);
    expect(
      container.querySelector('[data-macro="protein"]')!.textContent
    ).toMatch(/100g/);
  });

  it("the default still counts up from zero", () => {
    const { container } = renderHeroDrawIn();
    expect(
      container.querySelector('[data-macro="protein"]')!.textContent
    ).not.toMatch(/100g/);
  });
});
