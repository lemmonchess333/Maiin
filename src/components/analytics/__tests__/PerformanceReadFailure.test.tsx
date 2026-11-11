import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PerformanceOverviewCard from "../PerformanceOverviewCard";
import PerformanceSection from "../PerformanceSection";
import PerformanceTab from "../PerformanceTab";

const mock = vi.hoisted(() => ({
  refresh: vi.fn(),
  loading: false,
  failed: true,
}));
vi.mock("@/hooks/usePerformance", () => ({
  usePerformanceWeeks: () => ({
    weeks: [],
    currentWeek: null,
    previousWeek: null,
    docsAvailable: 0,
    ...mock,
  }),
}));
vi.mock("@/lib/homeAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/historyAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/hooks/useWeeklyReview", () => ({
  useReviewEligibility: () => ({ eligible: false, weekKey: null }),
}));

const surfaces = [
  [
    "overview",
    () => <PerformanceOverviewCard hasLoggedSession onOpenDetails={() => {}} />,
  ],
  ["section", () => <PerformanceSection hasLoggedSession />],
  ["tab", () => <PerformanceTab />],
] as const;

beforeEach(() => {
  mock.refresh.mockReset();
  mock.loading = false;
  mock.failed = true;
});

describe.each(surfaces)("%s performance read failure", (_, surface) => {
  it("hides the prior failure while a retry is loading", () => {
    mock.loading = true;
    render(<MemoryRouter>{surface()}</MemoryRouter>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers retry instead of claiming there are no scores or training sessions", () => {
    render(<MemoryRouter>{surface()}</MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Performance could not load"
    );
    expect(
      screen.queryByText(/Log a workout|No sessions|your first weekly score/)
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mock.refresh).toHaveBeenCalledOnce();
  });
});
