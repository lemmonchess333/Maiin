/**
 * The weekly review by email (App1 Q55): which week, which figures, and the
 * words. Every figure is one the app counts the same way; the email says
 * "saved" for sessions, never a planned count, and nothing for a week with
 * nothing in it.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const review = require("../lib/weeklyReviewEmail");

const UNSUBSCRIBE = "https://troposfit.com/email/unsubscribe?u=abc&t=tok";

describe("reviewedWeek", () => {
  it("is the Monday-to-Sunday week before the one holding today, where the person is", () => {
    // Monday 16 November 2026, 08:00 in London.
    const now = Date.UTC(2026, 10, 16, 8, 0);
    expect(review.reviewedWeek(now, "Europe/London")).toEqual({
      start: "2026-11-09",
      end: "2026-11-15",
      next: "2026-11-16",
    });
  });

  it("reads the day in the person's zone, not the server's", () => {
    // 20:00 UTC on Sunday 15 November is already Monday in Auckland.
    const now = Date.UTC(2026, 10, 15, 20, 0);
    expect(review.reviewedWeek(now, "Pacific/Auckland").start).toBe(
      "2026-11-09"
    );
    expect(review.reviewedWeek(now, "Europe/London").start).toBe("2026-11-02");
  });

  it("is null without a zone", () => {
    expect(review.reviewedWeek(Date.now(), null)).toBeNull();
  });
});

describe("weekFigures", () => {
  const week = { start: "2026-11-09", end: "2026-11-15" };

  it("counts saved lifts, runs that count, their distance and food days", () => {
    const figures = review.weekFigures({
      week,
      workouts: [
        { date: "2026-11-09", exercises: [] },
        { date: "2026-11-11", exercises: [] },
        // The week before: not this week's.
        { date: "2026-11-08", exercises: [] },
      ],
      runs: [
        { date: "2026-11-10", distance: 5000, duration: 1800 },
        { date: "2026-11-14", distance: 9200, duration: 3300 },
        // Saved anyway: counts nowhere, as on every run total.
        {
          date: "2026-11-12",
          distance: 4000,
          duration: 1500,
          savedAnyway: true,
        },
      ],
      meals: [
        { date: "2026-11-09", totalCalories: 500 },
        { date: "2026-11-09", totalCalories: 400 },
        { date: "2026-11-10", totalCalories: 2100 },
        // Under 800 kcal: not a food day.
        { date: "2026-11-11", totalCalories: 300 },
        // Deleted: not counted.
        { date: "2026-11-12", totalCalories: 2000, deletedAt: { seconds: 1 } },
        // Outside the week.
        { date: "2026-11-16", totalCalories: 2000 },
      ],
    });
    expect(figures).toEqual({
      lifts: 2,
      runs: 2,
      distanceM: 14200,
      markedDone: 0,
      foodDays: 2,
    });
    expect(review.hasFigures(figures)).toBe(true);
  });

  it("has nothing to say for a week with nothing in it, or only a coffee", () => {
    const figures = review.weekFigures({
      week,
      workouts: [],
      runs: [],
      meals: [{ date: "2026-11-10", totalCalories: 90 }],
    });
    expect(review.hasFigures(figures)).toBe(false);
  });
});

describe("weekRangeLabel", () => {
  it("is the review page's form", () => {
    expect(
      review.weekRangeLabel({ start: "2026-11-09", end: "2026-11-15" })
    ).toBe("9–15 Nov");
    expect(
      review.weekRangeLabel({ start: "2026-11-30", end: "2026-12-06" })
    ).toBe("30 Nov – 6 Dec");
  });
});

describe("the email", () => {
  const week = { start: "2026-11-09", end: "2026-11-15" };

  it("says what the person saved, with the number and its comparison", () => {
    const email = review.buildWeeklyReviewEmail({
      figures: { lifts: 3, runs: 2, distanceM: 14230, foodDays: 5 },
      week,
      unit: "km",
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.subject).toBe("Your week, reviewed: 9–15 Nov");
    expect(email.text).toContain(
      "You saved 3 lifts and 2 runs. You ran 14.2 km."
    );
    expect(email.text).toContain("You logged food on 5 of 7 days.");
    expect(email.text).toContain(
      "Open your review: https://troposfit.com/review?from=email"
    );
    expect(email.html).toContain(
      'href="https://troposfit.com/review?from=email"'
    );
  });

  it("says miles for someone who runs in miles", () => {
    const email = review.buildWeeklyReviewEmail({
      figures: { lifts: 0, runs: 1, distanceM: 8046.72, foodDays: 0 },
      week,
      unit: "mi",
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.text).toContain("You saved 1 run. You ran 5.0 mi.");
    expect(email.text).not.toContain("km");
    expect(email.text).not.toContain("food");
  });

  it("leaves out what was not done, rather than saying 0", () => {
    const email = review.buildWeeklyReviewEmail({
      figures: { lifts: 0, runs: 0, distanceM: 0, foodDays: 4 },
      week,
      unit: "km",
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.text).toContain("You logged food on 4 of 7 days.");
    expect(email.text).not.toMatch(/\b0 (lifts|runs)\b/);
    expect(email.text).not.toContain("You saved");
  });

  it("says why it came, how to stop it and who sent it", () => {
    const email = review.buildWeeklyReviewEmail({
      figures: { lifts: 1, runs: 0, distanceM: 0, foodDays: 0 },
      week,
      unit: "km",
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.text).toContain(
      "You’re getting this because you chose the weekly review email in Tropos."
    );
    expect(email.text).toContain(UNSUBSCRIBE);
    expect(email.text).toContain(
      "Sent by Tropos. Questions: support@troposfit.com"
    );
    expect(email.html).toContain(
      `href="${UNSUBSCRIBE.replace(/&/g, "&amp;")}"`
    );
  });

  it("carries no tracking pixel and no guilt", () => {
    const email = review.buildWeeklyReviewEmail({
      figures: { lifts: 1, runs: 0, distanceM: 0, foodDays: 0 },
      week,
      unit: "km",
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.html).not.toMatch(/<img/i);
    expect(`${email.subject} ${email.text}`).not.toMatch(
      /miss(ed)?|streak|lost|behind|only|don’t give up|!/i
    );
  });
});
