/**
 * The review's month card (App1 Q56): on a month's first Monday, a Pro
 * account's review carries what Pro did in the month before, before the
 * week ahead. A month with nothing says so; a free account sees nothing.
 * What the card counts is `useProReport`'s and `proReport`'s, tested there.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProMonthReport } from "@/hooks/useProReport";

let mockReport: ProMonthReport | null = null;
let mockProLoading = false;
let mockReview: unknown = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { uid: "u-1" }, profile: {} }),
  useUid: () => "u-1",
}));

vi.mock("@/hooks/useWeeklyReview", () => ({
  useWeeklyReview: () => ({
    loading: false,
    review: mockReview,
    weekKey: "2026-10-26",
    failed: false,
    retry: vi.fn(),
  }),
  reviewViewedKey: (weekKey: string) => `tropos-review-viewed:${weekKey}`,
}));

vi.mock("@/hooks/useProReport", () => ({
  useProMonthReport: () => ({ loading: mockProLoading, report: mockReport }),
}));

vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("firebase/firestore");
vi.mock("@/features/program/useHomeProgram", () => ({
  useHomeProgram: () => ({
    programState: null,
    loading: false,
    recentLayoff: "none",
    recentRuns: null,
    controller: null,
  }),
}));
vi.mock("@/hooks/useDismissOnce", () => ({
  useDismissOnce: () => ({ dismiss: vi.fn(), dismissed: false }),
}));
vi.mock("@/components/share/ShareCardSheet", () => ({ default: () => null }));

import WeeklyReview from "../WeeklyReview";

const WEEK = {
  kind: "normal",
  weekKey: "2026-10-26",
  range: { start: "2026-10-26", end: "2026-11-01" },
  headline: null,
  training: {
    lifts: { done: 3, planned: 3, tonnageKg: 12000 },
    runs: null,
    prsHit: null,
    best: null,
  },
  nutrition: null,
  body: null,
};

const OCTOBER = { start: "2026-10-01", end: "2026-10-31", name: "October" };

function renderRecap() {
  return render(
    <MemoryRouter initialEntries={["/review"]}>
      <Routes>
        <Route path="/review" element={<WeeklyReview />} />
      </Routes>
    </MemoryRouter>
  );
}

const slides = () =>
  screen.getAllByRole("group").map((el) => el.getAttribute("aria-label"));

afterEach(() => {
  cleanup();
  mockReport = null;
  mockProLoading = false;
  mockReview = null;
});

describe("WeeklyReview — what Pro did in the month", () => {
  it("comes before the week ahead, in the person's own numbers", () => {
    mockReview = WEEK;
    mockReport = {
      month: OCTOBER,
      lines: [
        { kind: "calories", count: 2, from: 2300, to: 2450 },
        { kind: "photo_scans", count: 9 },
      ],
    };
    renderRecap();
    expect(slides()).toEqual([
      "Your week, 1 of 3",
      "Pro in October, 2 of 3",
      "The week ahead, 3 of 3",
    ]);
    const card = screen.getByRole("group", { name: "Pro in October, 2 of 3" });
    expect(
      within(card).getByRole("heading", { name: "Pro in October" })
    ).toBeInTheDocument();
    expect(within(card).getByText("9")).toBeInTheDocument();
    expect(
      within(card).getByText("meals scanned from a photo")
    ).toBeInTheDocument();
    // The week's card leads to it by name.
    expect(
      screen.getByRole("button", { name: "Pro in October" })
    ).toBeInTheDocument();
  });

  it("says so in one line when Pro changed nothing", () => {
    mockReview = WEEK;
    mockReport = { month: OCTOBER, lines: [] };
    renderRecap();
    expect(
      screen.getByText("Pro made no changes for you in October.")
    ).toBeInTheDocument();
  });

  it("follows a quiet week too", () => {
    mockReview = { kind: "quiet", weekKey: "2026-10-26", range: WEEK.range };
    mockReport = { month: OCTOBER, lines: [] };
    renderRecap();
    expect(slides()).toEqual([
      "A quiet week, 1 of 3",
      "Pro in October, 2 of 3",
      "The week ahead, 3 of 3",
    ]);
  });

  it("is not there without a report: a free account, or another Monday", () => {
    mockReview = WEEK;
    renderRecap();
    expect(slides()).toEqual(["Your week, 1 of 2", "The week ahead, 2 of 2"]);
    expect(
      screen.getByRole("button", { name: "The week ahead" })
    ).toBeInTheDocument();
  });

  it("waits for the month before showing the cards", () => {
    mockReview = WEEK;
    mockProLoading = true;
    renderRecap();
    expect(slides()).toEqual(["Loading, 1 of 1"]);
  });
});
