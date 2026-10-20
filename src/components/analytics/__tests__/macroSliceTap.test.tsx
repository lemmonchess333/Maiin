import { describe, it, expect, vi, beforeEach } from "vitest";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { fireEvent, render } from "@testing-library/react";
import MacroDistribution from "../MacroDistribution";

/**
 * A tap on a slice of the macro donut reports which macro was tapped.
 *
 * The handler reads the slice's datum from the sector recharts hands it.
 * It used to cast the sector itself to the component's slice type, which
 * recharts' own types stopped allowing from 3.10 (the sector is typed
 * `PieSectorDataItem`), so the handler reads the sector's `payload`,
 * which recharts sets to the datum. This test clicks a real slice so the
 * event still has to carry the right macro, whichever way it is read.
 *
 * jsdom gives ResponsiveContainer no size and so no slice paints (see
 * macroDonutCentre.test.tsx). Here only the container is replaced, by
 * one that hands the chart a fixed size; the chart and its slices are
 * recharts' own.
 */

const track = vi.fn();
vi.mock("@/lib/historyAnalytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/historyAnalytics")>()),
  track: (...args: unknown[]) => track(...args),
}));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children, { width: 96, height: 96 } as never)
        : null,
  };
});

beforeEach(() => track.mockClear());

describe("tapping a macro slice", () => {
  it("reports the tapped macro and its share of the calories", () => {
    const { container } = render(
      <MacroDistribution protein={48} carbs={72} fat={14} avgCalories={620} />
    );
    const sectors = container.querySelectorAll(".recharts-pie-sector");
    // Anchor: three macros, three painted slices. Without it a chart that
    // painted nothing would make the click below a no-op and the
    // assertions about it vacuous.
    expect(sectors).toHaveLength(3);

    fireEvent.click(sectors[0]);

    expect(track).toHaveBeenCalledTimes(1);
    const [event, props] = track.mock.calls[0] as [
      string,
      { chart: string; binKey: string; value: number },
    ];
    expect(event).toBe("history_chart_tap_attempted");
    expect(props.chart).toBe("macro");
    // 48 g protein × 4 = 192 of 606 Atwater calories: 32%.
    expect(props.binKey).toBe("Protein");
    expect(props.value).toBe(32);
  });
});
