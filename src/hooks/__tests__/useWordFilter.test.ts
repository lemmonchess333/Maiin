/**
 * The word filter loads when a composer opens, not when its screen loads.
 *
 * One test, in order, because the filter is module state and loads once a
 * session: before anything asks, while a closed sheet holds it, the first
 * open, and a later screen that finds it already here.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWordFilter } from "../useWordFilter";
import { loadedWordFilter } from "@/lib/wordFilter";

describe("useWordFilter", () => {
  it("loads on the first open, and is there at once afterwards", async () => {
    // A closed sheet asks for nothing.
    const closed = renderHook(({ open }) => useWordFilter(open), {
      initialProps: { open: false },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed.result.current).toBeNull();
    expect(loadedWordFilter()).toBeNull();

    // Opening it loads the filter; until then a check has nothing to run.
    closed.rerender({ open: true });
    await waitFor(() => expect(closed.result.current).not.toBeNull());
    expect(closed.result.current?.containsProfanity("great session")).toBe(
      false
    );
    expect(closed.result.current?.containsProfanity("sucks")).toBe(true);

    // A screen mounted later draws with it on its first render.
    const later = renderHook(() => useWordFilter(false));
    expect(later.result.current).toBe(loadedWordFilter());
    expect(later.result.current).not.toBeNull();
  });
});
