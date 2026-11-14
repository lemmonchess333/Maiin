/**
 * What Pro did (App1 Q56): the month a review reports, the lines it counts
 * from what the app keeps, their words, and when the "your year" recap is
 * due before a yearly renewal.
 */
import { describe, it, expect } from "vitest";
import {
  appendProChange,
  PRO_CHANGES_KEPT,
  proLineWords,
  proMonthFor,
  proNothingLine,
  proRacePlan,
  proReportLines,
  yearRecapDue,
  type ProChange,
} from "../proReport";
import { group } from "@/test/localeGrouping";
import type { UserProfile } from "../auth";

/** Noon local on a day, as an ISO instant: its local day is that day in
 *  every zone the suite runs in. */
const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();

const OCTOBER = { start: "2026-10-01", end: "2026-10-31" };

describe("proMonthFor — the month's first review reports the month before", () => {
  it("reports October on the review read on Monday 2 November", () => {
    // Reviewed week 26 Oct to 1 Nov; read on Monday 2 November.
    expect(proMonthFor("2026-10-26")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
      name: "October",
    });
  });

  it("reports the month that has ended when its first Monday is the 7th", () => {
    // Reviewed week 31 Aug to 6 Sep; read on Monday 7 September.
    expect(proMonthFor("2026-08-31")?.name).toBe("August");
  });

  it("is null on every other review", () => {
    expect(proMonthFor("2026-11-02")).toBeNull(); // read on the 9th
    expect(proMonthFor("2026-10-19")).toBeNull(); // read on 26 October
  });

  it("crosses the year: January's first review reports December", () => {
    // Reviewed week 28 Dec 2026 to 3 Jan 2027; read on Monday 4 January.
    expect(proMonthFor("2026-12-28")).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
      name: "December",
    });
  });

  it("is null for a key that is not a day", () => {
    expect(proMonthFor("2026-W27")).toBeNull();
    expect(proMonthFor("")).toBeNull();
  });
});

describe("proReportLines — only what the app kept", () => {
  const none = { changes: [], meals: [], racePlan: null };

  it("says nothing for a month Pro did nothing in", () => {
    expect(proReportLines({ ...OCTOBER, ...none })).toEqual([]);
    expect(proNothingLine("in October")).toBe(
      "Pro made no changes for you in October."
    );
  });

  it("counts the calorie target's moves in the month, from the first to the last", () => {
    const changes: ProChange[] = [
      { kind: "calories", at: at("2026-09-28"), from: 2200, to: 2300 },
      { kind: "calories", at: at("2026-10-12"), from: 2400, to: 2450 },
      { kind: "calories", at: at("2026-10-05"), from: 2300, to: 2400 },
      { kind: "calories", at: at("2026-11-02"), from: 2450, to: 2500 },
    ];
    expect(proReportLines({ ...OCTOBER, ...none, changes })).toEqual([
      { kind: "calories", count: 2, from: 2300, to: 2450 },
    ]);
  });

  it("counts photo scans and typed meals the AI read, and nothing else", () => {
    const meals = [
      { date: "2026-10-02", confidence: "high" },
      { date: "2026-10-03", confidence: "Medium" },
      { date: "2026-10-04", confidence: "low" },
      { date: "2026-10-05", confidence: "ai-parse" },
      // Logged without the AI, or a copy of a scanned meal.
      { date: "2026-10-06", confidence: "barcode" },
      { date: "2026-10-06", confidence: "manual" },
      { date: "2026-10-06", confidence: "nl-parse" },
      { date: "2026-10-06", confidence: "copy" },
      { date: "2026-10-06", confidence: "" },
      // Outside the month.
      { date: "2026-11-01", confidence: "high" },
    ];
    expect(proReportLines({ ...OCTOBER, ...none, meals })).toEqual([
      { kind: "photo_scans", count: 3 },
      { kind: "typed_scans", count: 1 },
    ]);
  });

  it("reads the paces from the first change's start to the last one's end", () => {
    const changes: ProChange[] = [
      { kind: "paces", at: at("2026-10-03"), from: 41.2, to: 42.5 },
      { kind: "paces", at: at("2026-10-24"), from: 42.5, to: 43.1 },
    ];
    expect(proReportLines({ ...OCTOBER, ...none, changes })).toEqual([
      { kind: "paces", from: 41.2, to: 43.1 },
    ]);
  });

  it("skips a stored change it cannot read", () => {
    const changes = [
      { kind: "calories", at: "not a date", from: 1, to: 2 },
      { kind: "weight", at: at("2026-10-03"), from: 1, to: 2 },
      { kind: "paces", at: at("2026-10-03"), from: null, to: Number.NaN },
      null,
    ];
    expect(proReportLines({ ...OCTOBER, ...none, changes })).toEqual([]);
  });

  it("names the race plan Pro is building, last", () => {
    expect(
      proReportLines({
        ...OCTOBER,
        ...none,
        meals: [{ date: "2026-10-02", confidence: "high" }],
        racePlan: { distance: "half", week: 7, totalWeeks: 14 },
      }).map((l) => l.kind)
    ).toEqual(["photo_scans", "race_plan"]);
  });
});

describe("proLineWords", () => {
  it("says the target's moves with their calories", () => {
    expect(
      proLineWords({ kind: "calories", count: 3, from: 2300, to: 2450 })
    ).toEqual({
      value: "3",
      caption: `changes to your calorie target, ${group(2300)} kcal to ${group(2450)} kcal`,
    });
    expect(
      proLineWords({ kind: "calories", count: 2, from: 2300, to: 2300 }).caption
    ).toBe(`changes to your calorie target, back to ${group(2300)} kcal`);
    expect(
      proLineWords({ kind: "calories", count: 1, from: 2300, to: 2400 }).caption
    ).toMatch(/^change to your calorie target/);
  });

  it("says the scans, the paces and the plan", () => {
    expect(proLineWords({ kind: "photo_scans", count: 1 }).caption).toBe(
      "meal scanned from a photo"
    );
    expect(proLineWords({ kind: "typed_scans", count: 4 }).caption).toBe(
      "typed meals read for you"
    );
    expect(proLineWords({ kind: "paces", from: 42, to: 44 })).toEqual({
      value: "44",
      caption: "VDOT for your training paces, up from 42",
    });
    expect(proLineWords({ kind: "paces", from: null, to: 44 }).caption).toBe(
      "VDOT your training paces were set from"
    );
    expect(
      proLineWords({
        kind: "race_plan",
        distance: "marathon",
        week: 5,
        totalWeeks: 16,
      })
    ).toEqual({ value: "5 of 16", caption: "weeks of your marathon plan" });
  });
});

describe("appendProChange", () => {
  const change: ProChange = {
    kind: "calories",
    at: at("2026-10-05"),
    from: 2300,
    to: 2400,
  };

  it("adds to the kept list, dropping what it cannot read", () => {
    expect(appendProChange([null, { kind: "x" }], change)).toEqual([change]);
    expect(appendProChange(undefined, change)).toEqual([change]);
  });

  it("keeps the newest, up to the cap", () => {
    const full = Array.from({ length: PRO_CHANGES_KEPT }, (_, i) => ({
      ...change,
      to: i,
    }));
    const next = appendProChange(full, change);
    expect(next).toHaveLength(PRO_CHANGES_KEPT);
    expect(next[0].to).toBe(1);
    expect(next[next.length - 1]).toEqual(change);
  });
});

describe("proRacePlan — a half or full marathon plan past its free week", () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    mode: "race_prep",
    currentWeek: 6,
    totalWeeks: 14,
    raceGoal: { distance: "half" },
    ...over,
  });

  it("is the plan's week, counted from 1, and its length", () => {
    expect(proRacePlan(plan(), "half")).toEqual({
      distance: "half",
      week: 7,
      totalWeeks: 14,
    });
  });

  it("is null where the plan is free", () => {
    expect(proRacePlan(plan({ currentWeek: 0 }), "half")).toBeNull();
    expect(proRacePlan(plan(), "10k")).toBeNull();
    expect(proRacePlan(plan({ phase: "recovery" }), "half")).toBeNull();
    expect(proRacePlan(plan({ mode: "starter" }), "half")).toBeNull();
    expect(proRacePlan(null, "half")).toBeNull();
  });
});

describe("yearRecapDue — a week before a yearly plan renews", () => {
  const NOW = new Date("2026-11-14T09:00:00Z");
  const renews = new Date(NOW.getTime() + 5 * 86_400_000).toISOString();
  type Due = Parameters<typeof yearRecapDue>[0];
  const yearly = (over: Partial<NonNullable<Due>> = {}): Due => ({
    subscriptionTier: "pro",
    subscriptionExpiresAt: renews,
    subscriptionTrial: null,
    yearRecapShownFor: null,
    revenueCat: {
      entitlementActive: true,
      productId: "com.tropos.app.pro.yearly",
      store: "app_store",
      expiresAt: renews,
      period: "year",
      willRenew: true,
      periodType: "normal",
    },
    ...over,
  });
  const rc = (over: Partial<NonNullable<UserProfile["revenueCat"]>>) =>
    yearly({ revenueCat: { ...yearly()!.revenueCat, ...over } });

  it("is due in the 7 days before a yearly renewal, for the year before it", () => {
    const due = yearRecapDue(yearly(), NOW);
    expect(due).not.toBeNull();
    expect(due!.renewsAt.toISOString()).toBe(renews);
    expect(due!.store).toBe("app_store");
    expect(due!.end > due!.start).toBe(true);
    // A year before the renewal, to the day.
    expect(Number(due!.key.slice(0, 4)) - Number(due!.start.slice(0, 4))).toBe(
      1
    );
    expect(due!.key.slice(5)).toBe(due!.start.slice(5));
  });

  it("is due for a plan bought on the website too", () => {
    expect(yearRecapDue(rc({ store: "rc_billing" }), NOW)?.store).toBe(
      "rc_billing"
    );
  });

  it("is not due outside the week before, or once the day has passed", () => {
    const far = new Date(NOW.getTime() + 9 * 86_400_000).toISOString();
    expect(
      yearRecapDue(yearly({ subscriptionExpiresAt: far }), NOW)
    ).toBeNull();
    const past = new Date(NOW.getTime() - 1000).toISOString();
    expect(
      yearRecapDue(yearly({ subscriptionExpiresAt: past }), NOW)
    ).toBeNull();
  });

  it("is not due for a monthly plan, a plan that will not renew, or a trial", () => {
    expect(yearRecapDue(rc({ period: "month" }), NOW)).toBeNull();
    expect(yearRecapDue(rc({ willRenew: false }), NOW)).toBeNull();
    expect(yearRecapDue(rc({ periodType: "trial" }), NOW)).toBeNull();
    expect(
      yearRecapDue(
        yearly({
          subscriptionTrial: {
            endsAt: renews,
          } as NonNullable<UserProfile["subscriptionTrial"]>,
        }),
        NOW
      )
    ).toBeNull();
  });

  it("is not due where the server has not said it renews yearly", () => {
    // A record synced before Q56 carries no period or renewal.
    expect(
      yearRecapDue(rc({ period: undefined, willRenew: undefined }), NOW)
    ).toBeNull();
    expect(yearRecapDue(yearly({ revenueCat: null }), NOW)).toBeNull();
    expect(yearRecapDue(rc({ entitlementActive: false }), NOW)).toBeNull();
    expect(yearRecapDue(yearly({ subscriptionTier: "free" }), NOW)).toBeNull();
    expect(yearRecapDue(null, NOW)).toBeNull();
  });

  it("shows once a renewal: not again after it was shown for that day", () => {
    const key = yearRecapDue(yearly(), NOW)!.key;
    expect(yearRecapDue(yearly({ yearRecapShownFor: key }), NOW)).toBeNull();
    expect(
      yearRecapDue(yearly({ yearRecapShownFor: "2025-11-19" }), NOW)
    ).not.toBeNull();
  });
});
