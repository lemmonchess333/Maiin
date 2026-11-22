/**
 * Tests for `useMacroPalette` — the dark-mode-aware macro colour
 * palette consumed by every food/macro display surface.
 *
 * The palette has two tracks:
 *   - accent: bright brand values (tile backgrounds at 10% alpha,
 *             chart fills, dots). Same in light + dark.
 *   - text: contrast-safe values for text. Bright in dark mode
 *           (high contrast on the dark card); darker variants in light
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
import { THEME, MACROS_LIGHT, MACROS_TEXT_LIGHT } from "@/lib/theme";

beforeEach(() => {
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("useMacroPalette — light mode (default)", () => {
  it("text track: the macros' words are the text colour, calories its AA orange", () => {
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.text.protein).toBe("hsl(var(--foreground))");
    expect(result.current.text.carbs).toBe("hsl(var(--foreground))");
    expect(result.current.text.fat).toBe("hsl(var(--foreground))");
    expect(result.current.text.nutrition).toBe(MACROS_TEXT_LIGHT.nutrition);
  });

  it("accent track uses the light fills for protein and fat (DS10 call 3)", () => {
    // The dark theme's protein and fat are under 3:1 on white.
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.accent.protein).toBe(MACROS_LIGHT.protein);
    expect(result.current.accent.carbs).toBe(THEME.macros.carbs);
    expect(result.current.accent.fat).toBe(MACROS_LIGHT.fat);
    expect(result.current.accent.nutrition).toBe(THEME.semantic.nutrition);
  });
});

describe("useMacroPalette — dark mode", () => {
  it("text track: the macros' words stay the text colour when .dark is on", () => {
    document.documentElement.classList.add("dark");
    const { result } = renderHook(() => useMacroPalette());
    expect(result.current.text.fat).toBe("hsl(var(--foreground))");
    expect(result.current.text.nutrition).toBe(THEME.semantic.nutrition);
    expect(result.current.accent.fat).toBe(THEME.macros.fat);
  });
});

describe("useMacroPalette — runtime dark-mode toggle", () => {
  it("flips text track when .dark is added to documentElement", async () => {
    const { result } = renderHook(() => useMacroPalette());
    /* Start in light mode. */
    expect(result.current.text.nutrition).toBe(MACROS_TEXT_LIGHT.nutrition);

    /* User toggles dark mode via Settings — adds .dark to the root.
       The MutationObserver in the hook fires and updates the
       palette without a remount. */
    await act(async () => {
      document.documentElement.classList.add("dark");
      /* MutationObserver callbacks are microtask-scheduled. Flush
         the queue. */
      await Promise.resolve();
    });
    expect(result.current.text.nutrition).toBe(THEME.semantic.nutrition);
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
