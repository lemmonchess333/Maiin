import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import TrainingWeeksCard from "../TrainingWeeksCard";
import { haptic } from "@/lib/haptic";
import type { SummaryBin } from "@/lib/periodSummary";
import {
  liftingBins,
  liftingFigures,
  runningBins,
  runningFigures,
} from "@/lib/trainingWeeks";

vi.mock("@/lib/haptic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/haptic")>()),
  haptic: vi.fn(),
}));

/**
 * The Lifting and Running pages' week bars (DS3). They replaced two
 * Recharts charts, and take over what those charts' tests held: one
 * emphasis rule for both sports (the bar being read is drawn full, the
 * rest stepped back, starting on the bin you are in now), every bar's
 * value readable, and the reader's own distance unit throughout.
 */

const bin = (
  key: string,
  over: Partial<SummaryBin> = {},
  current = false
): SummaryBin => ({
  key,
  lifts: 0,
  runs: 0,
  volumeKg: 0,
  distanceM: 0,
  current,
  ...over,
});

const RUN_WEEKS: SummaryBin[] = [
  bin("2026-08-31", { runs: 3, distanceM: 24_000 }),
  bin("2026-09-07", { runs: 0 }),
  bin("2026-09-14", { runs: 4, distanceM: 32_000 }),
  bin("2026-09-21", { runs: 1, distanceM: 5_000 }, true),
];

function renderRuns(
  unit: "km" | "mi" = "km",
  overrides: Partial<Parameters<typeof TrainingWeeksCard>[0]> = {}
) {
  return render(
    <TrainingWeeksCard
      title="Distance"
      subtitle="Last 30 days"
      figures={runningFigures({
        distanceM: 61_000,
        runs: 8,
        seconds: 21_000,
        unit,
      })}
      bins={RUN_WEEKS}
      granularity="weekly"
      sport="running"
      reading={runningBins(unit)}
      average={unit === "km" ? 18.7 : 11.6}
      averageText={unit === "km" ? "18.7 km" : "11.6 mi"}
      {...overrides}
    />
  );
}

const bars = (container: HTMLElement) =>
  [...container.querySelectorAll("rect[data-bin]")] as SVGRectElement[];

describe("the bar being read", () => {
  it("starts on the bin you are in now, the rest stepped back", () => {
    const { container } = renderRuns();
    const opacity = bars(container)
      .filter((r) => r.getAttribute("class")?.includes("fill-running"))
      .map((r) => r.getAttribute("fill-opacity"));
    // Three weeks with running in them; the current one is drawn full.
    expect(opacity).toEqual(["0.45", "0.45", "1"]);
    expect(screen.getByTestId("bin-reading")).toHaveTextContent(
      "This week so far: 5.0 km · 1 run"
    );
  });

  it("moves to the bar tapped, and says what it holds", () => {
    const onPick = vi.fn();
    const { container } = renderRuns("km", { onPick });
    fireEvent.click(
      screen.getByRole("button", { name: /^Week of 14 Sept?: 32\.0 km/ })
    );
    expect(screen.getByTestId("bin-reading")).toHaveTextContent(
      /Week of 14 Sept?: 32\.0 km · 4 runs/
    );
    const full = bars(container).find(
      (r) => r.getAttribute("fill-opacity") === "1"
    );
    expect(full?.getAttribute("data-bin")).toBe("2026-09-14");
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ key: "2026-09-14", distanceM: 32_000 })
    );
  });

  it("gives every bar a button that names its week, its amount and its runs", () => {
    renderRuns();
    const names = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toHaveLength(RUN_WEEKS.length);
    expect(names[1]).toMatch(/^Week of 7 Sept?: 0\.0 km, 0 runs$/);
    expect(names[3]).toBe("This week so far: 5.0 km, 1 run");
  });

  it("draws a week without running as a stub, not a gap", () => {
    const { container } = renderRuns();
    const quiet = bars(container).find(
      (r) => r.getAttribute("data-bin") === "2026-09-07"
    );
    expect(quiet?.getAttribute("class")).toContain("fill-muted");
  });
});

describe("sliding along the chart", () => {
  /* Three months draw fourteen bars, about 23 px each on a phone: too
     narrow to aim a thumb at, so the whole chart follows a slide. */
  function slideable(onPick = vi.fn()) {
    renderRuns("km", { onPick });
    const layer = screen.getByTestId("bar-targets");
    // Four bars across 400 px: a bar every 100 px.
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 400,
      bottom: 100,
      width: 400,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.mocked(haptic).mockClear();
    return { layer, onPick };
  }
  const at = (clientX: number) => ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX,
  });
  const reading = () => screen.getByTestId("bin-reading");

  it("reads the bar under the finger as it moves, and tells the page once", () => {
    const { layer, onPick } = slideable();
    fireEvent.pointerDown(layer, at(350));
    fireEvent.pointerMove(layer, at(250));
    expect(reading()).toHaveTextContent(/^Week of 14 Sept?: 32\.0 km/);
    fireEvent.pointerMove(layer, at(30));
    expect(reading()).toHaveTextContent(/^Week of 31 Aug: 24\.0 km/);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.pointerUp(layer, at(30));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ key: "2026-08-31" })
    );
  });

  it("ticks once for each bar it passes, not for every move", () => {
    const { layer } = slideable();
    fireEvent.pointerDown(layer, at(350));
    fireEvent.pointerMove(layer, at(320));
    fireEvent.pointerMove(layer, at(260));
    fireEvent.pointerMove(layer, at(240));
    fireEvent.pointerMove(layer, at(150));
    // 350 → 320 stays on this week; 260 and 240 are one bar; 150 another.
    expect(haptic).toHaveBeenCalledTimes(2);
  });

  it("keeps reading past the chart's edge, on the last bar", () => {
    const { layer } = slideable();
    fireEvent.pointerDown(layer, at(150));
    fireEvent.pointerMove(layer, at(-40));
    expect(reading()).toHaveTextContent(/^Week of 31 Aug/);
    fireEvent.pointerMove(layer, at(900));
    expect(reading()).toHaveTextContent(/^This week so far/);
  });

  it("leaves a press that barely moves to the bar's own tap", () => {
    const { layer, onPick } = slideable();
    fireEvent.pointerDown(layer, at(150));
    fireEvent.pointerMove(layer, at(153));
    fireEvent.pointerUp(layer, at(153));
    expect(reading()).toHaveTextContent(/^This week so far/);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Week of 7 Sept?:/ }));
    expect(reading()).toHaveTextContent(/^Week of 7 Sept?: 0\.0 km/);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("does not count the click that ends a slide as a second pick", () => {
    const { layer, onPick } = slideable();
    fireEvent.pointerDown(layer, at(350));
    fireEvent.pointerMove(layer, at(30));
    fireEvent.pointerUp(layer, at(30));
    fireEvent.click(screen.getByRole("button", { name: /^Week of 31 Aug:/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("keeps the swipe between tabs off the chart", () => {
    // A sideways slide here reads weeks; on the rest of the page the same
    // swipe changes tab (useSwipeNavigation), which is how a slide first
    // landed on Social.
    renderRuns();
    expect(screen.getByTestId("bar-targets")).toHaveAttribute(
      "data-no-page-swipe"
    );
  });

  it("ignores a second finger", () => {
    const { layer } = slideable();
    fireEvent.pointerDown(layer, { ...at(350), isPrimary: false });
    fireEvent.pointerMove(layer, { ...at(30), isPrimary: false });
    expect(reading()).toHaveTextContent(/^This week so far/);
  });
});

describe("the keyboard", () => {
  it("is one Tab stop, on the bar being read", () => {
    renderRuns();
    expect(screen.getAllByRole("button").map((b) => b.tabIndex)).toEqual([
      -1, -1, -1, 0,
    ]);
  });

  it("steps between the bars with the arrow keys, and stops at the ends", () => {
    const onPick = vi.fn();
    renderRuns("km", { onPick });
    const now = screen.getByRole("button", { name: /^This week so far/ });
    now.focus();

    fireEvent.keyDown(now, { key: "ArrowLeft" });
    const before = screen.getByRole("button", { name: /^Week of 14 Sept?:/ });
    expect(before).toHaveFocus();
    expect(before).toHaveAttribute("aria-pressed", "true");
    expect(before.tabIndex).toBe(0);
    expect(screen.getByTestId("bin-reading")).toHaveTextContent(
      /^Week of 14 Sept?: 32\.0 km/
    );

    fireEvent.keyDown(before, { key: "Home" });
    const first = screen.getByRole("button", { name: /^Week of 31 Aug:/ });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "End" });
    expect(now).toHaveFocus();
    // ArrowLeft, Home and End picked; ArrowLeft at the start did not.
    expect(onPick).toHaveBeenCalledTimes(3);
  });
});

describe("months from last year", () => {
  it("name their year on the first label under the chart, and on every reading", () => {
    const y = new Date().getFullYear();
    renderRuns("km", {
      granularity: "monthly",
      bins: [
        bin(`${y - 1}-11-01`, { runs: 2, distanceM: 10_000 }),
        bin(`${y - 1}-12-01`, { runs: 3, distanceM: 20_000 }),
        bin(`${y}-01-01`, { runs: 3, distanceM: 20_000 }, true),
      ],
    });
    expect(screen.getByText(`Nov ${y - 1}`)).toBeInTheDocument();
    expect(screen.getByText("Dec")).toBeInTheDocument();
    expect(screen.queryByText(`Dec ${y - 1}`)).toBeNull();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Dec ${y - 1}: 20\\.0 km, 3 runs$`),
      })
    ).toBeInTheDocument();
  });
});

describe("the reader's unit", () => {
  it("reads miles on the figures, the bars and the average for a mile runner", () => {
    renderRuns("mi");
    expect(screen.getByText("mi run")).toBeInTheDocument();
    expect(screen.getByTestId("bin-reading")).toHaveTextContent(
      "This week so far: 3.1 mi · 1 run"
    );
    expect(screen.getByText("11.6 mi")).toBeInTheDocument();
  });
});

describe("the weekly average", () => {
  it("is drawn and named for weeks", () => {
    renderRuns();
    expect(screen.getByTestId("weekly-average")).toBeInTheDocument();
    expect(screen.getByText("Weekly average")).toBeInTheDocument();
  });

  it("is monthly over months", () => {
    renderRuns("km", { granularity: "monthly" });
    expect(screen.getByText("Monthly average")).toBeInTheDocument();
  });

  it("is not drawn over days, or without one", () => {
    const { unmount } = renderRuns("km", { granularity: "daily" });
    expect(screen.queryByTestId("weekly-average")).toBeNull();
    unmount();
    renderRuns("km", { average: null });
    expect(screen.queryByTestId("weekly-average")).toBeNull();
  });
});

describe("too few sessions for a chart", () => {
  it("says what it takes instead of drawing bars", () => {
    const { container } = render(
      <TrainingWeeksCard
        title="Volume"
        subtitle="Last 30 days"
        figures={liftingFigures({ volumeKg: 8200, sessions: 2, sets: 30 })}
        bins={[
          bin("2026-09-14", { lifts: 1, volumeKg: 4000 }),
          bin("2026-09-21", { lifts: 1, volumeKg: 4200 }, true),
        ]}
        granularity="weekly"
        sport="lifting"
        reading={liftingBins}
        average={null}
        averageText=""
      />
    );
    expect(screen.getByText("Log 3 lifts to see the chart")).toBeVisible();
    expect(bars(container)).toEqual([]);
    // The figures stand: a raw value is always shown.
    expect(screen.getByText("8.2k")).toBeInTheDocument();
  });
});

describe("west of UTC", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("names a Monday week key by its Monday", () => {
    renderRuns();
    // "2026-08-31" parsed as UTC midnight and read back locally would be
    // Sunday 30 August here.
    expect(
      screen.getByRole("button", { name: /^Week of 31 Aug:/ })
    ).toBeInTheDocument();
  });
});
