/**
 * D16 — the Weekly Review resurfaces the user's personal "why".
 *
 * Render-level (jsdom) pins of the resurface guard `!loading && review &&
 * trainingWhy`: the quote appears verbatim when a review exists AND the
 * profile has a non-empty why, and is suppressed otherwise (no why, or no
 * review yet / still loading — so it never lands on the empty first-week
 * state).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";

// ── Hook mocks ──────────────────────────────────────────────────────────
let mockProfile: Partial<UserProfile> | null = null;
let mockReview: unknown = null;
let mockLoading = false;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-1" }, profile: mockProfile }),
}));

vi.mock("@/hooks/useWeeklyReview", () => ({
  useWeeklyReview: () => ({
    loading: mockLoading,
    review: mockReview,
    weekKey: "2026-W27",
  }),
  reviewViewedKey: (uid: string, week: string) => `${uid}:${week}`,
}));

vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: () => ({ dismiss: vi.fn(), dismissed: false }),
}));

import WeeklyReview from "../WeeklyReview";

// A minimal "quiet" review — enough for `review` to be truthy and the
// week-ahead block (which reads review.weekAhead) to render.
const QUIET_REVIEW = {
  kind: "quiet",
  range: { start: "2026-06-29", end: "2026-07-05" },
  weekAhead: { lifts: null, runs: null, phaseNote: null },
};

function renderReview() {
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
  mockLoading = false;
});

describe("WeeklyReview — D16 resurfaces the why", () => {
  it("shows the why quote when a review exists and a why is set", () => {
    mockProfile = { trainingWhy: "Feel stronger" };
    mockReview = QUIET_REVIEW;
    renderReview();
    expect(screen.getByText("Your why")).toBeTruthy();
    expect(screen.getByText(/Feel stronger/)).toBeTruthy();
  });

  it("does not show the why when the profile has none", () => {
    mockProfile = { trainingWhy: "" };
    mockReview = QUIET_REVIEW;
    renderReview();
    expect(screen.queryByText("Your why")).toBeNull();
  });

  it("treats a whitespace-only why as unset", () => {
    mockProfile = { trainingWhy: "   " };
    mockReview = QUIET_REVIEW;
    renderReview();
    expect(screen.queryByText("Your why")).toBeNull();
  });

  it("does not show the why before a review exists (empty first week)", () => {
    mockProfile = { trainingWhy: "Feel stronger" };
    mockReview = null;
    renderReview();
    expect(screen.queryByText("Your why")).toBeNull();
  });
});
