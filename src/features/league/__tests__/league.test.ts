/**
 * The league in the app (Soc15 call 3): the card's four states from what
 * the server wrote, the lines it says them in, and the week's end where
 * the person is. Every date comes from the clock.
 */
import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import {
  countdownLine,
  endsLine,
  leagueResultsAt,
  leagueCardState,
  leagueWeekEnd,
  lockedLine,
  parseMembership,
  parseResult,
  parseStanding,
  parseStatus,
  pointsLine,
  resultTitle,
  sessionsLine,
  weekOfLine,
  type LeagueStanding,
} from "../league";
import { ordinal } from "../leagueRules";
import { RESULT_REVEAL_DAYS, resultStillToReveal } from "../useLeagueResult";

const WEEK = localWeekKey(new Date());
const day = (i: number) => addLocalDays(parseLocalDate(WEEK), i);

const row = (uid: string, points: number, i = 0): LeagueStanding => ({
  uid,
  name: uid,
  tier: "gold",
  points,
  done: 1,
  planned: 3,
  reachedAt: Date.now() + i,
});

describe("the card's state", () => {
  const status = { joined: 3, needed: 10, open: false, weekKey: null };

  it("not joined: what joining shows, and the figure when the league waits", () => {
    expect(
      leagueCardState({
        uid: "me",
        optedIn: false,
        status,
        member: null,
        standings: [],
      })
    ).toEqual({ kind: "notJoined", joined: 3, needed: 10, open: false });
    expect(
      leagueCardState({
        uid: "me",
        optedIn: false,
        status: null,
        member: null,
        standings: [],
      })
    ).toMatchObject({ kind: "notJoined", joined: null });
  });

  it("locked: joined, and too few people for groups", () => {
    expect(
      leagueCardState({
        uid: "me",
        optedIn: true,
        status,
        member: { tier: "bronze", groupId: null, weekKey: null },
        standings: [],
      })
    ).toEqual({ kind: "locked", joined: 3, needed: 10 });
  });

  it("waiting: joined, the league is open, and the next groups come on Monday", () => {
    expect(
      leagueCardState({
        uid: "me",
        optedIn: true,
        status: { ...status, joined: 40, open: true, weekKey: WEEK },
        member: { tier: "silver", groupId: null, weekKey: null },
        standings: [],
      })
    ).toEqual({ kind: "waiting", tier: "silver" });
  });

  it("in a group: their place among everyone, by the server's order", () => {
    const state = leagueCardState({
      uid: "me",
      optedIn: true,
      status: { ...status, open: true, weekKey: WEEK },
      member: { tier: "gold", groupId: "g", weekKey: WEEK },
      standings: [
        row("a", 100),
        row("me", 67, 5),
        row("b", 67, 1),
        row("c", 0),
      ],
    });
    expect(state).toMatchObject({
      kind: "inGroup",
      tier: "gold",
      weekKey: WEEK,
      me: { uid: "me", rank: 3, points: 67 },
    });
    expect(state.kind === "inGroup" && state.ranked).toHaveLength(4);
  });

  it("a group they are no longer listed in reads as waiting, not as a place", () => {
    expect(
      leagueCardState({
        uid: "me",
        optedIn: true,
        status: { ...status, open: true, weekKey: WEEK },
        member: { tier: "gold", groupId: "g", weekKey: WEEK },
        standings: [row("a", 100)],
      }).kind
    ).toBe("waiting");
  });
});

describe("the words", () => {
  it("say how far the league is from opening, then when it opens", () => {
    expect(lockedLine(3, 10)).toBe(
      "Leagues open when 10 people have joined. 3 so far."
    );
    expect(lockedLine(12, 10)).toBe(
      "Leagues start on Monday. 12 people have joined."
    );
  });

  it("count sessions and points, one and many", () => {
    expect(sessionsLine(3, 4)).toBe("3 of 4 sessions");
    expect(sessionsLine(0, 1)).toBe("0 of 1 session");
    expect(pointsLine(75)).toBe("75 points");
    expect(pointsLine(1)).toBe("1 point");
  });

  it("place a member: 1st, 2nd, 3rd, 4th, 11th to 13th, 21st", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 18, 21, 22, 23].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "18th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });

  it("tell a result as the Monday notification does", () => {
    expect(resultTitle({ outcome: "up", newTier: "silver" })).toBe(
      "You moved up to Silver"
    );
    expect(resultTitle({ outcome: "stay", newTier: "gold" })).toBe(
      "You stayed in Gold"
    );
    expect(resultTitle({ outcome: "down", newTier: "bronze" })).toBe(
      "You moved down to Bronze"
    );
  });

  it("name the week by its Monday, day before month", () => {
    expect(weekOfLine(WEEK)).toMatch(/^Week of \d{1,2} [A-Z][a-z]+$/);
  });
});

describe("the week's end, where the person is", () => {
  it("is the local midnight that starts the next Monday", () => {
    const end = leagueWeekEnd(WEEK);
    expect(localDateString(end)).toBe(localDateString(day(7)));
    expect(end.getHours()).toBe(0);
  });

  it("the card says Sunday, and tonight on the day", () => {
    const wednesday = day(2);
    wednesday.setHours(12);
    expect(endsLine(WEEK, wednesday)).toBe("Ends Sunday");
    const sunday = day(6);
    sunday.setHours(8);
    expect(endsLine(WEEK, sunday)).toBe("Ends tonight");
  });

  it("the card says the week is over once it has ended, until the results", () => {
    // The membership still names last week until Monday's turn settles it.
    const monday = day(7);
    monday.setHours(9);
    expect(endsLine(WEEK, monday)).toBe("Week over");
    expect(endsLine(WEEK, leagueWeekEnd(WEEK))).toBe("Week over");
  });

  it("the results come on the Monday after, at 12:15 UTC, said where the person is", () => {
    expect(leagueResultsAt(WEEK).toISOString()).toBe(
      `${localDateString(day(7))}T12:15:00.000Z`
    );
    const justOver = new Date(leagueWeekEnd(WEEK).getTime() + 1000);
    // West of UTC+11:45 that is later on the person's Monday; east of it,
    // as in Auckland's summer or Kiritimati, it is their Tuesday.
    const tuesday = localDateString(day(8));
    expect(countdownLine(WEEK, justOver)).toBe(
      localDateString(leagueResultsAt(WEEK)) === tuesday
        ? "Week over. Results tomorrow."
        : "Week over. Results later today."
    );
  });

  it("the page counts down in days and hours, then hours and minutes", () => {
    const end = leagueWeekEnd(WEEK).getTime();
    const before = (ms: number) => new Date(end - ms);
    const H = 3_600_000;
    expect(countdownLine(WEEK, before(2 * 24 * H + 4 * H + 60_000))).toBe(
      "Ends in 2 days 4 h"
    );
    expect(countdownLine(WEEK, before(24 * H + 30 * 60_000))).toBe(
      "Ends in 1 day 0 h"
    );
    expect(countdownLine(WEEK, before(5 * H + 12 * 60_000 + 1))).toBe(
      "Ends in 5 h 12 min"
    );
    expect(countdownLine(WEEK, before(9 * 60_000 + 1))).toBe("Ends in 9 min");
    expect(countdownLine(WEEK, before(20_000))).toBe("Ends in 1 min");
    expect(countdownLine(WEEK, new Date(end + 1000))).toMatch(
      /^Week over\. Results (later today|tomorrow)\.$/
    );
  });
});

describe("reading what the server wrote", () => {
  it("keeps only sound values", () => {
    expect(parseStatus({ joined: -3, open: "yes" })).toEqual({
      joined: 0,
      needed: 10,
      open: false,
      weekKey: null,
    });
    expect(parseMembership({ tier: "wood", groupId: "" })).toEqual({
      tier: "bronze",
      groupId: null,
      weekKey: null,
    });
    expect(
      parseStanding("u1", { name: "  ", points: 40.6, photo: "" })
    ).toEqual({
      uid: "u1",
      name: null,
      tier: "bronze",
      points: 40,
      done: 0,
      planned: 0,
      reachedAt: undefined,
    });
  });

  it("drops a result it cannot tell", () => {
    expect(
      parseResult(WEEK, { outcome: "sideways", newTier: "gold" })
    ).toBeNull();
    expect(parseResult(WEEK, { outcome: "up", newTier: "mithril" })).toBeNull();
    expect(
      parseResult(WEEK, {
        outcome: "up",
        tier: "bronze",
        newTier: "silver",
        rank: 2,
        of: 14,
        points: 100,
      })
    ).toEqual({
      weekKey: WEEK,
      tier: "bronze",
      newTier: "silver",
      rank: 2,
      of: 14,
      points: 100,
      outcome: "up",
    });
  });
});

describe("which result is still to reveal", () => {
  const lastWeek = localDateString(day(-7));
  const result = {
    weekKey: lastWeek,
    tier: "bronze" as const,
    newTier: "silver" as const,
    rank: 1,
    of: 12,
    points: 100,
    outcome: "up" as const,
  };
  const today = localDateString(new Date());

  it("last week's, once per device", () => {
    expect(resultStillToReveal(result, [], today)).toBe(true);
    expect(resultStillToReveal(result, [lastWeek], today)).toBe(false);
  });

  it("not once the week after it is over", () => {
    const late = localDateString(
      addLocalDays(parseLocalDate(lastWeek), RESULT_REVEAL_DAYS)
    );
    expect(resultStillToReveal(result, [], late)).toBe(false);
  });
});
