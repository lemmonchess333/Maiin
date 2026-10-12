/**
 * The run splits table (RunSummary and RunDetail): one row per lap with its
 * pace (unit spaced), its height change when the run has any, and a bar
 * whose length is the lap's speed against the fastest lap's. The fastest
 * lap is marked by weight and named in words, never by a colour.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SplitsTable from "../SplitsTable";
import type { Split } from "@/lib/gps";

afterEach(() => cleanup());

function split(
  km: number,
  paceSeconds: number,
  elevationGain = 0,
  elevationLoss = 0
): Split {
  return {
    km,
    time: paceSeconds,
    pace: "",
    paceSeconds,
    elevationGain,
    elevationLoss,
  };
}

/** The run-finish capture's five laps; lap 3 (5:52 /km) is fastest. */
const FLAT: Split[] = [
  split(1, 372),
  split(2, 364),
  split(3, 352),
  split(4, 358),
  split(5, 354),
];

const squash = (el: Element) =>
  (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** Body rows only, in order. */
function bodyRows(): HTMLElement[] {
  const [, body] = within(screen.getByRole("table")).getAllByRole("rowgroup");
  return within(body).getAllByRole("row");
}

/** A row as its cells read, one space between cells. */
const rowText = (row: HTMLElement) =>
  Array.from(row.children).map(squash).join(" ");

const inTable = () => within(screen.getByRole("table"));

describe("SplitsTable — kilometre laps", () => {
  it("is one table: a row per lap with the pace and its spaced unit", () => {
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="km" />);
    expect(screen.getByRole("heading", { name: "Splits" })).toBeVisible();
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("columnheader", { name: "Km" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Pace" })).toBeVisible();

    const rows = bodyRows();
    expect(rows).toHaveLength(5);
    // "6:12 /km", never the unspaced "6:12/km" the loose list printed.
    expect(rowText(rows[0])).toBe("1 6:12 /km");
    expect(rowText(rows[4])).toBe("5 5:54 /km");
  });

  it("names the fastest lap in words above the table", () => {
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="km" />);
    expect(screen.getByText(/^Fastest:/).textContent).toBe(
      "Fastest: km 3 · 5:52 /km"
    );
  });

  it("marks the fastest lap's row by weight, and only that row", () => {
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="km" />);
    // Screen readers hear it too.
    const fastestHeader = screen.getByRole("rowheader", { name: "3, fastest" });
    expect(fastestHeader).toHaveClass("font-bold");
    expect(inTable().getByText("5:52")).toHaveClass("font-bold");

    for (const pace of ["6:12", "6:04", "5:58", "5:54"]) {
      expect(inTable().getByText(pace)).not.toHaveClass("font-bold");
    }
    expect(
      screen
        .getAllByRole("rowheader")
        .filter((header) => header.classList.contains("font-bold"))
    ).toEqual([fastestHeader]);
  });

  it("draws each lap's bar at its speed against the fastest lap's, from zero", () => {
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="km" />);
    const widths = bodyRows().map((row) =>
      parseFloat(within(row).getByTestId("split-bar").style.width)
    );
    // Lap 3 is the fastest: the full width.
    expect(widths[2]).toBeCloseTo(100, 5);
    // Lap 1 at 6:12 against 5:52 runs at 352/372 of its speed.
    expect(widths[0]).toBeCloseTo((352 / 372) * 100, 5);
    // Faster is longer, throughout.
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(widths[4]).toBeGreaterThan(widths[3]);
  });

  it("adds a height-change column only when the run has a climb", () => {
    render(
      <SplitsTable
        splits={[split(1, 372, 6, 2), split(2, 364, 0, 5), split(3, 352, 3, 3)]}
        lapUnit="km"
        unit="km"
      />
    );
    expect(
      screen.getByRole("columnheader", { name: "Elevation change" })
    ).toBeVisible();
    const rows = bodyRows();
    expect(rowText(rows[0])).toBe("1 6:12 /km +4 m");
    // A descent takes a real minus sign; a lap that climbed what it fell is 0.
    expect(rowText(rows[1])).toBe("2 6:04 /km −5 m");
    expect(rowText(rows[2])).toBe("3, fastest 5:52 /km 0 m");
  });

  it("shows the column for a run that only went down", () => {
    // A downhill point-to-point run climbs nothing and still has a profile.
    render(
      <SplitsTable
        splits={[split(1, 372, 0, 5), split(2, 364, 0, 12)]}
        lapUnit="km"
        unit="km"
      />
    );
    expect(
      screen.getByRole("columnheader", { name: "Elevation change" })
    ).toBeVisible();
    expect(rowText(bodyRows()[1])).toBe("2, fastest 6:04 /km −12 m");
  });

  it("has no height-change column for a run with no climb recorded", () => {
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="km" />);
    // POSITIVE anchor: the table and its rows are there.
    expect(screen.getByRole("columnheader", { name: "Pace" })).toBeVisible();
    expect(bodyRows()).toHaveLength(5);
    expect(
      screen.queryByRole("columnheader", { name: "Elevation change" })
    ).toBeNull();
    // Two cells a row: the lap and its pace, no column of zeros.
    for (const row of bodyRows()) expect(row.children).toHaveLength(2);
  });
});

describe("SplitsTable — a miles reader", () => {
  it("reads mile laps in miles: the header, the paces and the climbs", () => {
    render(
      <SplitsTable
        splits={[split(1, 372, 6, 2), split(2, 352), split(3, 364)]}
        lapUnit="mi"
        unit="mi"
      />
    );
    expect(screen.getByRole("columnheader", { name: "Mi" })).toBeVisible();
    // 352 s/km × 1.609344 = 566.5 s/mi → 9:26 /mi.
    expect(screen.getByText(/^Fastest:/).textContent).toBe(
      "Fastest: mile 2 · 9:26 /mi"
    );
    // 372 s/km is 9:59 /mi, and 4 m up is 13 ft.
    expect(rowText(bodyRows()[0])).toBe("1 9:59 /mi +13 ft");
    expect(screen.queryByText("/km")).toBeNull();
  });

  it("keeps kilometre rows headed as kilometres when that is all the run has", () => {
    // No trace to recut (treadmill, manual): splitsForDisplay hands back
    // the saved kilometre rows with lapUnit "km". The paces still convert.
    render(<SplitsTable splits={FLAT} lapUnit="km" unit="mi" />);
    expect(screen.getByRole("columnheader", { name: "Km" })).toBeVisible();
    expect(screen.getByText(/^Fastest:/).textContent).toBe(
      "Fastest: km 3 · 9:26 /mi"
    );
  });
});

describe("SplitsTable — few laps", () => {
  it("one lap has nothing to compare against: no bar and no fastest", () => {
    render(<SplitsTable splits={[split(1, 352)]} lapUnit="km" unit="km" />);
    // POSITIVE anchor: the lap's row is there.
    expect(rowText(bodyRows()[0])).toBe("1 5:52 /km");
    expect(screen.queryByTestId("split-bar")).toBeNull();
    expect(screen.queryByText(/^Fastest:/)).toBeNull();
    expect(inTable().getByText("5:52")).not.toHaveClass("font-bold");
  });

  it("a lap with no usable time gets no bar and no say in the fastest", () => {
    render(
      <SplitsTable
        splits={[split(1, 372), split(2, 0), split(3, 364)]}
        lapUnit="km"
        unit="km"
      />
    );
    const rows = bodyRows();
    expect(rowText(rows[1])).toBe("2 --:--");
    expect(within(rows[1]).queryByTestId("split-bar")).toBeNull();
    expect(screen.getByText(/^Fastest:/).textContent).toBe(
      "Fastest: km 3 · 6:04 /km"
    );
  });

  it("renders nothing without laps", () => {
    const { container } = render(
      <SplitsTable splits={[]} lapUnit="km" unit="km" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
