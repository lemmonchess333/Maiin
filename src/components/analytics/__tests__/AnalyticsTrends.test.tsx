import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import AnalyticsTrends from "../AnalyticsTrends";
import Sparkline from "../Sparkline";
import type { TrendRow } from "../trendRows";

const ROWS: TrendRow[] = [
  {
    key: "weight",
    label: "Body weight",
    detail: "Down 0.4 kg since 13 Sep",
    value: "81.6",
    unit: "kg",
    series: [82, 81.9, 81.6],
    color: "hsl(var(--muted-foreground))",
    page: "body",
  },
  {
    key: "10k",
    label: "10K prediction",
    detail: "From your best recent run",
    value: "55:41",
    color: "hsl(var(--running))",
    page: "running",
  },
];

describe("AnalyticsTrends", () => {
  it("shows each row's measure, what it is, and its figure", () => {
    render(<AnalyticsTrends rows={ROWS} onOpen={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Trends" })).toBeInTheDocument();
    expect(screen.getByText("Body weight")).toBeInTheDocument();
    expect(screen.getByText("Down 0.4 kg since 13 Sep")).toBeInTheDocument();
    expect(screen.getByText("81.6")).toBeInTheDocument();
    expect(screen.getByText("55:41")).toBeInTheDocument();
  });

  it("opens the page that charts the row", () => {
    const open = vi.fn();
    render(<AnalyticsTrends rows={ROWS} onOpen={open} />);
    fireEvent.click(screen.getByRole("button", { name: /^10K prediction/ }));
    expect(open).toHaveBeenCalledWith("running");
    fireEvent.click(screen.getByRole("button", { name: /^Body weight/ }));
    expect(open).toHaveBeenLastCalledWith("body");
  });

  it("prints no figure for a row that hides it", () => {
    render(
      <AnalyticsTrends
        rows={[{ ...ROWS[0], value: "", unit: undefined }]}
        onOpen={vi.fn()}
      />
    );
    expect(screen.queryByText("81.6")).toBeNull();
    expect(screen.queryByText("kg")).toBeNull();
  });

  it("keeps its lines away from assistive technology", () => {
    const { container } = render(
      <AnalyticsTrends rows={ROWS} onOpen={vi.fn()} />
    );
    const lines = container.querySelectorAll("svg polyline");
    expect(lines.length).toBe(1);
    expect(lines[0].closest("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing without rows", () => {
    const { container } = render(
      <AnalyticsTrends rows={[]} onOpen={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("Sparkline", () => {
  const ys = (container: HTMLElement) =>
    container
      .querySelector("polyline")!
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));

  it("draws nothing from one point", () => {
    const { container } = render(<Sparkline values={[3]} color="red" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("sets a flat series mid-height, not along an edge", () => {
    const { container } = render(
      <Sparkline values={[5, 5, 5]} color="red" height={20} />
    );
    for (const y of ys(container)) expect(y).toBeCloseTo(10, 0);
  });

  it("keeps the line inside its box", () => {
    const { container } = render(
      <Sparkline values={[0, 100, 50]} color="red" height={20} />
    );
    for (const y of ys(container)) {
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(19);
    }
  });

  it("puts higher values higher", () => {
    const { container } = render(
      <Sparkline values={[1, 3]} color="red" height={20} />
    );
    const [first, last] = ys(container);
    expect(last).toBeLessThan(first);
  });
});
