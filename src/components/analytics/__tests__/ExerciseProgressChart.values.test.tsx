import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { THEME } from "@/lib/theme";

const h = vi.hoisted(() => ({
  point: { date: "2026-10-27", value: 82.5, isPR: false },
}));
vi.mock("recharts", () => {
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    XAxis: () => null,
    YAxis: () => null,
    Line: () => null,
    Tooltip: ({ content }: { content: (props: unknown) => ReactNode }) =>
      content({ active: true, payload: [{ payload: h.point }] }),
  };
});
import ExerciseProgressChart from "../ExerciseProgressChart";

beforeEach(() => {
  h.point = { date: "2026-10-27", value: 82.5, isPR: false };
});

describe("exercise chart values", () => {
  it("keeps the fractional load and unit in the tooltip and spoken summary", () => {
    render(
      <ExerciseProgressChart
        data={[h.point]}
        accent={THEME.lifting}
        metricLabel="Max weight"
        unit="kg"
      />
    );
    const load = new Intl.NumberFormat().format(82.5);
    expect(screen.getByText(`${load} kg`)).toBeVisible();
    expect(screen.getByRole("img", { name: /Max weight/ })).toHaveAccessibleName(
      expect.stringContaining(`Latest value: ${load} kg.`)
    );
  });

  it("uses pounds without rounding them to a whole load", () => {
    h.point.value = 181.9;
    render(
      <ExerciseProgressChart
        data={[h.point]}
        accent={THEME.lifting}
        metricLabel="Max weight"
        unit="lb"
      />
    );
    const load = new Intl.NumberFormat().format(181.9);
    expect(screen.getByText(`${load} lb`)).toBeVisible();
    expect(screen.getByRole("img", { name: /Max weight/ })).toHaveAccessibleName(
      expect.stringContaining(`Latest value: ${load} lb.`)
    );
  });

  it("keeps hold duration distinct from weight", () => {
    h.point.value = 45;
    render(
      <ExerciseProgressChart
        data={[h.point]}
        accent={THEME.lifting}
        metricLabel="Longest hold"
        unit="s"
      />
    );
    expect(screen.getByText("45s")).toBeVisible();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Longest hold.*Latest value: 45 seconds/
    );
  });
});
