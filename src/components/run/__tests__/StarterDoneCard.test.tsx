// @vitest-environment jsdom
/**
 * Run9's starter goal reached: a plain Done, the next goal offered once.
 * Dismissed per account and per goal, and taking the offer dismisses it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthUidContext } from "@/lib/auth";
import StarterDoneCard from "../StarterDoneCard";

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
  it("says Done and offers a 5K, at a race or on your own", () => {
    render(<StarterDoneCard startedOn="2026-09-07" navigate={vi.fn()} />, {
      wrapper: withUid("u1"),
    });
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("30 minutes without stopping")).toBeInTheDocument();
    expect(
      screen.getByText(/train for a 5K, at a race or on your own/i)
    ).toBeInTheDocument();
  });

  it("takes the offer to the run plan, and is not offered again", () => {
    const navigate = vi.fn();
    const { unmount } = render(
      <StarterDoneCard startedOn="2026-09-07" navigate={navigate} />,
      { wrapper: withUid("u1") }
    );
    fireEvent.click(screen.getByRole("button", { name: "Train for a 5K" }));
    expect(navigate).toHaveBeenCalledWith("/settings/run-plan");
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
    unmount();
    // Home and Train read the same answer.
    render(<StarterDoneCard startedOn="2026-09-07" navigate={navigate} />, {
      wrapper: withUid("u1"),
    });
    expect(screen.queryByText("Done")).not.toBeInTheDocument();
  });

  it("stays dismissed for this account and this goal only", () => {
    const { unmount } = render(
      <StarterDoneCard startedOn="2026-09-07" navigate={vi.fn()} />,
      { wrapper: withUid("u1") }
    );
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
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
