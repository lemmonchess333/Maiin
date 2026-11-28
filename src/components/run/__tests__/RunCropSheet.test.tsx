/**
 * The crop sheet says what a crop does to the run before it is saved, and
 * saves the crop's laps with it (the 28 November audit, #3593). The save
 * itself is `runCropSave.test.ts`'s.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GPSPoint } from "@/lib/gps";

const save = vi.hoisted(() =>
  vi.fn(async () => ({ shoeKm: 0, heartRateRemoved: true }))
);
vi.mock("@/lib/runCropSave", () => ({ saveCroppedRun: save }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import RunCropSheet from "../RunCropSheet";

const START = 1_700_000_000_000;
/** 61 fixes 10 s apart, about 33 m each: ten minutes and 2 km. */
const points: GPSPoint[] = Array.from({ length: 61 }, (_, i) => ({
  lat: 51.5 + i * 0.0003,
  lon: -0.1,
  rawLat: 51.5 + i * 0.0003,
  rawLon: -0.1,
  altitude: 10,
  accuracy: 5,
  speed: null,
  timestamp: START + i * 10_000,
}));
const laps = [
  {
    index: 1,
    label: "Lap 1",
    kind: "manual" as const,
    distanceMeters: 1000,
    durationSeconds: 300,
    paceSecondsPerKm: 300,
  },
  {
    index: 2,
    label: "Lap 2",
    kind: "manual" as const,
    distanceMeters: 1000,
    durationSeconds: 300,
    paceSecondsPerKm: 300,
  },
];

function open(hasHeartRate: boolean) {
  render(
    <RunCropSheet
      open
      onOpenChange={() => {}}
      uid="u1"
      runId="r1"
      points={points}
      weightKg={70}
      unit="km"
      lapSplits={laps}
      recordingStartedAtMs={START}
      hasHeartRate={hasHeartRate}
      onCropped={() => {}}
    />
  );
}

afterEach(() => {
  cleanup();
  save.mockClear();
});

describe("RunCropSheet", () => {
  it("says a crop removes the run's heart rate, before it is saved", () => {
    open(true);
    expect(
      screen.getByText(/Cropping removes this run’s heart rate/)
    ).toBeInTheDocument();
    cleanup();
    open(false);
    expect(screen.queryByText(/heart rate/i)).not.toBeInTheDocument();
  });

  it("saves the laps the crop leaves with the cropped run", async () => {
    open(false);
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save crop" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [, , cropped] = save.mock.calls[0] as unknown as [
      string,
      string,
      { lapSplits: { label: string; durationSeconds: number }[] },
    ];
    expect(
      cropped.lapSplits.map((lap) => [lap.label, lap.durationSeconds])
    ).toEqual([["Lap 1", 200]]);
  });
});
