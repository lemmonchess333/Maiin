import { describe, expect, it } from "vitest";
import { sessionRecords } from "../sessionRecords";
import { recordSetBest } from "@/lib/prTracking";

const baseline = recordSetBest({}, "Bench Press", {
  weight: 60,
  reps: 8,
  date: "2026-09-01",
});
const volumeBaseline = { "Bench Press": { volume: 960, date: "2026-09-01" } };
const exercises = [{ name: "Bench Press" }];
const set = (weight: number, extra = {}) => ({
  weight,
  reps: 8,
  completed: true,
  type: "working",
  ...extra,
});
const rebuild = (sets: ReturnType<typeof set>[]) =>
  sessionRecords(
    baseline,
    volumeBaseline,
    { "Bench Press": 5 },
    exercises,
    [sets],
    "2026-09-09"
  );

describe("session record corrections", () => {
  it("removes a mistaken best and restores the historical volume record", () => {
    const before = rebuild([set(72), set(72)]);
    expect(before.map["Bench Press"]["8rm"]?.weight).toBe(72);
    expect(before.volumeBest["Bench Press"].volume).toBe(1152);
    const after = rebuild([set(55), set(55)]);
    expect(after.map).toEqual(baseline);
    expect(after.volumeBest).toEqual(volumeBaseline);
    expect(after.results.size).toBe(0);
    expect(after.fired.size).toBe(0);
  });

  it("keeps a legitimate later best when an earlier set is corrected down", () => {
    const after = rebuild([set(55), set(62.5)]);
    expect(after.map["Bench Press"]["8rm"]?.weight).toBe(62.5);
    expect(after.results.get("Bench Press:8rm")).toMatchObject({
      kind: "best",
      setKey: "0:1",
    });
    expect(after.fired.get("Bench Press")).toEqual(["8rm"]);
  });

  it("excludes undone, warm-up, invalid, suspicious and timed sets", () => {
    const after = rebuild([
      set(65, { completed: false }),
      set(65, { type: "warmup" }),
      set(-1),
      set(400),
    ]);
    expect(after.map).toEqual(baseline);
    expect(after.volumeBest).toEqual(volumeBaseline);
    const timed = sessionRecords(
      {},
      {},
      {},
      [{ name: "Plank", repUnit: "seconds" }],
      [[set(20)]],
      "2026-09-09"
    );
    expect(timed.map).toEqual({});
    expect(timed.volumeBest).toEqual({});
  });
});
