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

describe("FoodHeroCard — day annotation merged into the caption (Wave3 G)", () => {
  function renderMerged(
    annotation: string,
    isToday: boolean,
    caption: unknown = { trainingType: "Run day", adjustment: "" }
  ) {
    const targets = {
      ...dailyTargets,
      annotation,
      caption,
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

  it("merges the rationale into the hero caption today: '{dayType} · {rationale}'", () => {
    renderMerged("Hard session", true);
    expect(screen.getByText("Run day · Hard session")).toBeInTheDocument();
  });

  it("shows only the day type on past/future (diary) views — rationale suppressed", () => {
    renderMerged("Hard session", false);
    expect(screen.getByText("Run day")).toBeInTheDocument();
    expect(screen.queryByText(/Hard session/)).toBeNull();
  });

  it("does NOT render a separate floating annotation line (single source)", () => {
    const { container } = renderMerged("Hard session", true);
    const matches = [...container.querySelectorAll("p")].filter((p) =>
      /Hard session/.test(p.textContent || "")
    );
    expect(matches).toHaveLength(1);
  });

  it("caption shows just the day type when the annotation is empty", () => {
    renderMerged("", true);
    expect(screen.getByText("Run day")).toBeInTheDocument();
  });

  it("renders no day label at all on a rest day (caption null)", () => {
    renderMerged("", true, null);
    expect(screen.queryByText(/Run day|Rest day/)).toBeNull();
  });
});
