/**
 * The weekly challenge card's own lifts: this week's, Monday to Sunday,
 * counted as every week's lifts are (`weekDone`, trainingWeek.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { countMyWeekLifts } from "../myWeekLifts";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { savedWorkoutDoc } from "@/test/sessionFixtures";
import { addLocalDays, localDateString } from "@/lib/dateHelpers";

/** A Wednesday at noon, derived from the clock's own week. */
const WEDNESDAY = (() => {
  const today = new Date();
  const wednesday = addLocalDays(today, 2 - ((today.getDay() + 6) % 7));
  wednesday.setHours(12, 0, 0, 0);
  return wednesday;
})();
const day = (offset: number) =>
  localDateString(addLocalDays(WEDNESDAY, offset));

beforeEach(() => {
  resetFirestore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WEDNESDAY);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("countMyWeekLifts", () => {
  it("counts this week's lifts from Monday, and not last week's", async () => {
    seedFirestore({
      "users/u1/workouts/mon": savedWorkoutDoc(day(-2)),
      "users/u1/workouts/wed": savedWorkoutDoc(day(0)),
      // Last Sunday: last week.
      "users/u1/workouts/sun": savedWorkoutDoc(day(-3)),
    });
    expect(await countMyWeekLifts("u1")).toBe(2);
  });

  it("is zero with nothing lifted", async () => {
    expect(await countMyWeekLifts("u1")).toBe(0);
  });
});
