/**
 * Tests for `useMacroPalette` — the dark-mode-aware macro colour
 * palette consumed by every food/macro display surface.
 *
 * The palette has two tracks:
 *   - accent: bright brand values (tile backgrounds at 10% alpha,
 *             chart fills, dots). Same in light + dark.
 *   - text: contrast-safe values for text. Bright in dark mode
 *           (high contrast on #1A1A1F); darker variants in light
 *           mode so labels clear WCAG AA on white.
 *
 * Tests pin:
 *   1. Light mode: text uses MACROS_TEXT_LIGHT.
 *   2. Dark mode: text uses the brand accent values.
 *   3. Live update when the user toggles dark mode (Settings writes
 *      .dark on the root element).
 *   4. accent track stays stable across mode flips.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMacroPalette } from "../useMacroPalette";
import { THEME, MACROS_TEXT_LIGHT } from "@/lib/theme";

beforeEach(() => {
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("useMacroPalette — light mode (default)", () => {
  it("text track uses MACROS_TEXT_LIGHT", () => {
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.text.protein).toBe(MACROS_TEXT_LIGHT.protein);
    expect(result.current.text.carbs).toBe(MACROS_TEXT_LIGHT.carbs);
    expect(result.current.text.fat).toBe(MACROS_TEXT_LIGHT.fat);
    expect(result.current.text.nutrition).toBe(MACROS_TEXT_LIGHT.nutrition);
  });

  it("accent track uses THEME.macros + THEME.semantic.nutrition", () => {
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.accent.protein).toBe(THEME.macros.protein);
    expect(result.current.accent.carbs).toBe(THEME.macros.carbs);
    expect(result.current.accent.fat).toBe(THEME.macros.fat);
    expect(result.current.accent.nutrition).toBe(THEME.semantic.nutrition);
  });
});

describe("useMacroPalette — dark mode", () => {
  it("text track uses the bright accent values when .dark is on", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.text.protein).toBe(THEME.macros.protein);
    expect(result.current.text.carbs).toBe(THEME.macros.carbs);
    expect(result.current.text.fat).toBe(THEME.macros.fat);
  });
});

describe("useMacroPalette — runtime dark-mode toggle", () => {
  it("flips text track when .dark is added to documentElement", async () => {
    const { result } = renderHook(() => useMacroPalette());
    /* Start in light mode. */
    expect(result.current.text.protein).toBe(MACROS_TEXT_LIGHT.protein);

    /* User toggles dark mode via Settings — adds .dark to the root.
       The MutationObserver in the hook fires and updates the
       palette without a remount. */
    await act(async () => {
      document.documentElement.classList.add("dark");
      /* MutationObserver callbacks are microtask-scheduled. Flush
         the queue. */
      await Promise.resolve();
    });
    expect(result.current.text.protein).toBe(THEME.macros.protein);
  });

  it("accent track stays stable across mode flips", () => {
    const { result } = renderHook(() => useMacroPalette());
    const before = { ...result.current.accent };

    act(() => {
      document.documentElement.classList.add("dark");
    });
    expect(result.current.accent).toEqual(before);
  });
});
