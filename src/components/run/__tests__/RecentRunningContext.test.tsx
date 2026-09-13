import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RecentRunningContext from "../RecentRunningContext";

const state = vi.hoisted(() => ({
  runs: [],
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
});
