/**
 * useRingMoveCause: whether the calorie wheel's arc and the macro bars
 * last moved because the left and logged switch was tapped (brisk, at
 * once) or because the food changed (on the page's own timing).
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRingMoveCause } from "../useRingMoveCause";
import type { CalorieRingMode } from "@/lib/calorieRingFill";

function setup() {
  return renderHook(
    ({ mode, consumed, target }) => useRingMoveCause(mode, consumed, target),
    {
      initialProps: {
        mode: "left" as CalorieRingMode,
        consumed: 500,
        target: 2200,
      },
    }
  );
}

describe("useRingMoveCause", () => {
  it("is the food until anything is switched", () => {
    expect(setup().result.current).toBe("food");
  });

  it("is the switch once the view changes, and stays so through other renders", () => {
    const { result, rerender } = setup();
    rerender({ mode: "eaten", consumed: 500, target: 2200 });
    expect(result.current).toBe("switch");
    rerender({ mode: "eaten", consumed: 500, target: 2200 });
    expect(result.current).toBe("switch");
  });

  it("is the food again once a log, a delete or a new target moves it", () => {
    const { result, rerender } = setup();
    rerender({ mode: "eaten", consumed: 500, target: 2200 });
    rerender({ mode: "eaten", consumed: 900, target: 2200 });
    expect(result.current).toBe("food");
    rerender({ mode: "left", consumed: 900, target: 2200 });
    expect(result.current).toBe("switch");
    rerender({ mode: "left", consumed: 900, target: 2400 });
    expect(result.current).toBe("food");
  });
});
