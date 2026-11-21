/**
 * Recently deleted meals, both halves (F5c, STATUS 2026-11-21): the day the
 * page says a meal goes is the day the server's job removes it.
 *
 * src/lib/mealPurge.ts tells the person how long each deleted meal has left;
 * functions/lib/mealPurge.js is the hourly `purgeSoftDeletedMeals` that
 * deletes it. Each keeps its own copy of the 30 days. The RUNNING copy is
 * driven here (ADR-0008): the real job, on the in-memory Firestore, over
 * meals soft-deleted with the app's own `Timestamp`, a minute either side
 * of the day the page names. A different number of days on either side, a
 * day counted another way, or a job that reads another field fails.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { Timestamp } from "firebase/firestore";
import { DELETED_MEAL_RETENTION_DAYS, purgeCountdown } from "@/lib/mealPurge";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/mealPurge.js") as {
  DELETED_MEAL_RETENTION_DAYS: number;
  purgeSoftDeletedMeals: (args: Record<string, unknown>) => Promise<{
    purged: number;
  }>;
};
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");
const {
  withStoredTimestamps,
} = require("../../../functions/__tests__/helpers/storedTimestamps.cjs");

const DAY = 86_400_000;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 21, 12, 45);

describe("a deleted meal's last day, page and job", () => {
  it("keep the same number of days", () => {
    expect(server.DELETED_MEAL_RETENTION_DAYS).toBe(
      DELETED_MEAL_RETENTION_DAYS
    );
  });

  it("the job removes exactly the meals the page calls due", async () => {
    const deletedAt = {
      lastMinute: NOW - DELETED_MEAL_RETENTION_DAYS * DAY + MINUTE,
      onTheDay: NOW - DELETED_MEAL_RETENTION_DAYS * DAY,
      past: NOW - DELETED_MEAL_RETENTION_DAYS * DAY - MINUTE,
      fresh: NOW - MINUTE,
    };
    const db = withStoredTimestamps(
      memoryFirestore(
        Object.fromEntries(
          Object.entries(deletedAt).map(([id, ms]) => [
            `users/u1/meals/${id}`,
            {
              date: "2026-10-20",
              foodName: id,
              items: [],
              totalCalories: 300,
              // As `undoMealEntries` stamps it.
              deletedAt: Timestamp.fromMillis(ms),
            },
          ])
        )
      )
    );

    const pageSaysDue = Object.entries(deletedAt)
      .filter(([, ms]) => purgeCountdown(ms, NOW).kind === "due")
      .map(([id]) => id)
      .sort();
    // Anchor: the page calls some due and some not, so the match below
    // is not satisfied by a job that removes everything or nothing.
    expect(pageSaysDue).toEqual(["onTheDay", "past"]);

    await server.purgeSoftDeletedMeals({
      firestore: db,
      toTimestamp: (ms: number) => Timestamp.fromMillis(ms),
      nowMs: NOW,
    });
    const removed = Object.keys(deletedAt)
      .filter((id) => !db.data.has(`users/u1/meals/${id}`))
      .sort();
    expect(removed).toEqual(pageSaysDue);
  });
});
