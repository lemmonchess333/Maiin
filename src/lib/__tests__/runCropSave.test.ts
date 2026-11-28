/**
 * A cropped run is saved with its shoe's distance in one transaction (the
 * 28 November audit, #3593: a crop left the shoe's mileage as it was, and
 * kept the old laps and heart-rate summary).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  readDoc,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { saveCroppedRun } from "../runCropSave";
import type { CroppedRunStats } from "../runCrop";

const RUN = "users/u1/runs/r1";
const SHOE = "users/u1/shoes/s1";

const heartRate = {
  averageBpm: 150,
  maxBpm: 170,
  coveredSeconds: 1800,
  movingSeconds: 1800,
  coverage: 1,
  zoneSeconds: [0, 600, 1200, 0, 0],
  maxHr: 190,
  source: "apple-watch",
};

function savedRun(extra: Record<string, unknown> = {}) {
  return {
    distance: 12_000,
    duration: 3000,
    shoeId: "s1",
    isInvalid: false,
    savedAnyway: false,
    heartRate,
    lapSplits: [
      {
        index: 1,
        label: "Lap 1",
        kind: "manual",
        distanceMeters: 12_000,
        durationSeconds: 3000,
        paceSecondsPerKm: 250,
      },
    ],
    ...extra,
  };
}

function cropped(extra: Partial<CroppedRunStats> = {}): CroppedRunStats {
  return {
    points: [],
    distance: 5000,
    duration: 1500,
    avgPace: 300,
    splits: [],
    elevationGain: 3,
    calories: 300,
    bestEfforts: [],
    routePreview: [],
    lapSplits: [],
    ...extra,
  };
}

beforeEach(() => resetFirestore());

describe("saveCroppedRun", () => {
  it("takes the kilometres cropped off the run's shoe", async () => {
    seedFirestore({
      [RUN]: savedRun(),
      [SHOE]: { totalKm: 512.3, maxKm: 600, alert85Shown: true },
    });
    const saved = await saveCroppedRun("u1", "r1", cropped());
    expect(saved.shoeKm).toBeCloseTo(-7, 5);
    expect(readDoc(SHOE)).toMatchObject({
      totalKm: 505.3,
      // 505.3 of 600 is 84%: the 85% warning may come back.
      alert85Shown: false,
      alert100Shown: false,
    });
    expect(readDoc(RUN)).toMatchObject({ distance: 5000, duration: 1500 });
  });

  it("removes the heart-rate summary and writes the laps the crop left", async () => {
    seedFirestore({ [RUN]: savedRun(), [SHOE]: { totalKm: 50, maxKm: 600 } });
    const lap = {
      index: 1,
      label: "Lap 1",
      kind: "manual" as const,
      distanceMeters: 5000,
      durationSeconds: 1500,
      paceSecondsPerKm: 300,
    };
    const saved = await saveCroppedRun(
      "u1",
      "r1",
      cropped({ lapSplits: [lap] })
    );
    expect(saved.heartRateRemoved).toBe(true);
    const run = readDoc(RUN);
    expect(run).not.toHaveProperty("heartRate");
    expect(run?.lapSplits).toEqual([lap]);
  });

  it("removes the old laps when none are left, and writes the work portion", async () => {
    seedFirestore({ [RUN]: savedRun(), [SHOE]: { totalKm: 50, maxKm: 600 } });
    await saveCroppedRun(
      "u1",
      "r1",
      cropped({ workPortion: { seconds: 900, meters: 3200 } })
    );
    const run = readDoc(RUN);
    expect(run).not.toHaveProperty("lapSplits");
    expect(run?.workPortion).toEqual({ seconds: 900, meters: 3200 });
  });

  it("leaves a retired shoe's history alone", async () => {
    seedFirestore({
      [RUN]: savedRun(),
      [SHOE]: { totalKm: 800, maxKm: 600, retired: true },
    });
    await saveCroppedRun("u1", "r1", cropped());
    expect(readDoc(SHOE)?.totalKm).toBe(800);
    expect(readDoc(RUN)?.distance).toBe(5000);
  });

  it("moves no shoe for a run that never counted toward distance", async () => {
    seedFirestore({
      [RUN]: savedRun({ isInvalid: true, savedAnyway: true }),
      [SHOE]: { totalKm: 50, maxKm: 600 },
    });
    const saved = await saveCroppedRun("u1", "r1", cropped());
    expect(saved.shoeKm).toBe(0);
    expect(readDoc(SHOE)?.totalKm).toBe(50);
  });

  it("refuses a run that is not saved", async () => {
    await expect(saveCroppedRun("u1", "gone", cropped())).rejects.toThrow();
  });
});
