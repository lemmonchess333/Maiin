// @vitest-environment jsdom
/**
 * Run9's starter goal reached: a plain Done, and what comes next offered
 * once: two plans with no race date, Build to 5K and Keep fit (Run24 (3)),
 * and the 5K, each a tap into Run plan with it chosen. Dismissed per
 * account and per goal, and taking an offer dismisses it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthUidContext } from "@/lib/auth";
import StarterDoneCard from "../StarterDoneCard";
import { STARTER } from "@/test/journeyScreens";
import {
  ROLLING_GOAL_LINES,
  ROLLING_GOAL_NAMES,
} from "@/features/program/rollingPlan";

function withUid(uid: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthUidContext.Provider value={uid}>{children}</AuthUidContext.Provider>
    );
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("StarterDoneCard", () => {
  it("says Done and offers what comes next: two plans with no date, and a 5K", () => {
    render(<StarterDoneCard startedOn="2026-09-07" navigate={vi.fn()} />, {
      wrapper: withUid("u1"),
    });
    // The names the journeys find (src/test/journeyScreens.ts).
    expect(screen.getByText(STARTER.done)).toBeInTheDocument();
    expect(screen.getByText(STARTER.goal)).toBeInTheDocument();
    expect(
      screen.getByText("Next, if you like: a plan with no race date, or a 5K.")
    ).toBeInTheDocument();
    const next = screen.getByRole("group", { name: "What’s next" });
    expect(
      within(next)
        .getAllByRole("button")
        .map((row) => row.textContent)
    ).toEqual([
      `${STARTER.buildTo5k}${ROLLING_GOAL_LINES.build_5k}`,
      `${STARTER.keepFit}${ROLLING_GOAL_LINES.keep_fit}`,
      `${STARTER.offer}At a race or on your own, on a date you pick.`,
    ]);
    // The plans are called what setup and Run plan call them.
    expect(STARTER.buildTo5k).toBe(ROLLING_GOAL_NAMES.build_5k);
    expect(STARTER.keepFit).toBe(ROLLING_GOAL_NAMES.keep_fit);
    expect(
      screen.getByRole("button", { name: STARTER.notNow })
    ).toBeInTheDocument();
  });

  it("names each row by its plan and describes it by what its weeks hold", () => {
    render(<StarterDoneCard startedOn="2026-09-07" navigate={vi.fn()} />, {
      wrapper: withUid("u1"),
    });
    const row = screen.getByRole("button", { name: STARTER.buildTo5k });
    expect(row).toHaveAccessibleDescription(ROLLING_GOAL_LINES.build_5k);
    expect(
      screen.getByRole("button", { name: STARTER.keepFit })
    ).toHaveAccessibleDescription(ROLLING_GOAL_LINES.keep_fit);
    expect(
      screen.getByRole("button", { name: STARTER.offer })
    ).toHaveAccessibleDescription(
      "At a race or on your own, on a date you pick."
    );
  });

  it.each([
    [STARTER.buildTo5k, "/settings/run-plan?goal=build_5k"],
    [STARTER.keepFit, "/settings/run-plan?goal=keep_fit"],
    [STARTER.offer, "/settings/run-plan?goal=5k"],
  ])(
    "takes %s to Run plan with it chosen, and is not offered again",
    (name, path) => {
      const navigate = vi.fn();
      const { unmount } = render(
        <StarterDoneCard startedOn="2026-09-07" navigate={navigate} />,
        { wrapper: withUid("u1") }
      );
      fireEvent.click(screen.getByRole("button", { name }));
      expect(navigate).toHaveBeenCalledWith(path);
      expect(screen.queryByText("Done")).not.toBeInTheDocument();
      unmount();
      // Home and Train read the same answer.
      render(<StarterDoneCard startedOn="2026-09-07" navigate={navigate} />, {
        wrapper: withUid("u1"),
      });
      expect(screen.queryByText("Done")).not.toBeInTheDocument();
    }
  );

  it("stays dismissed for this account and this goal only", () => {
    const navigate = vi.fn();
    const { unmount } = render(
      <StarterDoneCard startedOn="2026-09-07" navigate={navigate} />,
      { wrapper: withUid("u1") }
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(navigate).not.toHaveBeenCalled();
    unmount();
    // Another account on this device.
    const other = render(
      <StarterDoneCard startedOn="2026-09-07" navigate={vi.fn()} />,
      { wrapper: withUid("u2") }
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
    other.unmount();
    // A later goal of the same account.
    render(<StarterDoneCard startedOn="2027-01-04" navigate={vi.fn()} />, {
      wrapper: withUid("u1"),
    });
    expect(screen.getByText("Done")).toBeInTheDocument();
  });
});
