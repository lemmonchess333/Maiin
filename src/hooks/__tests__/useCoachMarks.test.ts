/**
 * Tests for `useCoachMarks` — one-shot dismissible coach-mark state
 * with optional per-feature keys, persisted in localStorage.
 *
 * Covers:
 *   1. Unkeyed (legacy) flag — a single global dismissal hides all
 *      unkeyed coach marks.
 *   2. Keyed dismissal — each feature gets its own flag.
 *   3. Initial state reflects what's already in localStorage on mount.
 *   4. Defensive: localStorage unavailable (private mode) doesn't
 *      throw; in-memory dismissal still flips.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCoachMarks } from "../useCoachMarks";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useCoachMarks — unkeyed (legacy)", () => {
  it("starts with showCoachMarks=true on a fresh storage", () => {
    const { result } = renderHook(() => useCoachMarks());
    expect(result.current.showCoachMarks).toBe(true);
  });

  it("flips to showCoachMarks=false after dismiss() and persists", () => {
    const { result } = renderHook(() => useCoachMarks());
    act(() => result.current.dismiss());
    expect(result.current.showCoachMarks).toBe(false);
    expect(window.localStorage.getItem("tropos-coach-marks-dismissed")).toBe(
      "1",
    );
  });

  it("starts dismissed when storage already has the flag", () => {
    window.localStorage.setItem("tropos-coach-marks-dismissed", "1");
    const { result } = renderHook(() => useCoachMarks());
    expect(result.current.showCoachMarks).toBe(false);
  });
});

describe("useCoachMarks — keyed (per-feature)", () => {
  it("uses a key-scoped storage key", () => {
    const { result } = renderHook(() => useCoachMarks("food-eyebrow"));
    act(() => result.current.dismiss());
    expect(
      window.localStorage.getItem(
        "tropos-coach-marks-dismissed:food-eyebrow",
      ),
    ).toBe("1");
  });

  it("dismissing one key does not dismiss another key", () => {
    const a = renderHook(() => useCoachMarks("a"));
    const b = renderHook(() => useCoachMarks("b"));

    act(() => a.result.current.dismiss());
    expect(a.result.current.showCoachMarks).toBe(false);

    /* Remount b after a's dismissal — b's storage is untouched so
       it should still show. */
    const bRemounted = renderHook(() => useCoachMarks("b"));
    expect(bRemounted.result.current.showCoachMarks).toBe(true);
    /* The original b doesn't auto-update when 'a' was dismissed
       (no global event listener) — that's expected for the
       persisted-once pattern. */
    expect(b.result.current.showCoachMarks).toBe(true);
  });

  it("unkeyed and keyed dismissals are independent", () => {
    const unkeyed = renderHook(() => useCoachMarks());
    act(() => unkeyed.result.current.dismiss());

    const keyed = renderHook(() => useCoachMarks("welcome"));
    expect(keyed.result.current.showCoachMarks).toBe(true);
  });
});

describe("useCoachMarks — defensive: localStorage unavailable", () => {
  it("does not throw when setItem fails (private mode)", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const { result } = renderHook(() => useCoachMarks("test"));
    expect(() => act(() => result.current.dismiss())).not.toThrow();
    /* In-memory state still updates even when storage throws — the
       coach mark hides for this session at least. */
    expect(result.current.showCoachMarks).toBe(false);

    setItem.mockRestore();
  });
});
