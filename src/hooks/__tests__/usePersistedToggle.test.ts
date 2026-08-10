/**
 * usePersistedToggle — the two-way preference the one-way primitives
 * couldn't express.
 *
 * The load-bearing cases are the ones that made expandable cards forget:
 * an absent key must fall back to the DEFAULT (not to `false`, or a
 * card that defaults open silently closes), and the choice must survive
 * a remount (that is the whole point). The uid-scoping test is the
 * shared-device rule — one account's layout preference must not follow
 * another account into its session.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { usePersistedToggle } from "../usePersistedToggle";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePersistedToggle", () => {
  it("starts at the default when nothing is stored", () => {
    const off = renderHook(() => usePersistedToggle("k", false));
    expect(off.result.current.value).toBe(false);
    const on = renderHook(() => usePersistedToggle("k2", true));
    expect(on.result.current.value).toBe(true);
  });

  it("an ABSENT key means default, not false", () => {
    // The distinction a naive `stored === "1"` read loses. Without it a
    // card that defaults open renders closed on first visit for everyone
    // — the opposite of what its author asked for, and silent.
    expect(window.localStorage.getItem("never-set")).toBeNull();
    const { result } = renderHook(() => usePersistedToggle("never-set", true));
    expect(result.current.value).toBe(true);
  });

  it("remembers a toggle across a remount — the entire point", () => {
    const first = renderHook(() => usePersistedToggle("energy", false));
    act(() => first.result.current.toggle());
    expect(first.result.current.value).toBe(true);
    first.unmount();

    const second = renderHook(() => usePersistedToggle("energy", false));
    expect(second.result.current.value).toBe(true);
  });

  it("remembers an explicit close too, against a default of open", () => {
    // Symmetry matters: persisting only the "on" direction would make a
    // default-open card impossible to keep shut.
    const first = renderHook(() => usePersistedToggle("open-by-default", true));
    act(() => first.result.current.toggle());
    expect(first.result.current.value).toBe(false);
    first.unmount();

    const second = renderHook(() =>
      usePersistedToggle("open-by-default", true)
    );
    expect(second.result.current.value).toBe(false);
  });

  it("keys are independent — one account's choice does not leak to another", () => {
    // The shared-device rule, expressed the way callers use it.
    const a = renderHook(() => usePersistedToggle("energy:uid-A", false));
    act(() => a.result.current.toggle());
    expect(a.result.current.value).toBe(true);

    const b = renderHook(() => usePersistedToggle("energy:uid-B", false));
    expect(b.result.current.value).toBe(false);
  });

  it("`set` writes an absolute value, not a flip", () => {
    const { result } = renderHook(() => usePersistedToggle("k", false));
    act(() => result.current.set(true));
    expect(result.current.value).toBe(true);
    act(() => result.current.set(true));
    expect(result.current.value).toBe(true);
  });

  it("survives localStorage throwing — Safari private mode", () => {
    // A lost preference is a nuisance; a crashed Home screen is not. The
    // in-memory value must still flip so the card responds to the tap.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const { result } = renderHook(() => usePersistedToggle("k", false));
    act(() => result.current.toggle());
    expect(result.current.value).toBe(true);
    expect(setItem).toHaveBeenCalled();
  });

  it("survives a throwing READ, falling back to the default", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => usePersistedToggle("k", true));
    expect(result.current.value).toBe(true);
  });
});
