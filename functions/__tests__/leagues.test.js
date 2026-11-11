/**
 * Weekly leagues, reading and writing (Soc15 call 3): a standing scored
 * against the member's own plan and kept by the session triggers, joining
 * and leaving, the Monday turn (settle, form, the figure) run twice, and
 * what account deletion takes. Against an in-memory Firestore with real
 * paths, queries and transactions.
 *
 * Every date comes from the clock: the week is the one holding today, and
 * the turn runs at that week's Monday 12:15 UTC, so the +90-day and
 * timezone runs read the same shapes.
 */
import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const leagues = require("../lib/leagues");
const rules = require("../lib/leagueRules");
const { currentWeek } = require("../lib/friendsBoard");

const DAY = 86400000;
const NOW = Date.now();
/** This week's Monday in UTC, and a day of it. */
const WEEK = currentWeek(null, NOW).weekKey;
const dayOf = (key, i) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10);
const day = (i) => dayOf(WEEK, i);
const LAST_WEEK = dayOf(WEEK, -7);
/** The turn: this week's Monday, 12:15 UTC. */
const TURN = Date.parse(`${WEEK}T12:15:00Z`);

/** Three lift days (Mon, Wed, Fri) and nothing else. */
const THREE_LIFTS = Array.from({ length: 7 }, (_, d) => ({
  day: d,
  type: [1, 3, 5].includes(d) ? "lift" : "rest",
}));
const REST_WEEK = Array.from({ length: 7 }, (_, d) => ({
  day: d,
  type: "rest",
}));

const lift = (date) => ({
  date,
  exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }],
  totalVolume: 500,
});
const run = (date, extra = {}) => ({
  date,
  distance: 5000,
  duration: 1500,
  ...extra,
});

describe("a standing's figures", () => {
  const figures = (over) =>
    leagues.standingFigures({
      profile: { weekSchedule: THREE_LIFTS },
      programState: null,
      workouts: [],
      runs: [],
      weekKey: WEEK,
      stored: null,
      weekIsCurrent: true,
      now: NOW,
      ...over,
    });

  it("scores sessions done against the plan, and stops at the plan", () => {
    expect(figures({ workouts: [lift(day(0)), lift(day(2))] })).toMatchObject({
      done: 2,
      planned: 3,
      points: 67,
    });
    expect(
      figures({
        workouts: [0, 1, 2, 3, 4].map((i) => lift(day(i))),
      })
    ).toMatchObject({ done: 5, planned: 3, points: 100 });
  });

  it("counts the runs the challenges would credit, as the friends board does", () => {
    expect(
      figures({
        runs: [run(day(1)), run(day(2), { savedAnyway: true })],
      })
    ).toMatchObject({ done: 1 });
  });

  it("adds the plan's run days, counted as the app counts them", () => {
    expect(
      figures({
        programState: {
          runDays: [
            { id: "r1", date: day(1), templateId: "easy" },
            { id: "r2", date: day(4), templateId: "long" },
            { id: "r3", date: day(9), templateId: "easy" }, // next week
          ],
        },
      })
    ).toMatchObject({ planned: 5 });
  });

  it("a free runner is scored against their weekly run target", () => {
    expect(
      figures({
        profile: { weekSchedule: REST_WEEK, weeklyRunDaysTarget: 4 },
        runs: [run(day(0)), run(day(2))],
      })
    ).toMatchObject({ done: 2, planned: 4, points: 50 });
    // The older field, read only when the newer one is absent.
    expect(
      figures({ profile: { weekSchedule: REST_WEEK, weeklyRunsTarget: 2 } })
    ).toMatchObject({ planned: 2 });
  });

  it("a week that plans nothing is scored out of 3", () => {
    expect(
      figures({
        profile: { weekSchedule: REST_WEEK, weeklyRunDaysTarget: 0 },
        workouts: [lift(day(0))],
      })
    ).toMatchObject({ planned: 3, points: 33 });
  });

  it("an account that began mid-week is scored from its first day", () => {
    // Began on Thursday: of Mon, Wed and Fri, Friday is left.
    const createdAt = { toMillis: () => Date.parse(`${day(3)}T09:00:00Z`) };
    expect(
      figures({ profile: { weekSchedule: THREE_LIFTS, createdAt } })
    ).toMatchObject({ planned: 1 });
  });

  it("keeps the time the points were reached while they hold, and moves it when they change", () => {
    const reachedAt = new Date(NOW - 5 * DAY);
    const stored = { done: 2, planned: 3, points: 67, reachedAt };
    expect(
      figures({ workouts: [lift(day(0)), lift(day(2))], stored }).reachedAt
    ).toBe(reachedAt);
    const moved = figures({
      workouts: [lift(day(0)), lift(day(2)), lift(day(4))],
      stored,
      now: NOW + 1000,
    });
    expect(moved.points).toBe(100);
    expect(moved.reachedAt).toEqual(new Date(NOW + 1000));
  });

  it("once the week is over, the plan's figure stands: its run days have rolled on", () => {
    const stored = {
      done: 1,
      planned: 5,
      points: 20,
      reachedAt: new Date(NOW),
    };
    expect(
      figures({
        programState: { runDays: [] },
        workouts: [lift(day(0)), lift(day(1))],
        stored,
        weekIsCurrent: false,
      })
    ).toMatchObject({ done: 2, planned: 5, points: 40 });
  });
});

describe("the first name a standing shows", () => {
  it("is the first word of the public name, never a name the filter refuses", () => {
    expect(leagues.leagueFirstName("  Maya   Chen ")).toBe("Maya");
    expect(leagues.leagueFirstName("shit head")).toBeNull();
    expect(leagues.leagueFirstName(null)).toBeNull();
    expect(
      leagues.standingIdentity({
        displayName: "Sam Lee",
        photoURL: "https://example.com/x.gif",
      })
    ).toEqual({ name: "Sam" });
  });
});

/** Alice in this week's group with Bob, sessions saved this week. */
function inAGroup(extra = {}) {
  return memoryFirestore({
    "users/alice": {
      leagueOptIn: true,
      weekSchedule: THREE_LIFTS,
      lastActiveAt: new Date(NOW - DAY),
    },
    "users/alice/workouts/w1": lift(day(0)),
    "leagueMembers/alice": {
      uid: "alice",
      tier: "silver",
      groupId: "g1",
      weekKey: WEEK,
    },
    "leagueGroups/g1": {
      weekKey: WEEK,
      tier: "silver",
      memberUids: ["alice", "bob"],
      size: 2,
    },
    "leagueGroups/g1/standings/alice": {
      uid: "alice",
      name: "Alice",
      tier: "silver",
      done: 0,
      planned: 3,
      points: 0,
      reachedAt: new Date(NOW - 3 * DAY),
    },
    "leagueGroups/g1/standings/bob": { uid: "bob", name: "Bob", points: 33 },
    ...extra,
  });
}

const standing = (firestore, uid = "alice") =>
  firestore.data.get(`leagueGroups/g1/standings/${uid}`);

describe("refreshLeagueStanding (the session triggers)", () => {
  it("recomputes the member's standing from the week's sessions", async () => {
    const firestore = inAGroup({ "users/alice/runs/r1": run(day(1)) });
    const out = await leagues.refreshLeagueStanding(
      firestore,
      "alice",
      [day(1)],
      {
        now: NOW,
      }
    );
    expect(out.written).toBe(true);
    expect(standing(firestore)).toMatchObject({
      uid: "alice",
      name: "Alice",
      done: 2,
      planned: 3,
      points: 67,
    });
  });

  it("a deleted session takes its credit back off", async () => {
    const firestore = inAGroup();
    await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
      now: NOW,
    });
    expect(standing(firestore).done).toBe(1);
    firestore.data.delete("users/alice/workouts/w1");
    await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
      now: NOW,
    });
    expect(standing(firestore)).toMatchObject({ done: 0, points: 0 });
  });

  it("writes nothing for a session from another week", async () => {
    const firestore = inAGroup({ "users/alice/workouts/old": lift(LAST_WEEK) });
    const out = await leagues.refreshLeagueStanding(
      firestore,
      "alice",
      [LAST_WEEK],
      { now: NOW }
    );
    expect(out.written).toBe(false);
    expect(standing(firestore).done).toBe(0);
  });

  it("writes nothing for someone in no group, or in none this week", async () => {
    const firestore = inAGroup();
    firestore.data.set("leagueMembers/alice", {
      uid: "alice",
      tier: "silver",
      groupId: null,
      weekKey: null,
    });
    expect(
      (
        await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
          now: NOW,
        })
      ).written
    ).toBe(false);
    expect(
      (
        await leagues.refreshLeagueStanding(firestore, "carol", [day(0)], {
          now: NOW,
        })
      ).written
    ).toBe(false);
  });

  it("writes nothing once the person has left the group or the league", async () => {
    const left = inAGroup();
    left.data.set("leagueGroups/g1", {
      weekKey: WEEK,
      memberUids: ["bob"],
      size: 1,
    });
    await leagues.refreshLeagueStanding(left, "alice", [day(0)], { now: NOW });
    expect(standing(left).done).toBe(0);

    const out = inAGroup();
    out.data.set("users/alice", { leagueOptIn: false });
    await leagues.refreshLeagueStanding(out, "alice", [day(0)], { now: NOW });
    expect(standing(out).done).toBe(0);
  });

  it("writes nothing for an account being deleted", async () => {
    const firestore = inAGroup({
      "accountDeletionRequests/alice": { status: "running" },
    });
    await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
      now: NOW,
    });
    expect(standing(firestore).done).toBe(0);
  });

  it("a recompute of the same facts writes nothing", async () => {
    const firestore = inAGroup();
    await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
      now: NOW,
    });
    const writes = firestore.operations.length;
    const again = await leagues.refreshLeagueStanding(
      firestore,
      "alice",
      [day(0)],
      { now: NOW + 1000 }
    );
    expect(again.written).toBe(false);
    expect(firestore.operations.length).toBe(writes);
  });
});

describe("setLeagueSharing", () => {
  it("joining stores the answer and a Bronze membership with no group yet", async () => {
    const firestore = memoryFirestore({
      "users/alice": { lastActiveAt: new Date(NOW - DAY) },
    });
    const out = await leagues.setLeagueSharing(firestore, "alice", true, {
      now: NOW,
    });
    expect(firestore.data.get("users/alice").leagueOptIn).toBe(true);
    expect(firestore.data.get("leagueMembers/alice")).toMatchObject({
      uid: "alice",
      tier: "bronze",
      groupId: null,
      weekKey: null,
    });
    // The figure the locked card reads.
    expect(out.joined).toBe(1);
    expect(firestore.data.get("leagueStatus/current")).toMatchObject({
      joined: 1,
      needed: 10,
    });
  });

  it("the figure counts only people who trained in the last 14 days", async () => {
    const firestore = memoryFirestore({
      "users/a": { leagueOptIn: true, lastActiveAt: new Date(NOW - 3 * DAY) },
      "users/b": { leagueOptIn: true, lastActiveAt: new Date(NOW - 20 * DAY) },
      "users/c": { lastActiveAt: new Date(NOW - DAY) },
    });
    await leagues.setLeagueSharing(firestore, "c", true, { now: NOW });
    expect(firestore.data.get("leagueStatus/current").joined).toBe(2);
  });

  it("joining again keeps the tier already earned", async () => {
    const firestore = inAGroup();
    await leagues.setLeagueSharing(firestore, "alice", true, { now: NOW });
    expect(firestore.data.get("leagueMembers/alice")).toMatchObject({
      tier: "silver",
      groupId: "g1",
    });
  });

  it("leaving deletes the standing and takes them out of the group at once", async () => {
    const firestore = inAGroup();
    await leagues.setLeagueSharing(firestore, "alice", false, { now: NOW });
    expect(firestore.data.get("users/alice").leagueOptIn).toBe(false);
    expect(firestore.data.has("leagueMembers/alice")).toBe(false);
    expect(firestore.data.has("leagueGroups/g1/standings/alice")).toBe(false);
    expect(firestore.data.get("leagueGroups/g1")).toMatchObject({
      memberUids: ["bob"],
      size: 1,
    });
    expect(standing(firestore, "bob")).toBeTruthy();
    // And a later session writes nothing.
    await leagues.refreshLeagueStanding(firestore, "alice", [day(0)], {
      now: NOW,
    });
    expect(firestore.data.has("leagueGroups/g1/standings/alice")).toBe(false);
  });
});

/* ── The turn ─────────────────────────────────────────────────────── */

/** `n` people who joined and trained this fortnight, in `tier`. */
function joiners(n, tier = "bronze", prefix = tier) {
  const seed = {};
  for (let i = 0; i < n; i++) {
    const uid = `${prefix}${String(i).padStart(2, "0")}`;
    seed[`users/${uid}`] = {
      leagueOptIn: true,
      weekSchedule: THREE_LIFTS,
      lastActiveAt: new Date(TURN - 2 * DAY),
    };
    seed[`users/${uid}/public/profile`] = { displayName: `${uid} Surname` };
    seed[`leagueMembers/${uid}`] = { uid, tier, groupId: null, weekKey: null };
  }
  return seed;
}

const turn = (firestore, extra = {}) =>
  leagues.runLeagueTurn(firestore, {
    now: TURN,
    rng: rules.seededRng(42),
    ...extra,
  });

const groupsOf = (firestore, weekKey) =>
  [...firestore.data.entries()].filter(
    ([path, d]) => /^leagueGroups\/[^/]+$/.test(path) && d.weekKey === weekKey
  );

describe("the turn: forming the week's groups", () => {
  it("forms nothing from fewer than 10 people, and says how many have joined", async () => {
    const firestore = memoryFirestore(joiners(7));
    const summary = await turn(firestore);
    expect(summary.formed).toMatchObject({ groups: 0, placed: 0, joined: 7 });
    expect(groupsOf(firestore, WEEK)).toHaveLength(0);
    expect(firestore.data.get("leagueStatus/current")).toMatchObject({
      joined: 7,
      needed: 10,
      open: false,
      weekKey: null,
    });
  });

  it("places everyone who joined and trained, with a standing that counts what they did before the group existed", async () => {
    const firestore = memoryFirestore({
      ...joiners(25),
      // A session from this morning, before 12:15 UTC.
      "users/bronze03/workouts/w1": lift(WEEK),
    });
    const summary = await turn(firestore);
    expect(summary.formed).toMatchObject({ groups: 2, placed: 25 });
    const groups = groupsOf(firestore, WEEK);
    expect(groups.map(([, g]) => g.size).sort()).toEqual([12, 13]);
    const member = firestore.data.get("leagueMembers/bronze03");
    expect(member).toMatchObject({ tier: "bronze", weekKey: WEEK });
    expect(
      firestore.data.get(`leagueGroups/${member.groupId}/standings/bronze03`)
    ).toMatchObject({
      uid: "bronze03",
      name: "bronze03",
      tier: "bronze",
      done: 1,
      planned: 3,
      points: 33,
    });
    expect(firestore.data.get("leagueStatus/current")).toMatchObject({
      joined: 25,
      open: true,
      weekKey: WEEK,
    });
  });

  it("leaves out anyone who has not trained in 14 days, is restricted or kept out of discovery", async () => {
    const firestore = memoryFirestore({
      ...joiners(12),
      ...joiners(1, "bronze", "idle"),
      ...joiners(1, "bronze", "banned"),
      ...joiners(1, "bronze", "review"),
      "globalRestrictedUids/banned00": { at: 1 },
    });
    firestore.data.set("users/idle00", {
      leagueOptIn: true,
      lastActiveAt: new Date(TURN - 15 * DAY),
    });
    const summary = await turn(firestore, {
      isHidden: (uid) => uid === "review00",
    });
    expect(summary.formed.placed).toBe(12);
    for (const uid of ["idle00", "banned00", "review00"]) {
      expect(
        firestore.data.get(`leagueMembers/${uid}`).groupId,
        uid
      ).toBeNull();
    }
  });

  it("an account being deleted, or one that left after the draw, is taken out of its group", async () => {
    const firestore = memoryFirestore({
      ...joiners(12),
      "accountDeletionRequests/bronze05": { status: "running" },
    });
    await turn(firestore);
    const [[, group]] = groupsOf(firestore, WEEK);
    expect(group.memberUids).not.toContain("bronze05");
    expect(group.size).toBe(11);
  });

  it("never draws a blocked pair into one group", async () => {
    const firestore = memoryFirestore({
      ...joiners(24),
      "blocks/bronze01/users/bronze02": { blockedAt: 1 },
      // Only the server's copy of this one.
      "blockedBy/bronze03/users/bronze04": {},
    });
    await turn(firestore);
    for (const [, g] of groupsOf(firestore, WEEK)) {
      const has = (u) => g.memberUids.includes(u);
      expect(has("bronze01") && has("bronze02")).toBe(false);
      expect(has("bronze03") && has("bronze04")).toBe(false);
    }
  });
});

/** Last week's group of `n` gold members, ranked m00 first, with the
 *  sessions behind each standing saved. */
function lastWeeksGroup(n) {
  const seed = {};
  const uids = [];
  for (let i = 0; i < n; i++) {
    const uid = `m${String(i).padStart(2, "0")}`;
    uids.push(uid);
    // Planned 3: three, two, one or no lifts done, falling down the group.
    const done = Math.max(0, 3 - Math.floor((i * 4) / n));
    seed[`users/${uid}`] = {
      leagueOptIn: true,
      weekSchedule: THREE_LIFTS,
      lastActiveAt: new Date(TURN - 3 * DAY),
    };
    for (let s = 0; s < done; s++)
      seed[`users/${uid}/workouts/w${s}`] = lift(dayOf(LAST_WEEK, s));
    seed[`leagueMembers/${uid}`] = {
      uid,
      tier: "gold",
      groupId: "last-001",
      weekKey: LAST_WEEK,
    };
    seed[`leagueGroups/last-001/standings/${uid}`] = {
      uid,
      name: uid,
      tier: "gold",
      done,
      planned: 3,
      points: rules.leaguePoints(done, 3),
      reachedAt: new Date(TURN - 2 * DAY + i * 1000),
    };
  }
  seed["leagueGroups/last-001"] = {
    weekKey: LAST_WEEK,
    tier: "gold",
    memberUids: uids,
    size: n,
  };
  return seed;
}

describe("the turn: settling last week", () => {
  it("writes each member's result and new tier, tells them once, and clears the group", async () => {
    const firestore = memoryFirestore(lastWeeksGroup(12));
    const notify = vi.fn();
    const summary = await turn(firestore, { notify });
    expect(summary.settled).toEqual({ groups: 1, results: 12 });
    expect(
      firestore.data.get(`users/m00/leagueResults/${LAST_WEEK}`)
    ).toMatchObject({
      weekKey: LAST_WEEK,
      tier: "gold",
      newTier: "platinum",
      rank: 1,
      of: 12,
      points: 100,
      outcome: "up",
    });
    expect(
      firestore.data.get(`users/m11/leagueResults/${LAST_WEEK}`)
    ).toMatchObject({
      newTier: "silver",
      rank: 12,
      points: 0,
      outcome: "down",
    });
    expect(
      firestore.data.get("users/m05/leagueResults/" + LAST_WEEK).outcome
    ).toBe("stay");
    // The new tier is the one this week's group is drawn from.
    expect(firestore.data.get("leagueMembers/m00").tier).toBe("platinum");
    expect(notify).toHaveBeenCalledTimes(12);
    expect(notify).toHaveBeenCalledWith(
      "m00",
      expect.objectContaining({
        outcome: "up",
        newTier: "platinum",
        weekKey: LAST_WEEK,
      })
    );
    expect(firestore.data.has("leagueGroups/last-001")).toBe(false);
    expect(firestore.data.has("leagueGroups/last-001/standings/m00")).toBe(
      false
    );
  });

  it("recomputes each week from its sessions before ranking it", async () => {
    const seed = lastWeeksGroup(10);
    // m09's standing says nothing done, but a run reached the server late.
    seed["users/m09/runs/late"] = run(dayOf(LAST_WEEK, 6));
    const firestore = memoryFirestore(seed);
    await turn(firestore);
    expect(
      firestore.data.get(`users/m09/leagueResults/${LAST_WEEK}`)
    ).toMatchObject({
      points: 33,
    });
  });

  it("settles a group an earlier turn left standing, in its own week", async () => {
    // A turn cut off part way leaves a group behind; the next turn's week
    // is a later one, and settling only that week would strand it.
    const TWO_WEEKS = dayOf(WEEK, -14);
    const seed = lastWeeksGroup(10);
    for (const key of Object.keys(seed)) {
      if (key.startsWith("leagueMembers/") || key === "leagueGroups/last-001")
        seed[key] = { ...seed[key], weekKey: TWO_WEEKS };
      const workout = /^users\/[^/]+\/workouts\/w(\d+)$/.exec(key);
      if (workout)
        seed[key] = {
          ...seed[key],
          date: dayOf(TWO_WEEKS, Number(workout[1])),
        };
    }
    const firestore = memoryFirestore(seed);
    const notify = vi.fn();
    const summary = await turn(firestore, { notify });
    expect(summary.settled).toEqual({ groups: 1, results: 10 });
    expect(
      firestore.data.get(`users/m00/leagueResults/${TWO_WEEKS}`)
    ).toMatchObject({ weekKey: TWO_WEEKS, points: 100, outcome: "up" });
    expect(firestore.data.has(`users/m00/leagueResults/${LAST_WEEK}`)).toBe(
      false
    );
    expect(notify).toHaveBeenCalledWith(
      "m00",
      expect.objectContaining({ weekKey: TWO_WEEKS })
    );
    expect(firestore.data.has("leagueGroups/last-001")).toBe(false);
  });

  it("a member who left before Monday gets no result", async () => {
    const firestore = memoryFirestore(lastWeeksGroup(10));
    await leagues.setLeagueSharing(firestore, "m03", false, {
      now: TURN - DAY,
    });
    await turn(firestore);
    expect(firestore.data.has(`users/m03/leagueResults/${LAST_WEEK}`)).toBe(
      false
    );
    expect(firestore.data.get(`users/m00/leagueResults/${LAST_WEEK}`).of).toBe(
      9
    );
  });
});

describe("the turn, run twice", () => {
  it("does nothing twice", async () => {
    const firestore = memoryFirestore({
      ...lastWeeksGroup(12),
      ...joiners(14),
    });
    const notify = vi.fn();
    await turn(firestore, { notify });
    const results = firestore.data.get(`users/m00/leagueResults/${LAST_WEEK}`);
    const groups = groupsOf(firestore, WEEK).map(([path, g]) => [
      path,
      g.memberUids,
    ]);
    const members = firestore.data.get("leagueMembers/bronze00");

    const again = await turn(firestore, { notify, rng: rules.seededRng(7) });
    expect(notify).toHaveBeenCalledTimes(12);
    expect(firestore.data.get(`users/m00/leagueResults/${LAST_WEEK}`)).toEqual(
      results
    );
    expect(
      groupsOf(firestore, WEEK).map(([path, g]) => [path, g.memberUids])
    ).toEqual(groups);
    expect(firestore.data.get("leagueMembers/bronze00")).toEqual(members);
    // The second run reports the first's work, from the week's markers.
    expect(again.formed).toMatchObject({ groups: groups.length });
    // m00 was promoted once, not twice.
    expect(firestore.data.get("leagueMembers/m00").tier).toBe("platinum");
  });

  it("a run that stopped while placing people finishes the same draw", async () => {
    const firestore = memoryFirestore(joiners(12));
    // The first run fails part way through placing.
    firestore.failures.set(
      "set:leagueMembers/bronze07",
      new Error("deadline exceeded")
    );
    await expect(turn(firestore)).rejects.toThrow("deadline exceeded");
    const drawn = groupsOf(firestore, WEEK).map(([, g]) => g.memberUids);
    expect(drawn).toHaveLength(1);

    firestore.failures.clear();
    await turn(firestore, { rng: rules.seededRng(99) });
    expect(groupsOf(firestore, WEEK).map(([, g]) => g.memberUids)).toEqual(
      drawn
    );
    expect(firestore.data.get("leagueMembers/bronze07").weekKey).toBe(WEEK);
    expect(firestore.data.get("leagueStatus/current").open).toBe(true);
  });
});

describe("the turn, run again each hour on Monday", () => {
  it("does nothing once the week is finished, leaving the count joins have moved since", async () => {
    const firestore = memoryFirestore(joiners(12));
    await turn(firestore);
    expect(firestore.data.get("leagueStatus/current")).toMatchObject({
      joined: 12,
      open: true,
    });
    // Someone leaves after the turn; the figure's count follows.
    await leagues.setLeagueSharing(firestore, "bronze00", false, {
      now: TURN + 60_000,
    });
    await leagues.refreshJoinedCount(firestore, { now: TURN + 60_000 });
    const after = firestore.data.get("leagueStatus/current");
    expect(after.joined).toBe(11);

    const again = await turn(firestore, { now: TURN + 3_600_000 });
    expect(again.alreadyFinished).toBe(true);
    expect(again.formed).toMatchObject({ groups: 1 });
    expect(firestore.data.get("leagueStatus/current")).toEqual(after);
  });

  it("one person's notification failing does not stop the week", async () => {
    const firestore = memoryFirestore({
      ...lastWeeksGroup(12),
      ...joiners(10),
    });
    const notify = vi.fn(async (uid) => {
      if (uid === "m03") throw new Error("notification write failed");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const summary = await turn(firestore, { notify });
    expect(notify).toHaveBeenCalledTimes(12);
    expect(summary.settled).toEqual({ groups: 1, results: 12 });
    expect(summary.formed.groups).toBeGreaterThan(0);
    expect(firestore.data.has("leagueGroups/last-001")).toBe(false);
    expect(firestore.data.get(`leagueWeeks/${WEEK}`).finishedAt).toBeTruthy();
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe("removeLeagueTraces (account deletion)", () => {
  it("takes the account's standing, its place and its membership, and leaves the group", async () => {
    const firestore = inAGroup();
    await leagues.removeLeagueTraces(firestore, "alice");
    expect(firestore.data.has("leagueMembers/alice")).toBe(false);
    expect(firestore.data.has("leagueGroups/g1/standings/alice")).toBe(false);
    expect(firestore.data.get("leagueGroups/g1")).toMatchObject({
      memberUids: ["bob"],
      size: 1,
    });
    expect(standing(firestore, "bob")).toBeTruthy();
  });
});
