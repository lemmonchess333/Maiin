import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AreaChart, Area, XAxis, YAxis } from "recharts";
import ChartAreaGradient from "../ChartAreaGradient";

/* The component's whole contract is "Recharts passes unrecognised
 * children through to the SVG" — so the test renders it inside a REAL
 * AreaChart (explicit width/height; ResponsiveContainer measures 0×0 in
 * jsdom) and asserts the defs land in the live SVG, not just that the
 * component returns markup in isolation. */

const DATA = [
  { x: 0, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 3 },
];

function renderChart(
  props: Partial<React.ComponentProps<typeof ChartAreaGradient>> = {}
) {
  return render(
    <AreaChart width={400} height={200} data={DATA}>
      <ChartAreaGradient id="test-grad" color="#7B72E9" {...props} />
      <XAxis dataKey="x" />
      <YAxis />
      <Area type="monotone" dataKey="y" fill="url(#test-grad)" />
    </AreaChart>
  );
}

describe("ChartAreaGradient", () => {
  it("renders the gradient defs through Recharts into the chart SVG", () => {
    const { container } = renderChart();
    const gradient = container.querySelector("svg linearGradient#test-grad");
    expect(gradient).not.toBeNull();

    const stops = gradient!.querySelectorAll("stop");
    expect(stops.length).toBe(2);
    expect(stops[0].getAttribute("stop-color")).toBe("#7B72E9");
    expect(stops[1].getAttribute("stop-color")).toBe("#7B72E9");
  });

  it("defaults to the 0.35 → 0 fade every standard chart uses", () => {
    const { container } = renderChart();
    const stops = container.querySelectorAll("#test-grad stop");
    expect(stops[0].getAttribute("stop-opacity")).toBe("0.35");
    expect(stops[1].getAttribute("stop-opacity")).toBe("0");
  });

  it("is vertical: top stop at 0%, bottom stop at 100%", () => {
    const { container } = renderChart();
    const gradient = container.querySelector("#test-grad")!;
    expect(gradient.getAttribute("x1")).toBe("0");
    expect(gradient.getAttribute("y1")).toBe("0");
    expect(gradient.getAttribute("x2")).toBe("0");
    expect(gradient.getAttribute("y2")).toBe("1");
    const stops = gradient.querySelectorAll("stop");
    expect(stops[0].getAttribute("offset")).toBe("0%");
    expect(stops[1].getAttribute("offset")).toBe("100%");
  });

  it("passes custom opacities through (ElevationProfile's 0.4 → 0.02)", () => {
    const { container } = renderChart({
      topOpacity: 0.4,
      bottomOpacity: 0.02,
    });
    const stops = container.querySelectorAll("#test-grad stop");
    expect(stops[0].getAttribute("stop-opacity")).toBe("0.4");
    expect(stops[1].getAttribute("stop-opacity")).toBe("0.02");
  });

  it("the Area's fill can reference the gradient id", () => {
    const { container } = renderChart();
    const area = container.querySelector(".recharts-area-area");
    expect(area?.getAttribute("fill")).toBe("url(#test-grad)");
  });
});
