import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const budget = require("../lib/pushBudget");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");

const UID = "u1";
const DOC = `users/${UID}/settings/pushBudget`;

describe("the push budget (App1 Q60)", () => {
  it("is one a day and five in any seven local days", () => {
    expect(budget.DAILY_PUSH_LIMIT).toBe(1);
    expect(budget.WEEKLY_PUSH_LIMIT).toBe(5);
    expect(budget.budgetDayKeys("2026-03-02")).toEqual([
      "2026-03-02",
      "2026-03-01",
      "2026-02-28",
      "2026-02-27",
      "2026-02-26",
      "2026-02-25",
      "2026-02-24",
    ]);
  });

  it("refuses a second push the same day, and a sixth in seven days", () => {
    const sent = (days) => ({
      sent: days.map((day) => ({ day, kind: "badge", id: day })),
    });
    expect(budget.budgetUse({}, "2026-11-14").allowed).toBe(true);
    expect(budget.budgetUse(sent(["2026-11-14"]), "2026-11-14")).toEqual({
      today: 1,
      week: 1,
      allowed: false,
    });
    const five = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];
    expect(budget.budgetUse(sent(five), "2026-11-14").allowed).toBe(true);
    expect(
      budget.budgetUse(sent([...five, "2026-11-13"]), "2026-11-14").allowed
    ).toBe(false);
    // The oldest falls out of the seven days the next day.
    expect(
      budget.budgetUse(sent([...five, "2026-11-13"]), "2026-11-16").allowed
    ).toBe(true);
  });

  it("reads a missing or broken document as nothing sent", () => {
    for (const state of [null, undefined, { sent: "x" }, { sent: [null, 3] }])
      expect(budget.budgetUse(state, "2026-11-14").allowed).toBe(true);
    expect(budget.budgetUse({}, "not a day").allowed).toBe(false);
  });

  it("puts the push that protects first, and the badge last", () => {
    expect(budget.PUSH_PRIORITY).toEqual([
      "streak",
      "recap",
      "challengeReminders",
      "challenges",
      "badge",
    ]);
    // An evening reminder still to come holds the review and the badge.
    expect(budget.yieldsTo("recap", ["streak"])).toBe(true);
    expect(budget.yieldsTo("badge", ["streak"])).toBe(true);
    expect(budget.yieldsTo("challenges", ["recap"])).toBe(true);
    // Nothing holds the evening reminder, and a lower push holds nothing.
    expect(budget.yieldsTo("streak", ["recap", "badge"])).toBe(false);
    expect(budget.yieldsTo("recap", ["badge", "challenges"])).toBe(false);
    expect(budget.yieldsTo("recap", [])).toBe(false);
  });

  it("claims the day once: the next sender finds it taken", async () => {
    // One transaction each (Firestore retries the loser of a race; this
    // fake runs them one after another).
    const db = memoryFirestore();
    const claims = [];
    for (const kind of ["streak", "badge", "challenges"])
      claims.push(
        await budget.claimPushBudget(db, UID, { kind, dayKey: "2026-11-14" })
      );
    expect(claims[0]).not.toBeNull();
    expect(claims.slice(1)).toEqual([null, null]);
    const stored = await db.doc(DOC).get();
    expect(stored.data().sent).toHaveLength(1);
  });

  it("keeps only the last seven days, and gives a failed push back", async () => {
    const db = memoryFirestore({
      [DOC]: {
        sent: [
          { day: "2026-11-01", kind: "badge", id: "old" },
          { day: "2026-11-12", kind: "streak", id: "recent" },
        ],
      },
    });
    const claim = await budget.claimPushBudget(db, UID, {
      kind: "recap",
      dayKey: "2026-11-14",
    });
    expect(claim).toMatch(/^[a-f0-9]{16}$/);
    expect((await db.doc(DOC).get()).data().sent).toEqual([
      { day: "2026-11-12", kind: "streak", id: "recent" },
      { day: "2026-11-14", kind: "recap", id: claim },
    ]);
    await budget.releasePushBudget(db, UID, claim);
    expect((await db.doc(DOC).get()).data().sent).toEqual([
      { day: "2026-11-12", kind: "streak", id: "recent" },
    ]);
    expect(
      await budget.claimPushBudget(db, UID, {
        kind: "badge",
        dayKey: "2026-11-14",
      })
    ).not.toBeNull();
  });
});
