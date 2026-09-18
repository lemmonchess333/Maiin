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
  useUid: () =>
    ({ user: { uid: "u-1" }, profile: mockProfile }).user?.uid ?? null,
}));

vi.mock("@/hooks/useWeeklyReview", () => ({
  useWeeklyReview: () => ({
    loading: mockLoading,
    review: mockReview,
    weekKey: "2026-W27",
  }),
  /* Signature must match the real one. It lost its `uid` argument when
     dismissal keys moved to being uid-scoped by `useDismissOnce` itself,
     and this mock kept the old two-arg shape — silently, because
     `useDismissOnce` is mocked below and never looks at the key. A mock
     that outlives the API it stands in for is the same rot as a comment
     that does. */
  reviewViewedKey: (weekKey: string) => `tropos-review-viewed:${weekKey}`,
}));

/* The page renders the real `MomentumCheckinCard`, which awaits a real
   `getDoc`. Unmocked, that boots the Firestore SDK, and the SDK emits a
   `console.warn` about 600ms in — "Error using user provided cache.
   Falling back to memory cache" — long after these four tests have
   finished.

   Under full-suite load that log lands while the worker's RPC is closing,
   and vitest fails the whole job with `EnvironmentTeardownError: Closing
   rpc while "onUserConsoleLog" was pending`, every test passing and the
   run exiting 1. It is always attributed to this file because this is the
   one suite that boots the SDK: measured on three separate runs before
   this mock existed.

   The bare form is the repo's one Firestore fake (ADR-0009). Mocking the
   card instead would work today and would stop working the moment the
   page grows another Firestore-touching child. */
vi.mock("firebase/firestore");

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
    expect(screen.getByText("Why you train")).toBeTruthy();
    expect(screen.getByText(/Feel stronger/)).toBeTruthy();
  });

  it("does not show the why when the profile has none", () => {
    mockProfile = { trainingWhy: "" };
    mockReview = QUIET_REVIEW;
    renderReview();
    expect(screen.queryByText("Why you train")).toBeNull();
  });

  it("treats a whitespace-only why as unset", () => {
    mockProfile = { trainingWhy: "   " };
    mockReview = QUIET_REVIEW;
    renderReview();
    expect(screen.queryByText("Why you train")).toBeNull();
  });

  it("does not show the why before a review exists (empty first week)", () => {
    mockProfile = { trainingWhy: "Feel stronger" };
    mockReview = null;
    renderReview();
    expect(screen.queryByText("Why you train")).toBeNull();
  });
});
