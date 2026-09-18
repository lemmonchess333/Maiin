/**
 * The Weekly Review's run lane in the reader's unit.
 *
 * `review.training.runs.km` and `.longestKm` are stored KILOMETRES, and
 * both printed a literal `km`. A miles reader was shown the metric figure
 * on their own week — the number was right and the unit was somebody
 * else's.
 *
 * `distanceUnitGate.test.ts` could not see it. That gate matches a
 * metres→km conversion sitting within a few characters of a literal `km`,
 * and here the `/ 1000` happens in `weeklyReviewViewModel.ts` while the
 * `km` is printed in the page — so there is no arithmetic at the call site
 * for it to anchor on. An already-kilometre quantity with a hardcoded unit
 * is a shape that gate is blind to by construction.
 *
 * Both units are asserted, because a test that only checks miles passes if
 * the conversion is applied twice.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";

let mockProfile: Partial<UserProfile> | null = null;
let mockReview: unknown = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-1" }, profile: mockProfile }),
  useUid: () => "u-1",
}));

vi.mock("@/hooks/useWeeklyReview", () => ({
  useWeeklyReview: () => ({
    loading: false,
    review: mockReview,
    weekKey: "2026-W27",
  }),
  reviewViewedKey: (weekKey: string) => `tropos-review-viewed:${weekKey}`,
}));

vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: () => ({ dismiss: vi.fn(), dismissed: false }),
}));

import WeeklyReview from "../WeeklyReview";

/* 42.2 km is the marathon, chosen so the miles figure (26.2) is one a
   reader recognises on sight — a wrong conversion is obvious rather than
   plausible. The longest run is 21.1 km / 13.1 mi for the same reason. */
const REVIEW = {
  kind: "normal",
  range: { start: "2026-06-29", end: "2026-07-05" },
  weekAhead: { lifts: null, runs: null, phaseNote: null },
  training: {
    lifts: null,
    runs: { count: 3, km: 42.2, longestKm: 21.1, planned: null },
    prsHit: null,
  },
};

function renderAt(unit: "km" | "mi") {
  mockProfile = { preferredDistanceUnit: unit } as Partial<UserProfile>;
  mockReview = REVIEW;
  return render(
    <MemoryRouter>
      <WeeklyReview />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  mockProfile = null;
  mockReview = null;
});

describe("WeeklyReview — run distances follow the reader's unit", () => {
  it("prints kilometres for a metric reader", () => {
    renderAt("km");
    expect(screen.getByText(/42\.2 km/)).toBeTruthy();
    expect(screen.getByText(/longest\s*21\.1 km/)).toBeTruthy();
    expect(screen.queryByText(/mi\b/)).toBeNull();
  });

  it("converts for a miles reader instead of relabelling", () => {
    renderAt("mi");
    expect(screen.getByText(/26\.2 mi/)).toBeTruthy();
    expect(screen.getByText(/longest\s*13\.1 mi/)).toBeTruthy();
    // The pre-fix rendering: the metric number under a metric unit.
    expect(screen.queryByText(/42\.2/)).toBeNull();
    expect(screen.queryByText(/\bkm\b/)).toBeNull();
  });

  it("keeps the unit spaced, as the house rule requires", () => {
    // `unitTreatment.test.ts` bans "26.2mi" — worth asserting on the
    // rendered output too, since the spacing lives inside a helper here
    // rather than in the JSX the line-scanner reads.
    renderAt("mi");
    expect(screen.queryByText(/\d(mi|km)\b/)).toBeNull();
  });
});
