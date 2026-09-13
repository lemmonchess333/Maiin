import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecentRunningContext from "../RecentRunningContext";
import type { RunSummaryItem } from "@/hooks/useRunningStats";

const state = vi.hoisted(() => ({
  runs: [] as RunSummaryItem[],
  loading: true,
  failed: false,
  refresh: vi.fn(),
}));
vi.mock("@/hooks/useRunningStats", () => ({ useRunningStats: () => state }));

describe("recent running evidence states", () => {
  it("keeps loading, unavailable and empty distinct, with retry", () => {
    const view = render(<RecentRunningContext />);
    fireEvent.click(screen.getByText("Recent running"));
    expect(screen.getByText("Loading your recent runs…")).toBeVisible();
    state.loading = false;
    state.failed = true;
    view.rerender(<RecentRunningContext />);
    expect(
      screen.getByText(/has not been treated as zero training/)
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refresh).toHaveBeenCalledOnce();
    state.failed = false;
    view.rerender(<RecentRunningContext />);
    expect(screen.getByText(/No eligible runs are recorded/)).toBeVisible();
    expect(screen.queryByText(/Average:/)).not.toBeInTheDocument();
  });
  it("copies recorded evidence only after an explicit tap", () => {
    state.loading = false;
    state.failed = false;
    state.runs = [
      {
        id: "recorded",
        completedAt: new Date(),
        duration: 1800,
        distance: 5000,
        avgPace: 360,
        elevationGain: 0,
        calories: 0,
        activityType: "manual",
        relativeEffort: null,
      },
    ];
    const onUse = vi.fn();
    render(<RecentRunningContext onUse={onUse} />);
    fireEvent.click(screen.getByText("Recent running"));
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Use these numbers in my draft" })
    );
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 1,
        averageWeeklyMinutes: 7.5,
        longestMinutes: 30,
      })
    );
    state.runs = [];
  });
});
