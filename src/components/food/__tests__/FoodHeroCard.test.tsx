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
// (<p>left</p> / <p>eaten</p>) is the per-tile framing we assert on.
function tileModes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-macro]")).map((btn) => {
    const text = btn.textContent ?? "";
    if (text.includes("eaten")) return "eaten";
    if (text.includes("over")) return "over";
    if (text.includes("left")) return "left";
    return "?";
  });
}

// The ring is the only button carrying the toggle aria-label.
function ringButton() {
  return screen.getByRole("button", {
    name: /toggle between calories left and calories eaten/i,
  });
}

describe("FoodHeroCard — adjust-targets gear", () => {
  it("deep-links to the focused nutrition editor, not the Settings list", () => {
    renderHero();
    const gear = screen.getByRole("link", {
      name: /adjust nutrition targets/i,
    });
    expect(gear).toHaveAttribute("href", "/settings/nutrition");
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

  it("tapping a macro tile flips the ring AND all three tiles to 'eaten'", () => {
    const { container } = renderHero();

    const proteinTile = within(container).getByRole("button", {
      name: /protein/i,
    });
    fireEvent.click(proteinTile);

    // All three tiles flipped together — not just the tapped one.
    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    // The ring flipped too.
    expect(ringButton().getAttribute("aria-label")).toMatch(/eaten/i);
    // Persisted under the shared key.
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");
  });

  it("tapping the ring flips all three tiles too", () => {
    const { container } = renderHero();

    fireEvent.click(ringButton());

    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("eaten");

    // …and back again — ring + tiles stay in lockstep.
    fireEvent.click(ringButton());
    expect(tileModes(container)).toEqual(["left", "left", "left"]);
    expect(window.localStorage.getItem(MODE_STORAGE_KEY)).toBe("left");
  });

  it("hydrates the shared mode from the persisted calorie-ring key", () => {
    window.localStorage.setItem(MODE_STORAGE_KEY, "eaten");
    const { container } = renderHero();
    expect(tileModes(container)).toEqual(["eaten", "eaten", "eaten"]);
    expect(ringButton().getAttribute("aria-label")).toMatch(/eaten/i);
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

describe("FoodHeroCard — the wash behind the ring", () => {
  it("the two corner colours reach far enough to meet, in both themes", () => {
    /* Two ellipses, the food surface's orange top-left and the brand
       purple bottom-right, each spanning most of the card with a
       three-stop falloff. Pinned on the recipe's shape rather than its
       exact alphas: both hue tokens present, each with a mid stop and a
       far edge (past 70% of the card), and the light theme no longer
       dimmed to 70% — that dim is what made the last version invisible. */
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
    const wash = container.querySelector(
      '[aria-hidden="true"].absolute.inset-0'
    ) as HTMLElement;
    expect(wash, "the wash layer").toBeTruthy();
    const bg = wash.style.background;
    expect(bg).toContain("--nutrition");
    expect(bg).toContain("--primary");
    expect(bg.match(/transparent (7[5-9]|8\d)%/g)?.length).toBe(2);
    expect(bg.match(/radial-gradient/g)?.length).toBe(2);
    expect(wash).toHaveClass("opacity-85", "dark:opacity-100");
    expect(wash).not.toHaveClass("opacity-70");
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
