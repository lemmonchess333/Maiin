import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SplitsTable from "../SplitsTable";
import type { Split } from "@/lib/gps";
import type { RunLapSplit } from "@/lib/runLaps";

afterEach(() => cleanup());

const KM_SPLITS: Split[] = [
  {
    km: 1,
    time: 300,
    pace: "",
    paceSeconds: 300,
    elevationGain: 0,
    elevationLoss: 0,
  },
  {
    km: 2,
    time: 290,
    pace: "",
    paceSeconds: 290,
    elevationGain: 0,
    elevationLoss: 0,
  },
];

const INTERVAL_LAPS: RunLapSplit[] = [
  {
    index: 1,
    label: "10 min warm-up",
    kind: "warmup",
    distanceMeters: 1600,
    durationSeconds: 600,
    paceSecondsPerKm: 375,
  },
  {
    index: 2,
    label: "Rep 1 of 2 · 1K",
    kind: "work",
    distanceMeters: 1000,
    durationSeconds: 240,
    paceSecondsPerKm: 240,
  },
  {
    index: 3,
    label: "2 min recovery",
    kind: "recovery",
    distanceMeters: 10,
    durationSeconds: 120,
    paceSecondsPerKm: null,
  },
  {
    index: 4,
    label: "Rep 2 of 2 · 1K",
    kind: "work",
    distanceMeters: 1000,
    durationSeconds: 250,
    paceSecondsPerKm: 250,
  },
];

describe("SplitsTable — Intervals and manual laps", () => {
  it("switches between Km and Intervals tabs when both distance and interval splits exist", async () => {
    render(
      <SplitsTable
        splits={KM_SPLITS}
        lapUnit="km"
        unit="km"
        lapSplits={INTERVAL_LAPS}
      />
    );

    expect(await screen.findByRole("radio", { name: "Km" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    const intervalsTab = screen.getByRole("radio", { name: "Intervals" });
    fireEvent.click(intervalsTab);

    expect(intervalsTab).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Rep 1 of 2 · 1K")).toBeVisible();
    expect(screen.getByText("Rest")).toBeVisible();
    expect(screen.getByText(/^Fastest:/).textContent).toBe(
      "Fastest: Rep 1 of 2 · 1K · 4:00 /km"
    );
  });

  it("renders manual laps directly when no whole-km distance splits exist", async () => {
    const manual: RunLapSplit[] = [
      {
        index: 1,
        label: "Lap 1",
        kind: "manual",
        distanceMeters: 400,
        durationSeconds: 92,
        paceSecondsPerKm: 230,
      },
      {
        index: 2,
        label: "Lap 2",
        kind: "manual",
        distanceMeters: 400,
        durationSeconds: 96,
        paceSecondsPerKm: 240,
      },
    ];
    render(
      <SplitsTable splits={[]} lapUnit="km" unit="km" lapSplits={manual} />
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(await screen.findByText("Lap 1")).toBeVisible();
    expect(screen.getByText("Lap 2")).toBeVisible();
  });
});
