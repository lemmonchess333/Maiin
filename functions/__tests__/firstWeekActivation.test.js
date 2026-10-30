import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ACTIVATION_WINDOW_MS,
  firstValidActivities,
  activityWithinWindow,
  activationSport,
} = require("../lib/firstWeekActivation.js");
const {
  parseArgs,
  addRow,
  presentRow,
  verifiedStartWithinWindow,
  PAID_WINDOW_MS,
} = require("../scripts/report-first-week-activation.js");

const start = Date.UTC(2026, 9, 1);

describe("server-time first-week activation report", () => {
  it("requires a mature, explicit UTC cohort window", () => {
    expect(
      parseArgs([
        "--project=demo-tropos",
        "--since=2026-01-01",
        "--until=2026-01-08",
      ]).untilMs
    ).toBe(Date.UTC(2026, 0, 8));
    expect(() =>
      parseArgs([
        "--project=demo-tropos",
        "--since=2026-02-30",
        "--until=2026-03-08",
      ])
    ).toThrow(/real UTC date/);
    expect(() =>
      parseArgs([
        "--project=demo-tropos",
        "--since=2026-10-01",
        "--until=2099-01-01",
      ])
    ).toThrow(/14 days/);
  });

  it("uses Firestore createTime at the inclusive 168-hour boundary", () => {
    expect(activityWithinWindow(start - 1, start)).toBe(false);
    expect(activityWithinWindow(start, start)).toBe(true);
    expect(activityWithinWindow(start + ACTIVATION_WINDOW_MS, start)).toBe(
      true
    );
    expect(activityWithinWindow(start + ACTIVATION_WINDOW_MS + 1, start)).toBe(
      false
    );
  });

  it("counts only valid persisted activity, regardless of client timestamps", () => {
    const result = firstValidActivities(
      start,
      [
        {
          createdAtMs: start + 1000,
          data: { createdAt: "2000-01-01", exercises: [] },
        },
        {
          createdAtMs: start + 3000,
          data: {
            createdAt: "2099-01-01",
            exercises: [{ sets: [{ reps: 5 }] }],
          },
        },
      ],
      [
        {
          createdAtMs: start + 2000,
          data: { completedAt: "2000-01-01", distance: 80, duration: 40 },
        },
        {
          createdAtMs: start + 1500,
          data: { distance: 500, duration: 300, savedAnyway: true },
        },
      ]
    );
    expect(result).toEqual({
      workoutAtMs: start + 3000,
      runAtMs: start + 2000,
      activityAtMs: start + 2000,
    });
  });

  it("excludes offline activity that syncs after the window", () => {
    const result = firstValidActivities(
      start,
      [
        {
          createdAtMs: start + ACTIVATION_WINDOW_MS + 1,
          data: { exercises: [{ sets: [{ reps: 5 }] }] },
        },
      ],
      []
    );
    expect(result.activityAtMs).toBeNull();
  });

  it("keeps the known athlete segments explicit", () => {
    expect(
      ["Runner", "Lifter", "Hybrid", "Other"].map(activationSport)
    ).toEqual(["runner", "lifter", "hybrid", "other"]);
  });

  it("counts provider-verified starts separately from saved activity, within each follow-up window", () => {
    const row = {
      onboarded: 0,
      firstValidActivity: 0,
      firstValidWorkout: 0,
      firstValidRun: 0,
      verifiedTrialStarts: 0,
      verifiedPaidStarts: 0,
      activityAndTrial: 0,
      activityAndPaid: 0,
      activityLagHours: [],
    };
    const first = {
      workoutAtMs: start + 60_000,
      runAtMs: null,
      activityAtMs: start + 60_000,
    };
    const billing = {
      trial: { atMs: start + 5_000, source: "ios_iap" },
      paid: { atMs: start + 7 * 86_400_000, source: "ios_iap" },
    };
    addRow(row, first, start, billing);
    expect(presentRow(row)).toMatchObject({
      onboarded: 1,
      firstValidActivity: 1,
      verifiedTrialStarts: 1,
      verifiedPaidStarts: 1,
      activityAndTrial: 1,
      activityAndPaid: 1,
    });
    expect(verifiedStartWithinWindow(billing, "paid", start, PAID_WINDOW_MS))
      .toBe(true);
    expect(
      verifiedStartWithinWindow(
        { paid: { atMs: start - 1, source: "stripe" } },
        "paid",
        start,
        PAID_WINDOW_MS
      )
    ).toBe(false);
    expect(
      verifiedStartWithinWindow(
        { paid: { atMs: start + 1, source: "client" } },
        "paid",
        start,
        PAID_WINDOW_MS
      )
    ).toBe(false);
  });
});
