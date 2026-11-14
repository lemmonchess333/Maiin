/**
 * The activity level offer on Food (whole-app grill Q31): the card, and
 * where it is drawn. The web never reads steps and never shows it; on the
 * phone it shows for a Pro account on the formula's target, with no
 * number of its own and outside a race taper, under the wheel, today only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EffectiveTargets } from "@/hooks/useEffectiveTargets";
import type { StepActivityOffer as Offer } from "@/lib/stepActivity";
import { group } from "@/test/localeGrouping";

const h = vi.hoisted(() => ({
  native: true,
  isPro: true,
  profile: {} as Record<string, unknown>,
  hookCalls: 0,
  offer: null as unknown,
  nextTarget: null as number | null,
  accept: vi.fn(() => Promise.resolve()),
  keep: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/platform", () => ({ isNativePlatform: () => h.native }));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ isPro: h.isPro }),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u1" }, profile: h.profile }),
  useUid: () => "u1",
  useUidForStorageKey: () => "u1",
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useStepActivityOffer", () => ({
  useStepActivityOffer: () => {
    h.hookCalls += 1;
    return {
      offer: h.offer,
      nextTarget: h.nextTarget,
      accept: h.accept,
      keep: h.keep,
    };
  },
}));

import { StepActivityOffer } from "../StepActivityOfferCard";
import FoodHeroCard from "../FoodHeroCard";

const UP: Offer = {
  weekKey: "2026-11-02",
  averageSteps: 11240,
  daysCounted: 7,
  from: "light",
  to: "active",
  direction: "up",
};

const FORMULA = {
  finalTarget: 2380,
  adaptiveSource: "formula",
  taperActive: false,
  protein: 150,
  carbs: 250,
  fat: 70,
  showWarmup: false,
  warmupFraction: 1,
  adaptiveStalled: false,
  personalTarget: null,
} as unknown as EffectiveTargets;

beforeEach(() => {
  h.native = true;
  h.isPro = true;
  h.profile = {};
  h.hookCalls = 0;
  h.offer = UP;
  h.nextTarget = 2710;
  h.accept.mockClear();
  h.keep.mockClear();
});

describe("the activity level offer", () => {
  it("says the steps, the level the target assumes, and the target it sets", () => {
    render(<StepActivityOffer targets={FORMULA} />);
    expect(
      screen.getByRole("region", { name: "Your steps say Active" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `You averaged ${group(11240)} steps a day last week. Your target assumes Light.`
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Active sets your target to ${group(2710)} kcal, up from ${group(2380)} kcal.`
      )
    ).toBeInTheDocument();
  });

  it("takes the level in one tap, or keeps the old one", async () => {
    render(<StepActivityOffer targets={FORMULA} />);
    fireEvent.click(screen.getByRole("button", { name: "Use Active" }));
    await waitFor(() => expect(h.accept).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Keep Light" }));
    await waitFor(() => expect(h.keep).toHaveBeenCalledTimes(1));
  });

  it("draws nothing while there is no offer", () => {
    h.offer = null;
    h.nextTarget = null;
    const { container } = render(<StepActivityOffer targets={FORMULA} />);
    // Anchored: the reader ran, and found nothing to say.
    expect(h.hookCalls).toBeGreaterThan(0);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("where it reads steps at all", () => {
  it("never on the web, which has no Apple Health", () => {
    h.native = false;
    const { container } = render(<StepActivityOffer targets={FORMULA} />);
    expect(container).toBeEmptyDOMElement();
    expect(h.hookCalls).toBe(0);
    // The same targets on the phone do read.
    h.native = true;
    render(<StepActivityOffer targets={FORMULA} />);
    expect(h.hookCalls).toBeGreaterThan(0);
  });

  it("not for a free account, a learned or manual target, or a taper", () => {
    const cases: Array<[string, () => void, EffectiveTargets]> = [
      ["free", () => (h.isPro = false), FORMULA],
      [
        "learned",
        () => {},
        { ...FORMULA, adaptiveSource: "learned" } as EffectiveTargets,
      ],
      ["manual", () => (h.profile = { customCalorieTarget: 1900 }), FORMULA],
      ["taper", () => {}, { ...FORMULA, taperActive: true }],
    ];
    for (const [name, arrange, targets] of cases) {
      h.isPro = true;
      h.profile = {};
      h.hookCalls = 0;
      arrange();
      const { container, unmount } = render(
        <StepActivityOffer targets={targets} />
      );
      expect(container, name).toBeEmptyDOMElement();
      expect(h.hookCalls, name).toBe(0);
      unmount();
    }
  });

  it("sits under Food's wheel today, and not on another day", () => {
    const hero = (isToday: boolean) =>
      render(
        <MemoryRouter>
          <FoodHeroCard
            selectedDate="2026-11-13"
            isToday={isToday}
            dailyTargets={FORMULA}
            dailyTotals={{ calories: 0, protein: 0, carbs: 0, fat: 0 }}
          />
        </MemoryRouter>
      );
    const today = hero(true);
    expect(
      screen.getByRole("region", { name: "Your steps say Active" })
    ).toBeInTheDocument();
    today.unmount();
    h.hookCalls = 0;
    hero(false);
    expect(screen.queryByRole("region", { name: /Your steps say/ })).toBeNull();
    expect(h.hookCalls).toBe(0);
  });
});
