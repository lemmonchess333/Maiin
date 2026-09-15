import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { formatBinLabel } from "@/lib/chartGranularity";

/**
 * Every date axis in the app labelled its ticks from one of four
 * hand-rolled copies of the same three lines. Two of them were wrong,
 * in the way this codebase's standing rule names: "Never mix local-date
 * and UTC operations in one calculation."
 *
 *   const d = new Date(key);                    // "YYYY-MM-DD" → UTC midnight
 *   return `${d.getDate()}/${d.getMonth() + 1}` // …read back LOCALLY
 *
 * West of UTC those two disagree by a day, so every tick was labelled
 * one day early for every user in the Americas. On the running chart
 * that is worse than an off-by-one: the keys are Monday-anchored week
 * starts from `localWeekKey`, so a chart of Mondays rendered a column
 * of Sundays — on the page that had just moved the whole app to Monday
 * weeks.
 *
 * The other two copies were correct, and correct for a reason worth
 * keeping: they appended "T00:00:00" / "T12:00:00", forcing a LOCAL
 * parse to match the local read. That is the tell that this is a known
 * hazard someone had already met twice and fixed in place rather than
 * once at the source. All four now go through `formatBinLabel`.
 *
 * The TZ block below is not decoration. In UTC — which is what CI runs
 * — the broken expression and the correct one agree, so a test written
 * without it passes on the defect.
 */

const WEST = "America/New_York"; // UTC−4/5: the affected half of the world
const EAST = "Pacific/Auckland"; // UTC+12: unaffected, and worth stating

/** The expression the two broken axes used, verbatim. */
function preFix(key: string): string {
  const d = new Date(key);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

describe("date axes label the day their key names", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = WEST;
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("is genuinely running west of UTC", () => {
    // The anchor. Node applies a runtime TZ change, but if it ever
    // stopped, every assertion below would pass for the wrong reason.
    expect(
      new Date("2026-08-03T00:00:00Z").getTimezoneOffset()
    ).toBeGreaterThan(0);
    expect(preFix("2026-08-03")).toBe("2/8");
  });

  it("labels a Monday-anchored week key with its Monday", () => {
    // 2026-08-03 is a Monday. The pre-fix expression says 2/8 — Sunday.
    expect(formatBinLabel("2026-08-03", "weekly")).toBe("3/8");
  });

  it("labels a daily key with its own day", () => {
    expect(formatBinLabel("2026-08-03", "daily")).toBe("3/8");
    expect(formatBinLabel("2026-12-31", "daily")).toBe("31/12");
    // The 1st is the case where the month rolls too, not just the day.
    expect(formatBinLabel("2026-09-01", "daily")).toBe("1/9");
    expect(preFix("2026-09-01")).toBe("31/8");
  });

  it("is day-first, which is the whole point of the house register", () => {
    // Past the 12th, so the two readings disagree and the assertion means
    // something.
    expect(formatBinLabel("2026-09-04", "daily")).toBe("4/9");
    expect(formatBinLabel("2026-04-09", "daily")).toBe("9/4");
  });

  it("gives an unparseable key an empty tick, not NaN/NaN", () => {
    expect(formatBinLabel("not-a-date", "daily")).toBe("");
    expect(formatBinLabel("", "weekly")).toBe("");
    expect(preFix("not-a-date")).toBe("NaN/NaN");
  });
});

describe("east of UTC was never affected — the asymmetry is real", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = EAST;
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("agrees with the pre-fix expression here", () => {
    expect(new Date("2026-08-03T00:00:00Z").getTimezoneOffset()).toBeLessThan(
      0
    );
    expect(preFix("2026-08-03")).toBe("3/8");
    expect(formatBinLabel("2026-08-03", "weekly")).toBe("3/8");
  });
});

/* ── The running chart, at the component ───────────────────────────── */

const captured: { formatter?: (v: string) => string } = {};

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));
vi.mock("@/hooks/useRunningStats", () => ({
  useRunningStats: () => ({
    granularity: "weekly",
    binnedData: [
      { week: "2026-08-03", totalDistance: 12.4, runCount: 3, avgPace: 330 },
      { week: "2026-08-10", totalDistance: 9.1, runCount: 2, avgPace: 345 },
    ],
    runs: [],
    loading: false,
  }),
}));
vi.mock("recharts", () => {
  const Pass = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Noop = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: Noop,
    XAxis: (props: { tickFormatter?: (v: string) => string }) => {
      captured.formatter = props.tickFormatter;
      return null;
    },
    YAxis: Noop,
    CartesianGrid: Noop,
  };
});

import RunningHistorySection from "@/components/run/RunningHistorySection";

describe("the running chart's own axis, west of UTC", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = WEST;
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("renders its Monday week keys as Mondays", () => {
    render(<RunningHistorySection rangeDays={90} />);
    expect(captured.formatter, "XAxis has no tickFormatter").toBeTypeOf(
      "function"
    );
    expect(captured.formatter!("2026-08-03")).toBe("3/8");
    expect(captured.formatter!("2026-08-10")).toBe("10/8");
  });
});

/* ── No component may hand-roll this again ─────────────────────────── */

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) tsxFiles(full, out);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("one formatter, not five", () => {
  it("no component derives a d/m axis label itself", () => {
    const offenders = tsxFiles("src/components")
      .concat(tsxFiles("src/pages"))
      .filter((f) => /getMonth\(\)\s*\+\s*1/.test(readFileSync(f, "utf8")));
    expect(
      offenders,
      `these build a date label by hand instead of calling formatBinLabel — ` +
        `the copy that mixes a UTC parse with a local read is the one that ` +
        `mislabels every tick west of UTC:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
