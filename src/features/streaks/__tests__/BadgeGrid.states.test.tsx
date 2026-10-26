/**
 * The badge page while its streams arrive, and when one could not be read.
 *
 * It rendered the loaded layout from the first frame: streak 0, longest 0,
 * no badges, every tile locked, for as long as loading lasted and for good
 * after a failed read. Those are claims about the person. It now shows a
 * placeholder in the page's shape, then the figures, or says the read
 * failed and offers to try again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BADGE_DEFINITIONS } from "../badges";

const h = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/features/streaks/useStreaks", () => ({
  useStreaks: () => h.state,
}));
vi.mock("@/hooks/useLiftUnit", () => ({ useLiftUnit: () => "kg" }));

import { BadgeGrid } from "../BadgeGrid";

const retryLoad = vi.fn();

function streaks(over: Record<string, unknown>) {
  h.state = {
    currentStreak: 12,
    longestStreak: 40,
    allBadges: BADGE_DEFINITIONS.map((b) => ({ ...b, earnedAt: null })),
    earnedBadges: [],
    badgeProgressCtx: {
      currentStreak: 12,
      workouts: [],
      runs: [],
      today: new Date("2026-09-16T12:00:00"),
    },
    loading: false,
    loadFailed: false,
    retryLoad,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  retryLoad.mockReset();
});

describe("BadgeGrid's states", () => {
  it("shows the figures once loaded (the anchor)", () => {
    streaks({});
    render(<BadgeGrid />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Current streak")).toBeInTheDocument();
  });

  it("shows no figure while loading", () => {
    streaks({ loading: true, currentStreak: 0, longestStreak: 0 });
    render(<BadgeGrid />);
    // The labels keep their place; the figures are placeholders.
    expect(screen.getByText("Current streak")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    // No tile claims a badge is locked before the badges are known.
    expect(screen.queryByText(BADGE_DEFINITIONS[0].name)).toBeNull();
  });

  it("says the read failed, and tries again on request", () => {
    streaks({ loadFailed: true, currentStreak: 0, longestStreak: 0 });
    render(<BadgeGrid />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your badges"
    );
    expect(screen.queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryLoad).toHaveBeenCalledTimes(1);
  });
});
