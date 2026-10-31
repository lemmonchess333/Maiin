import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { reviewWaits } = require("../lib/weeklyRecap");
const { buildWeeklyRecapMessage } = require("../lib/pushSend");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");

describe("Monday's recap push", () => {
  it("opens the weekly review, and says it is ready", () => {
    const { data } = buildWeeklyRecapMessage();
    expect(data.route).toBe("/review");
    expect(data.title).toBe("Your week, reviewed");
    expect(data.body).toBe("Last week in a few cards, and the week ahead.");
  });

  it("goes only when a review waits: something logged in the week or before it", async () => {
    const weekEnd = "2026-10-25";
    expect(await reviewWaits(memoryFirestore(), "u1", weekEnd)).toBe(false);
    const later = memoryFirestore({
      "users/u1/meals/m1": { date: "2026-10-27" },
    });
    expect(await reviewWaits(later, "u1", weekEnd)).toBe(false);
    for (const name of ["workouts", "runs", "meals"]) {
      const db = memoryFirestore({
        [`users/u1/${name}/a`]: { date: "2026-10-20" },
      });
      expect(await reviewWaits(db, "u1", weekEnd)).toBe(true);
    }
  });
});
