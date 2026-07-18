// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import AuthSessionBoundary from "../AuthSessionBoundary";

/**
 * HOME-ACCOUNT-01 — the boundary must remount its subtree when the uid
 * changes (so account B never inherits account A's mounted state) but
 * NOT remount on an unrelated re-render with the same uid.
 */
function Probe({ onMount, label }: { onMount: () => void; label: string }) {
  useEffect(() => {
    onMount();
  }, [onMount]);
  return <div>{label}</div>;
}

describe("AuthSessionBoundary", () => {
  it("remounts children when the uid changes", () => {
    const onMount = vi.fn();
    const { rerender } = render(
      <AuthSessionBoundary uid="user-a">
        <Probe onMount={onMount} label="tree" />
      </AuthSessionBoundary>
    );
    expect(onMount).toHaveBeenCalledTimes(1);

    // Same uid, re-render → NO remount (state/subscriptions preserved).
    rerender(
      <AuthSessionBoundary uid="user-a">
        <Probe onMount={onMount} label="tree" />
      </AuthSessionBoundary>
    );
    expect(onMount).toHaveBeenCalledTimes(1);

    // uid changes (account switch) → remount.
    rerender(
      <AuthSessionBoundary uid="user-b">
        <Probe onMount={onMount} label="tree" />
      </AuthSessionBoundary>
    );
    expect(onMount).toHaveBeenCalledTimes(2);
  });

  it("renders its children", () => {
    render(
      <AuthSessionBoundary uid="user-a">
        <div>hello</div>
      </AuthSessionBoundary>
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
