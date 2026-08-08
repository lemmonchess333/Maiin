/**
 * Cross-test: the client's "active for me today" predicate must be the SAME
 * predicate the server credits by (ADR-0008 — pin the running copies against
 * each other, not against prose).
 *
 * The seam this closes (probe sweep 2026-08-05, verified HIGH): the client
 * gated "active" and the countdown on the UTC INSTANT while the server
 * credits by LOCAL day-key against UTC day windows. At period boundaries the
 * two disagreed by up to a day in each direction — an NZ user saw "3h left"
 * on a challenge the server had already stopped crediting, and a UTC-11
 * user saw "Ended" on one it was still crediting. The client now derives
 * active/timeLeft from the day-key predicate, and this file pins the two
 * implementations equal on a shared grid of fixtures, plus the boundary
 * journeys in both timezone directions.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  boundaryDayKey,
  isChallengeActiveOnDay,
  challengeLocalEndMs,
  getTimeRemaining,
} from "../useChallenges";
import { parseLocalDate } from "@/lib/dateHelpers";

const require_ = createRequire(import.meta.url);
const { challengeContainsActivityDate } = require_(
  "../../../../functions/lib/challengeActivityWindow"
) as {
  challengeContainsActivityDate: (
    c: { startDate: Date; endDate: Date },
    day: string
  ) => boolean;
};

const JULY = {
  startDate: new Date("2026-07-01T00:00:00Z"),
  endDate: new Date("2026-08-01T00:00:00Z"),
};
const AUGUST = {
  startDate: new Date("2026-08-01T00:00:00Z"),
  endDate: new Date("2026-09-01T00:00:00Z"),
};

describe("client active-day predicate ≡ server crediting predicate", () => {
  it("agrees across a grid of challenges × day keys, including both boundaries", () => {
    const days = [
      "2026-06-30",
      "2026-07-01",
      "2026-07-15",
      "2026-07-31",
      "2026-08-01",
      "2026-08-15",
      "2026-08-31",
      "2026-09-01",
    ];
    for (const c of [JULY, AUGUST]) {
      for (const day of days) {
        expect(
          isChallengeActiveOnDay(c, day),
          `${boundaryDayKey(c.startDate)}..${boundaryDayKey(c.endDate)} @ ${day}`
        ).toBe(challengeContainsActivityDate(c, day));
      }
    }
  });

  it("agrees on degenerate windows (missing/reversed dates) — both fail closed", () => {
    const broken = [
      { startDate: JULY.endDate, endDate: JULY.startDate }, // reversed
      { startDate: JULY.startDate, endDate: JULY.startDate }, // empty
    ];
    for (const c of broken) {
      expect(isChallengeActiveOnDay(c, "2026-07-15")).toBe(false);
      expect(challengeContainsActivityDate(c, "2026-07-15")).toBe(false);
    }
  });
});

describe("the boundary journeys the seam used to break", () => {
  it("UTC-positive: local Aug 1 morning — July no longer promises counting", () => {
    // NZ, Aug 1 09:00 local = Jul 31 21:00 UTC. The user's runs carry
    // date "2026-08-01"; the server refuses them from July and accepts
    // them into August. The client must say the same thing.
    const localToday = "2026-08-01";
    expect(isChallengeActiveOnDay(JULY, localToday)).toBe(false); // no "3h left" lie
    expect(isChallengeActiveOnDay(AUGUST, localToday)).toBe(true); // the early doc is live for them
    expect(challengeContainsActivityDate(JULY, localToday)).toBe(false);
    expect(challengeContainsActivityDate(AUGUST, localToday)).toBe(true);
  });

  it("UTC-negative: local Jul 31 evening — July no longer reads Ended while creditable", () => {
    // UTC-11, Jul 31 20:00 local = Aug 1 07:00 UTC. Their runs carry
    // date "2026-07-31" and still credit July; the card must stay active.
    const localToday = "2026-07-31";
    expect(isChallengeActiveOnDay(JULY, localToday)).toBe(true);
    expect(challengeContainsActivityDate(JULY, localToday)).toBe(true);
    // …and the pre-materialised August doc stays hidden for them.
    expect(isChallengeActiveOnDay(AUGUST, localToday)).toBe(false);
  });

  it("the countdown ends at LOCAL midnight of the end day, not the UTC instant", () => {
    // The end-day key is 2026-08-01; the challenge ends for this device at
    // ITS local midnight of that day — the moment newly logged activity
    // stops crediting. (In CI local == UTC; the derivation is what's
    // pinned: endMs comes from parseLocalDate of the day key, not from the
    // raw timestamp instant.)
    const endMs = challengeLocalEndMs(JULY.endDate)!;
    expect(endMs).toBe(parseLocalDate("2026-08-01").getTime());
    expect(getTimeRemaining(JULY.endDate, endMs - 3 * 3600_000)).toBe(
      "3h left"
    );
    expect(getTimeRemaining(JULY.endDate, endMs)).toBe("Ended");
    expect(getTimeRemaining(JULY.endDate, endMs - 5 * 86400_000)).toBe(
      "5 days left"
    );
  });
});
