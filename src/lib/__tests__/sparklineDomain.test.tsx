// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AreaChart, Area, YAxis } from "recharts";
import { sparklineDomain } from "../sparklineDomain";

/**
 * The property that matters is POSITION WITHIN THE BAND, not the numbers
 * themselves — a sparkline is read as a shape. So each case asserts where
 * the series lands between the domain's floor and ceiling, which is what a
 * viewer actually sees, rather than pinning the padding constant.
 */
function positionOf(value: number, [lo, hi]: [number, number]): number {
  return (value - lo) / (hi - lo);
}

describe("sparklineDomain", () => {
  it("centres a flat series instead of pinning it to the band edge", () => {
    // The defect: Recharts' [0, dataMax] default put a constant series at
    // the very top and filled the whole band beneath it — the solid slab
    // that made Avg Pace look like a different component from the card
    // beside it.
    const domain = sparklineDomain([345, 345, 345, 345]);
    expect(positionOf(345, domain)).toBeCloseTo(0.5, 5);
  });

  it("centres an all-zero series too", () => {
    // A proportional pad is zero here, so the domain would collapse to a
    // point and the chart would render nothing.
    const domain = sparklineDomain([0, 0, 0]);
    expect(domain[0]).toBeLessThan(0);
    expect(domain[1]).toBeGreaterThan(0);
    expect(positionOf(0, domain)).toBeCloseTo(0.5, 5);
  });

  it("gives a varying series the full height of the band", () => {
    // The other half of the same bug: a month of runs between 48 and 52 km
    // drew as a near-flat line because the band ran from 0. Bounded by the
    // data, the 4 km of variation uses most of the band.
    const domain = sparklineDomain([48, 50, 49, 52, 51]);
    const lowest = positionOf(48, domain);
    const highest = positionOf(52, domain);
    expect(highest - lowest).toBeGreaterThan(0.7);
  });

  it("keeps the extremes off the band edges so the stroke is not clipped", () => {
    const domain = sparklineDomain([48, 52]);
    expect(positionOf(48, domain)).toBeGreaterThan(0);
    expect(positionOf(52, domain)).toBeLessThan(1);
  });

  it("does not anchor the floor at zero", () => {
    // Stated directly, because "floor at zero" IS the Recharts default the
    // helper exists to override — a regression that silently removed the
    // YAxis would restore it.
    const [lo] = sparklineDomain([48, 50, 52]);
    expect(lo).toBeGreaterThan(0);
  });

  it("ignores non-finite samples rather than collapsing the domain", () => {
    const domain = sparklineDomain([
      48,
      Number.NaN,
      52,
      Number.POSITIVE_INFINITY,
    ]);
    expect(Number.isFinite(domain[0])).toBe(true);
    expect(Number.isFinite(domain[1])).toBe(true);
    expect(positionOf(50, domain)).toBeCloseTo(0.5, 5);
  });

  it("returns a usable band for an empty series", () => {
    expect(sparklineDomain([])).toEqual([0, 1]);
  });
});

/**
 * What Recharts actually DRAWS, not just what the helper returns.
 *
 * The helper is one thing; the geometry on screen is another, and this is
 * the half that was wrong. So the same `AreaChart` configuration `StatCard`
 * uses is rendered at a fixed size and the stroke path is measured.
 *
 * A fixed size rather than the real `ResponsiveContainer`, which reports
 * zero in jsdom and draws nothing. That is the seam this cannot reach — it
 * pins the domain's effect on the geometry, not the container's sizing.
 *
 * The DEFAULT numbers below are measured, not assumed. They also make this
 * a canary: if a Recharts upgrade changes the implicit axis default, the
 * "without the domain" case fails and says so, rather than the fix quietly
 * becoming a no-op.
 */
function strokeYs(values: number[], withDomain: boolean): number[] {
  const data = values.map((v, i) => ({ v, i }));
  const { container } = render(
    <AreaChart
      width={160}
      height={20}
      data={data}
      margin={{ top: 1, right: 0, bottom: 0, left: 0 }}
    >
      {withDomain ? <YAxis hide domain={sparklineDomain(values)} /> : null}
      <Area
        type="monotone"
        dataKey="v"
        stroke="#f00"
        isAnimationActive={false}
        dot={false}
      />
    </AreaChart>
  );
  /* `.recharts-area-curve` is the STROKE. An Area renders two paths and
     both carry `.recharts-curve`, the first being the filled area — whose
     geometry closes down to the baseline, so measuring it reports the
     chart's height as the series' swing no matter what the data does. */
  const d =
    container.querySelector("path.recharts-area-curve")?.getAttribute("d") ??
    "";
  /* The path is a flat run of x,y pairs once the command letters are gone
     — `M x,y C x,y,x,y,x,y …`. Pairing sequentially and keeping the odd
     index is the only reading that survives the cubic segments; a regex
     over `x,y` pairs matches them overlapping and returns x values as if
     they were y. */
  const nums = d
    .replace(/[A-Za-z]/g, ",")
    .split(",")
    .filter((t) => t.length > 0)
    .map(Number);
  return nums.filter((_, i) => i % 2 === 1);
}

const swing = (ys: number[]) => Math.max(...ys) - Math.min(...ys);

describe("sparklineDomain — rendered geometry", () => {
  it("a constant series is pinned to the top without the domain, centred with it", () => {
    // 19px of usable height after the 1px top margin, so 10.5 is the middle.
    const before = strokeYs([345, 345, 345, 345], false);
    const after = strokeYs([345, 345, 345, 345], true);
    expect(before[0]).toBeLessThan(3); // hard against the top edge
    expect(after[0]).toBeCloseTo(10.5, 1);
  });

  it("a series that never approaches zero gets its shape back", () => {
    // Avg Pace is the real case: seconds-per-km never goes near zero, so a
    // zero floor leaves the whole series in the top ~6% of the band.
    const values = [345, 344, 347, 346, 348];
    expect(swing(strokeYs(values, false))).toBeLessThan(1);
    expect(swing(strokeYs(values, true))).toBeGreaterThan(6);
  });

  it("a series that DOES span zero was never the broken case", () => {
    // Stated so the fix is not mistaken for a universal one. Weekly
    // distance buckets run from ~0 to the month's peak, so the zero floor
    // happened to give them the full band already — which is why the
    // Analytics frame showed Monthly Distance drawing a real shape while
    // Avg Pace beside it drew a block.
    const values = [0, 8, 3, 12, 6];
    expect(swing(strokeYs(values, false))).toBeGreaterThan(6);
    expect(swing(strokeYs(values, true))).toBeGreaterThan(6);
  });
});
