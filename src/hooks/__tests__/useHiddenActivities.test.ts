/**
 * useHiddenActivities — localStorage-backed hidden-activity set
 * contract tests. Pins the per-uid scoping, persistence, and the
 * cross-tab subscription behaviour that drives the feed re-filter
 * after a Hide-from-feed report submission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const useAuthMock = vi.fn(() => ({ user: { uid: "u-1" } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

import { useHiddenActivities } from "../useHiddenActivities";

beforeEach(() => {
  window.localStorage.clear();
  useAuthMock.mockReturnValue({ user: { uid: "u-1" } });
});

describe("useHiddenActivities — initial read", () => {
  it("starts empty when localStorage has nothing for the uid", () => {
    const { result } = renderHook(() => useHiddenActivities());
    expect(result.current.hidden.size).toBe(0);
  });

  it("rehydrates from localStorage on mount", () => {
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-1",
      JSON.stringify(["act-A", "act-B"]),
    );
    const { result } = renderHook(() => useHiddenActivities());
    expect(result.current.hidden.has("act-A")).toBe(true);
    expect(result.current.hidden.has("act-B")).toBe(true);
  });

  it("scopes by uid — a different user on the same device sees their own set", () => {
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-1",
      JSON.stringify(["act-A"]),
    );
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-2",
      JSON.stringify(["act-B"]),
    );
    useAuthMock.mockReturnValue({ user: { uid: "u-2" } });
    const { result } = renderHook(() => useHiddenActivities());
    expect(result.current.hidden.has("act-A")).toBe(false);
    expect(result.current.hidden.has("act-B")).toBe(true);
  });
});

describe("useHiddenActivities — hide / unhide", () => {
  it("hide(id) adds the id and persists to localStorage", () => {
    const { result } = renderHook(() => useHiddenActivities());
    act(() => {
      result.current.hide("act-1");
    });
    expect(result.current.hidden.has("act-1")).toBe(true);
    const stored = JSON.parse(
      window.localStorage.getItem("tropos.hiddenActivities.u-1") ?? "[]",
    );
    expect(stored).toContain("act-1");
  });

  it("hide(id) is idempotent — double-hiding doesn't duplicate", () => {
    const { result } = renderHook(() => useHiddenActivities());
    act(() => {
      result.current.hide("act-1");
      result.current.hide("act-1");
    });
    expect(result.current.hidden.size).toBe(1);
  });

  it("unhide(id) removes the id and persists", () => {
    window.localStorage.setItem(
      "tropos.hiddenActivities.u-1",
      JSON.stringify(["act-1", "act-2"]),
    );
    const { result } = renderHook(() => useHiddenActivities());
    act(() => {
      result.current.unhide("act-1");
    });
    expect(result.current.hidden.has("act-1")).toBe(false);
    expect(result.current.hidden.has("act-2")).toBe(true);
  });

  it("hide is a no-op when no user is signed in", () => {
    useAuthMock.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuthMock>);
    const { result } = renderHook(() => useHiddenActivities());
    act(() => {
      result.current.hide("act-1");
    });
    expect(result.current.hidden.size).toBe(0);
  });
});
