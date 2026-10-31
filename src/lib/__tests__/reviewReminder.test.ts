/**
 * The Monday review notification's rules (`reviewReminder.ts`): when it
 * fires, which week it is about, and when it is scheduled at all. Dates
 * are built on the local clock, so the timezone runs read the same days.
 */
import { describe, it, expect } from "vitest";
import {
  nextReviewReminderAt,
  reviewWeekFor,
  shouldScheduleReviewReminder,
} from "@/lib/reviewReminder";
import { localDateString } from "@/lib/dateHelpers";

/** A local date and time around the week of Monday 26 October 2026:
 *  Sunday the 25th before it, Monday 2 November after it. */
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 9, day, hour, minute);

describe("nextReviewReminderAt", () => {
  it("is the coming Monday at 09:00, from a Sunday", () => {
    const fire = nextReviewReminderAt(at(25, 20));
    expect(localDateString(fire)).toBe("2026-10-26");
    expect([fire.getHours(), fire.getMinutes()]).toEqual([9, 0]);
  });

  it("is today at 09:00 on a Monday before it", () => {
    expect(localDateString(nextReviewReminderAt(at(26, 8, 59)))).toBe(
      "2026-10-26"
    );
  });

  it("is next Monday from 09:00 on a Monday onwards", () => {
    expect(localDateString(nextReviewReminderAt(at(26, 9, 0)))).toBe(
      "2026-11-02"
    );
    expect(localDateString(nextReviewReminderAt(at(28)))).toBe("2026-11-02");
    expect(localDateString(nextReviewReminderAt(at(31, 23, 59)))).toBe(
      "2026-11-02"
    );
  });
});

describe("reviewWeekFor", () => {
  it("is the Monday-start week that ended the night before", () => {
    expect(reviewWeekFor(new Date(2026, 9, 26, 9))).toBe("2026-10-19");
    expect(reviewWeekFor(new Date(2026, 10, 2, 9))).toBe("2026-10-26");
  });
});

describe("shouldScheduleReviewReminder", () => {
  const base = { enabled: true, pushOwns: false, waiting: true, viewed: false };

  it("schedules for a review waiting and unread", () => {
    expect(shouldScheduleReviewReminder(base)).toBe(true);
  });

  it.each([
    ["the switch is off", { enabled: false }],
    ["the server's recap push says it already", { pushOwns: true }],
    ["the push settings have not loaded", { pushOwns: null }],
    ["no review will be waiting", { waiting: false }],
    ["the review has been read", { viewed: true }],
  ] as const)("does not schedule when %s", (_why, change) => {
    expect(shouldScheduleReviewReminder({ ...base, ...change })).toBe(false);
  });
});
