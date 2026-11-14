import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFoodLogFlight } from "../useFoodLogFlight";
import type { FlightInput } from "@/lib/foodFlight";

const base: FlightInput = {
  day: "2026-11-11",
  isToday: true,
  ready: true,
  ids: ["a", "b"],
  calories: 900,
  reducedMotion: false,
};

/**
 * The page's side of the food's flight (Food11 call 6). `nextFlight` has
 * the rule and its own tests; this holds what the hook adds: the flight
 * and the wheel's hold arrive together, and end in two steps.
 */
describe("useFoodLogFlight", () => {
  it("has nothing in the air when the page opens on a day with meals", () => {
    const { result } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    expect(result.current.flight).toBeNull();
    expect(result.current.holdWheel).toBe(false);
  });

  it("puts the new meal in the air and holds the wheel, in the same render", () => {
    const { result, rerender } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    rerender({ ...base, ids: ["a", "b", "c"], calories: 1440 });
    expect(result.current.flight).toEqual({ mealId: "c", fromCalories: 900 });
    expect(result.current.holdWheel).toBe(true);
  });

  it("lets the wheel go on arrival, with the picture still in the air", () => {
    const { result, rerender } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    rerender({ ...base, ids: ["a", "b", "c"], calories: 1440 });
    act(() => result.current.arrive());
    expect(result.current.holdWheel).toBe(false);
    expect(result.current.flight).not.toBeNull();
    act(() => result.current.finish());
    expect(result.current.flight).toBeNull();
  });

  it("a finish with no arrival still lets the wheel go", () => {
    const { result, rerender } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    rerender({ ...base, ids: ["a", "b", "c"], calories: 1440 });
    act(() => result.current.finish());
    expect(result.current.holdWheel).toBe(false);
    expect(result.current.flight).toBeNull();
  });

  it("holds nothing for an edit, a delete or Reduce Motion", () => {
    const { result, rerender } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    rerender({ ...base, calories: 1010 });
    expect(result.current.holdWheel).toBe(false);
    rerender({ ...base, ids: ["a"], calories: 400 });
    expect(result.current.holdWheel).toBe(false);
    rerender({
      ...base,
      ids: ["a", "b", "c"],
      calories: 1440,
      reducedMotion: true,
    });
    expect(result.current.flight).toBeNull();
    expect(result.current.holdWheel).toBe(false);
  });

  it("a second log while one is in the air takes over", () => {
    const { result, rerender } = renderHook(
      (input: FlightInput) => useFoodLogFlight(input),
      { initialProps: base }
    );
    rerender({ ...base, ids: ["a", "b", "c"], calories: 1440 });
    rerender({ ...base, ids: ["a", "b", "c", "d"], calories: 1700 });
    expect(result.current.flight).toEqual({ mealId: "d", fromCalories: 1440 });
    expect(result.current.holdWheel).toBe(true);
  });
});
