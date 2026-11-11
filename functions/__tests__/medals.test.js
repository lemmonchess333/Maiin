/**
 * Medals (Soc15, lib/medals.js): the pure rules, and the one transaction
 * that keeps a person's medal and their public summary in step with
 * their participant document.
 *
 * The decisions the trigger makes, each asserted on its own: a rise
 * creates the medal and an upgrade raises it; a reversal during the
 * challenge lowers it or removes it; nothing changes it once the
 * challenge has settled; a community goal never makes one; and a second
 * delivery of the same state writes nothing.
 *
 * Every date here is derived from the clock (CLAUDE.md, "CI runs the
 * suite five ways"): "this month" and "last month" are the UTC months
 * around now, so the +90-day run moves them with it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const medals = require("../lib/medals");
const {
  MEDAL_SETTLE_MS,
  MEDAL_SUMMARY_MAX,
  decideMedal,
  isMedalChallenge,
  medalFreezeMs,
  nextMedalSummary,
  participantChangeMayMoveMedal,
  summaryEntryFor,
  syncMedal,
  backfillMedals,
} = medals;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function utcMonth(offset) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)
  );
}

/** A month-long Mileage challenge `offset` months from this one. */
function mileage(offset = 0, over = {}) {
  return {
    name: "Mileage",
    type: "monthly",
    metric: "total_km",
    tiers: { bronze: 10, silver: 25, gold: 50 },
    startDate: utcMonth(offset),
    endDate: utcMonth(offset + 1),
    ...over,
  };
}

const THIS_MONTH = mileage(0);
const LAST_MONTH = mileage(-1);
const ID = "monthly-test";
/** A moment inside this month's window. */
const IN_MONTH = THIS_MONTH.startDate.getTime() + 3 * DAY;

const decide = (over) =>
  decideMedal({
    challengeId: ID,
    challenge: THIS_MONTH,
    participant: { tierAchieved: "bronze", currentValue: 12 },
    observedMs: IN_MONTH,
    existing: null,
    eventMs: IN_MONTH,
    isDelete: false,
    ...over,
  });

describe("which challenges award medals", () => {
  it("a tiered, dated, named challenge does", () => {
    expect(isMedalChallenge(THIS_MONTH, ID)).toBe(true);
  });

  it("a community goal does not, by its target or by its id", () => {
    expect(
      isMedalChallenge({ ...THIS_MONTH, collectiveTarget: 1000 }, ID)
    ).toBe(false);
    expect(isMedalChallenge(THIS_MONTH, "group-goal-2026-11-01")).toBe(false);
  });

  it("one without three numeric tiers, a window or a name does not", () => {
    expect(isMedalChallenge({ ...THIS_MONTH, tiers: undefined }, ID)).toBe(
      false
    );
    expect(
      isMedalChallenge({ ...THIS_MONTH, tiers: { bronze: 1, silver: 2 } }, ID)
    ).toBe(false);
    expect(isMedalChallenge({ ...THIS_MONTH, endDate: undefined }, ID)).toBe(
      false
    );
    expect(
      isMedalChallenge({ ...THIS_MONTH, endDate: THIS_MONTH.startDate }, ID)
    ).toBe(false);
    expect(isMedalChallenge({ ...THIS_MONTH, name: "  " }, ID)).toBe(false);
    expect(isMedalChallenge(null, ID)).toBe(false);
  });

  it("freezes MEDAL_SETTLE_MS after the UTC midnight its window ends on", () => {
    expect(medalFreezeMs(THIS_MONTH)).toBe(
      THIS_MONTH.endDate.getTime() + MEDAL_SETTLE_MS
    );
    // Long enough for the farthest time zone's last day (12 h) and a
    // session saved offline on it.
    expect(MEDAL_SETTLE_MS).toBeGreaterThan(12 * HOUR);
  });
});

describe("which participant writes can move a medal", () => {
  it("none below bronze, before or after", () => {
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: null, currentValue: 3 },
        { tierAchieved: null, currentValue: 5 }
      )
    ).toBe(false);
    expect(
      participantChangeMayMoveMedal(null, {
        tierAchieved: null,
        currentValue: 0,
      })
    ).toBe(false);
  });

  it("not a name or photo carried onto the row", () => {
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: "silver", currentValue: 30, displayName: "A" },
        { tierAchieved: "silver", currentValue: 30, displayName: "B" }
      )
    ).toBe(false);
  });

  it("a rise, a fall, more progress and a leave", () => {
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: null, currentValue: 9 },
        { tierAchieved: "bronze", currentValue: 11 }
      )
    ).toBe(true);
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: "silver", currentValue: 26 },
        { tierAchieved: "bronze", currentValue: 20 }
      )
    ).toBe(true);
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: "bronze", currentValue: 11 },
        { tierAchieved: "bronze", currentValue: 14 }
      )
    ).toBe(true);
    expect(
      participantChangeMayMoveMedal(
        { tierAchieved: "bronze", currentValue: 11 },
        null
      )
    ).toBe(true);
  });
});

describe("decideMedal", () => {
  it("a tier reached makes the medal, dated when it was reached", () => {
    const decision = decide();
    expect(decision.kind).toBe("set");
    expect(decision.medal).toMatchObject({
      challengeId: ID,
      name: "Mileage",
      metric: "total_km",
      type: "monthly",
      tier: "bronze",
      value: 12,
      goal: 10,
      earnedAt: new Date(IN_MONTH).toISOString(),
    });
    expect(decision.medal.startDate).toBe(
      THIS_MONTH.startDate.toISOString().slice(0, 10)
    );
    expect(decision.medal.endDate).toBe(
      THIS_MONTH.endDate.toISOString().slice(0, 10)
    );
  });

  it("an upgrade raises it and keeps the day bronze came", () => {
    const bronze = decide().medal;
    const later = IN_MONTH + 5 * DAY;
    const decision = decide({
      participant: { tierAchieved: "silver", currentValue: 26 },
      observedMs: later,
      eventMs: later,
      existing: bronze,
    });
    expect(decision.kind).toBe("set");
    expect(decision.medal.tier).toBe("silver");
    expect(decision.medal.goal).toBe(25);
    expect(decision.medal.earnedAt).toBe(new Date(later).toISOString());
    expect(decision.medal.reachedAt).toEqual({
      bronze: bronze.earnedAt,
      silver: new Date(later).toISOString(),
    });
  });

  it("straight to silver dates bronze the same moment", () => {
    const decision = decide({
      participant: { tierAchieved: "silver", currentValue: 30 },
    });
    expect(decision.medal.reachedAt).toEqual({
      bronze: new Date(IN_MONTH).toISOString(),
      silver: new Date(IN_MONTH).toISOString(),
    });
  });

  it("a reversal during the challenge lowers it, back to bronze's own day", () => {
    const bronze = decide().medal;
    const silver = decide({
      participant: { tierAchieved: "silver", currentValue: 26 },
      observedMs: IN_MONTH + DAY,
      existing: bronze,
    }).medal;
    const decision = decide({
      participant: { tierAchieved: "bronze", currentValue: 20 },
      observedMs: IN_MONTH + 2 * DAY,
      existing: silver,
    });
    expect(decision.kind).toBe("set");
    expect(decision.medal.tier).toBe("bronze");
    expect(decision.medal.earnedAt).toBe(bronze.earnedAt);
    expect(decision.medal.reachedAt).toEqual({ bronze: bronze.earnedAt });
  });

  it("a reversal below bronze during the challenge removes it", () => {
    expect(
      decide({
        participant: { tierAchieved: null, currentValue: 4 },
        existing: decide().medal,
      })
    ).toEqual({ kind: "delete" });
  });

  it("leaving during the challenge removes it", () => {
    expect(
      decide({ participant: null, isDelete: true, existing: decide().medal })
    ).toEqual({ kind: "delete" });
  });

  it("is frozen once the challenge has settled: no lowering, no removal", () => {
    const existing = decideMedal({
      challengeId: ID,
      challenge: LAST_MONTH,
      participant: { tierAchieved: "gold", currentValue: 52 },
      observedMs: LAST_MONTH.startDate.getTime() + 20 * DAY,
      existing: null,
      eventMs: LAST_MONTH.startDate.getTime() + 20 * DAY,
      isDelete: false,
    }).medal;
    const afterSettle = medalFreezeMs(LAST_MONTH) + HOUR;
    const base = {
      challengeId: ID,
      challenge: LAST_MONTH,
      existing,
      eventMs: afterSettle,
      isDelete: false,
    };
    // An old run deleted next month: the participant falls to silver.
    expect(
      decideMedal({
        ...base,
        participant: { tierAchieved: "silver", currentValue: 40 },
        observedMs: afterSettle,
      })
    ).toEqual({ kind: "none", reason: "frozen" });
    // Leaving the finished challenge.
    expect(decideMedal({ ...base, participant: null, isDelete: true })).toEqual(
      { kind: "none", reason: "frozen" }
    );
  });

  it("still follows a last-day session that lands inside the settle window", () => {
    const lastDay = LAST_MONTH.endDate.getTime() + 10 * HOUR;
    const decision = decideMedal({
      challengeId: ID,
      challenge: LAST_MONTH,
      participant: { tierAchieved: "gold", currentValue: 51 },
      observedMs: lastDay,
      existing: null,
      eventMs: lastDay,
      isDelete: false,
    });
    expect(decision.kind).toBe("set");
    expect(decision.medal.tier).toBe("gold");
  });

  it("a late delivery of a state written before the freeze still applies", () => {
    const written = LAST_MONTH.startDate.getTime() + 10 * DAY;
    expect(
      decideMedal({
        challengeId: ID,
        challenge: LAST_MONTH,
        participant: { tierAchieved: "bronze", currentValue: 11 },
        observedMs: written,
        existing: null,
        eventMs: written,
        isDelete: false,
      }).kind
    ).toBe("set");
  });

  it("a community goal never makes one", () => {
    expect(
      decide({ challenge: { ...THIS_MONTH, collectiveTarget: 1000 } })
    ).toEqual({ kind: "none", reason: "not-a-medal" });
  });

  it("the same standing again is no change", () => {
    const medal = decide().medal;
    expect(decide({ existing: medal })).toEqual({
      kind: "none",
      reason: "unchanged",
    });
  });

  it("more distance at the same tier moves the value", () => {
    const medal = decide().medal;
    const decision = decide({
      existing: medal,
      participant: { tierAchieved: "bronze", currentValue: 17.25 },
    });
    expect(decision.kind).toBe("set");
    expect(decision.medal.value).toBe(17.25);
    expect(decision.medal.earnedAt).toBe(medal.earnedAt);
  });

  it("a participant gone without its own removal decides nothing", () => {
    expect(decide({ participant: null, existing: decide().medal })).toEqual({
      kind: "none",
      reason: "participant-gone",
    });
  });

  it("a fastest 5K keeps its distance", () => {
    const decision = decide({
      challenge: {
        ...THIS_MONTH,
        name: "Fastest 5K",
        metric: "fastest_effort",
        targetDistance: 5000,
        tiers: { bronze: 2100, silver: 1800, gold: 1500 },
      },
      participant: { tierAchieved: "silver", currentValue: 1700 },
    });
    expect(decision.medal).toMatchObject({
      tier: "silver",
      goal: 1800,
      targetDistance: 5000,
    });
  });

  describe("the backfill", () => {
    it("makes a missing medal for a challenge that ended long ago", () => {
      const old = mileage(-6);
      const decision = decideMedal({
        challengeId: ID,
        challenge: old,
        participant: { tierAchieved: "silver", currentValue: 30 },
        // The row was last touched well after it ended (a name carried).
        observedMs: Date.now(),
        existing: null,
        eventMs: Date.now(),
        isDelete: false,
        backfill: true,
      });
      expect(decision.kind).toBe("set");
      // Dated no later than the challenge's last moment.
      expect(Date.parse(decision.medal.earnedAt)).toBeLessThan(
        old.endDate.getTime()
      );
    });

    it("leaves a medal that exists to the trigger", () => {
      expect(decide({ backfill: true, existing: decide().medal }).reason).toBe(
        "exists"
      );
    });
  });
});

describe("the public summary", () => {
  const entry = (endOffset, tier = "bronze") => {
    const challenge = mileage(endOffset);
    return summaryEntryFor(
      decideMedal({
        challengeId: ID,
        challenge,
        participant: { tierAchieved: tier, currentValue: 60 },
        observedMs: challenge.startDate.getTime() + DAY,
        existing: null,
        eventMs: challenge.startDate.getTime() + DAY,
        isDelete: false,
      }).medal
    );
  };

  it("carries what the trophy case draws, and nothing private", () => {
    expect(Object.keys(entry(0)).sort()).toEqual(
      [
        "endDate",
        "goal",
        "metric",
        "name",
        "startDate",
        "tier",
        "type",
        "value",
      ].sort()
    );
  });

  it("sets and removes one medal's line", () => {
    const added = nextMedalSummary({}, "a", entry(0));
    expect(Object.keys(added)).toEqual(["a"]);
    expect(nextMedalSummary(added, "a", null)).toEqual({});
  });

  it("keeps the newest editions when it is full", () => {
    let summary = {};
    for (let i = 0; i < MEDAL_SUMMARY_MAX + 5; i++) {
      summary = nextMedalSummary(summary, `m${i}`, entry(-i));
    }
    const ids = Object.keys(summary);
    expect(ids).toHaveLength(MEDAL_SUMMARY_MAX);
    expect(ids).toContain("m0");
    expect(ids).not.toContain(`m${MEDAL_SUMMARY_MAX + 4}`);
  });

  it("drops a malformed stored line", () => {
    expect(
      nextMedalSummary({ bad: { tier: "platinum" }, worse: 3 }, "a", entry(0))
    ).toEqual({ a: entry(0) });
  });
});

/* ── The transaction, on a small in-memory Firestore ────────────────── */

function fakeDb(seed = {}) {
  const docs = new Map();
  let clock = 1;
  const writes = [];
  for (const [path, value] of Object.entries(seed)) {
    docs.set(path, { data: structuredClone(value), updateMs: clock++ });
  }

  const idOf = (path) => path.split("/").at(-1);
  function snapshot(path) {
    const stored = docs.get(path);
    return {
      id: idOf(path),
      ref: ref(path),
      exists: !!stored,
      data: () => (stored ? structuredClone(stored.data) : undefined),
      updateTime: stored ? { toMillis: () => stored.updateMs } : undefined,
    };
  }
  function ref(path) {
    return {
      path,
      id: idOf(path),
      collection: (name) => collection(`${path}/${name}`),
      get: async () => snapshot(path),
    };
  }
  function millis(value) {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toMillis === "function") return value.toMillis();
    return Number(value);
  }
  function collection(path, filters = [], cap = Infinity, after = null) {
    const run = () =>
      [...docs.keys()]
        .filter(
          (p) =>
            p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/")
        )
        .sort()
        .filter((p) =>
          filters.every(([field, op, value]) => {
            const v = docs.get(p).data[field];
            if (op === "in") return value.includes(v);
            if (op === ">") return millis(v) > millis(value);
            throw new Error(`op ${op}`);
          })
        )
        .filter((p) => !after || idOf(p) > after.id)
        .slice(0, cap)
        .map(snapshot);
    return {
      path,
      doc: (id) => ref(`${path}/${id}`),
      where: (field, op, value) =>
        collection(path, [...filters, [field, op, value]], cap, after),
      orderBy: () => collection(path, filters, cap, after),
      limit: (n) => collection(path, filters, n, after),
      startAfter: (snap) => collection(path, filters, cap, snap),
      get: async () => ({ docs: run() }),
    };
  }

  function apply(pending) {
    for (const [op, path, value, options] of pending) {
      writes.push([op, path]);
      if (op === "delete") {
        docs.delete(path);
        continue;
      }
      const previous = docs.get(path)?.data;
      let next = structuredClone(value);
      if (options?.mergeFields) {
        next = { ...(previous || {}) };
        for (const field of options.mergeFields) {
          next[field] = structuredClone(value[field]);
        }
      } else if (options?.merge) {
        next = { ...(previous || {}), ...structuredClone(value) };
      }
      docs.set(path, { data: next, updateMs: clock++ });
    }
  }

  return {
    writes,
    read: (path) => docs.get(path)?.data,
    /** A write from somewhere else (a session trigger, the client). */
    put(path, value, updateMs) {
      docs.set(path, {
        data: structuredClone(value),
        updateMs: updateMs ?? clock++,
      });
    },
    remove(path) {
      docs.delete(path);
    },
    collection: (name) => collection(name),
    runTransaction: async (fn) => {
      const pending = [];
      const tx = {
        get: async (r) => snapshot(r.path),
        set: (r, value, options) =>
          pending.push(["set", r.path, value, options]),
        delete: (r) => pending.push(["delete", r.path]),
      };
      const out = await fn(tx);
      apply(pending);
      return out;
    },
  };
}

const UID = "runner-1";
const PARTICIPANT = `challenges/${ID}/participants/${UID}`;
const MEDAL = `users/${UID}/medals/${ID}`;
const PROFILE = `users/${UID}/public/profile`;

function seeded(participant, challenge = THIS_MONTH, extra = {}) {
  const db = fakeDb({
    [`challenges/${ID}`]: challenge,
    [PROFILE]: {
      displayName: "Runner",
      badgeSummary: { earnedMap: {}, count: 0 },
    },
    ...extra,
  });
  if (participant) db.put(PARTICIPANT, participant, IN_MONTH);
  return db;
}

const sync = (db, over = {}) =>
  syncMedal({
    firestore: db,
    uid: UID,
    challengeId: ID,
    eventMs: IN_MONTH,
    now: IN_MONTH,
    ...over,
  });

describe("syncMedal", () => {
  it("a rise writes the medal and its summary line in one transaction", async () => {
    const db = seeded({ tierAchieved: "bronze", currentValue: 12 });
    const result = await sync(db);
    expect(result).toMatchObject({ changed: true, decision: "set" });
    expect(db.read(MEDAL)).toMatchObject({ tier: "bronze", value: 12 });
    expect(db.read(PROFILE).medalSummary).toEqual({
      [ID]: summaryEntryFor(db.read(MEDAL)),
    });
    // The rest of the public profile is left as it was.
    expect(db.read(PROFILE).displayName).toBe("Runner");
    expect(db.read(PROFILE).badgeSummary).toEqual({ earnedMap: {}, count: 0 });
  });

  it("a second delivery writes nothing", async () => {
    const db = seeded({ tierAchieved: "silver", currentValue: 26 });
    await sync(db);
    const before = db.writes.length;
    const again = await sync(db);
    expect(again).toMatchObject({ changed: false, decision: "none" });
    expect(db.writes.length).toBe(before);
  });

  it("a reversal during the month lowers the medal and its line", async () => {
    const db = seeded({ tierAchieved: "silver", currentValue: 26 });
    await sync(db);
    db.put(
      PARTICIPANT,
      { tierAchieved: "bronze", currentValue: 20 },
      IN_MONTH + DAY
    );
    await sync(db, { eventMs: IN_MONTH + DAY });
    expect(db.read(MEDAL).tier).toBe("bronze");
    expect(db.read(PROFILE).medalSummary[ID].tier).toBe("bronze");
  });

  it("leaving during the month removes the medal and its line", async () => {
    const db = seeded({ tierAchieved: "bronze", currentValue: 12 });
    await sync(db);
    db.remove(PARTICIPANT);
    await sync(db, { eventMs: IN_MONTH + DAY, isDelete: true });
    expect(db.read(MEDAL)).toBeUndefined();
    expect(db.read(PROFILE).medalSummary).toEqual({});
  });

  it("reads the participant as it is now, so an older delivery cannot undo a newer one", async () => {
    const db = seeded({ tierAchieved: "gold", currentValue: 55 });
    // The bronze event's delivery arrives after the gold write.
    await sync(db, { eventMs: IN_MONTH - DAY });
    expect(db.read(MEDAL).tier).toBe("gold");
  });

  it("is frozen after the challenge settles", async () => {
    const written = LAST_MONTH.startDate.getTime() + 20 * DAY;
    const db = seeded(null, LAST_MONTH);
    db.put(PARTICIPANT, { tierAchieved: "gold", currentValue: 52 }, written);
    await sync(db, { eventMs: written });
    expect(db.read(MEDAL).tier).toBe("gold");
    const afterSettle = medalFreezeMs(LAST_MONTH) + DAY;
    db.put(
      PARTICIPANT,
      { tierAchieved: "bronze", currentValue: 12 },
      afterSettle
    );
    const before = db.writes.length;
    const result = await sync(db, { eventMs: afterSettle });
    expect(result).toMatchObject({ changed: false, reason: "frozen" });
    expect(db.read(MEDAL).tier).toBe("gold");
    db.remove(PARTICIPANT);
    await sync(db, { eventMs: afterSettle + HOUR, isDelete: true });
    expect(db.read(MEDAL).tier).toBe("gold");
    expect(db.writes.length).toBe(before);
  });

  it("a community goal writes nothing", async () => {
    const db = seeded(
      { tierAchieved: "gold", currentValue: 1200 },
      { ...THIS_MONTH, collectiveTarget: 1000 }
    );
    const result = await sync(db);
    expect(result.changed).toBe(false);
    expect(db.read(MEDAL)).toBeUndefined();
    expect(db.read(PROFILE).medalSummary).toBeUndefined();
  });

  it("an account being deleted gets no medal", async () => {
    const db = seeded({ tierAchieved: "gold", currentValue: 55 }, THIS_MONTH, {
      [`accountDeletionRequests/${UID}`]: { status: "running" },
    });
    const result = await sync(db);
    expect(result).toMatchObject({
      changed: false,
      reason: "account-deleting",
    });
    expect(db.read(MEDAL)).toBeUndefined();
  });

  it("puts back a summary line the profile lost, without touching the medal", async () => {
    const db = seeded({ tierAchieved: "bronze", currentValue: 12 });
    await sync(db);
    db.put(PROFILE, { displayName: "Runner" });
    const result = await sync(db);
    expect(result).toMatchObject({ decision: "none", summaryChanged: true });
    expect(db.read(PROFILE).medalSummary[ID].tier).toBe("bronze");
  });
});

describe("backfillMedals", () => {
  it("gives ended and running challenges their medals, and a second run writes nothing", async () => {
    const now = Date.now();
    const db = fakeDb({
      "challenges/monthly-last": LAST_MONTH,
      "challenges/monthly-now": THIS_MONTH,
      "challenges/group-goal-now": { ...THIS_MONTH, collectiveTarget: 1000 },
      "challenges/monthly-old": mileage(-24),
      "challenges/monthly-last/participants/a": {
        tierAchieved: "gold",
        currentValue: 51,
      },
      "challenges/monthly-last/participants/b": {
        tierAchieved: null,
        currentValue: 3,
      },
      "challenges/monthly-now/participants/a": {
        tierAchieved: "bronze",
        currentValue: 11,
      },
      "challenges/group-goal-now/participants/a": {
        tierAchieved: "gold",
        currentValue: 1200,
      },
      "challenges/monthly-old/participants/a": {
        tierAchieved: "gold",
        currentValue: 60,
      },
      "users/a/public/profile": { displayName: "A" },
    });
    const first = await backfillMedals(db, { now });
    expect(first).toEqual({
      challenges: 2,
      participants: 2,
      written: 2,
      skipped: 0,
    });
    expect(db.read("users/a/medals/monthly-last").tier).toBe("gold");
    expect(db.read("users/a/medals/monthly-now").tier).toBe("bronze");
    expect(db.read("users/a/medals/group-goal-now")).toBeUndefined();
    // Outside the lookback: left alone.
    expect(db.read("users/a/medals/monthly-old")).toBeUndefined();
    expect(
      Object.keys(db.read("users/a/public/profile").medalSummary).sort()
    ).toEqual(["monthly-last", "monthly-now"]);

    const second = await backfillMedals(db, { now });
    expect(second.written).toBe(0);
  });

  it("skips an account the caller says not to write", async () => {
    const db = fakeDb({
      "challenges/monthly-now": THIS_MONTH,
      "challenges/monthly-now/participants/a": {
        tierAchieved: "bronze",
        currentValue: 11,
      },
    });
    const totals = await backfillMedals(db, {
      now: Date.now(),
      shouldWrite: async () => false,
    });
    expect(totals).toMatchObject({ participants: 1, skipped: 1, written: 0 });
    expect(db.read("users/a/medals/monthly-now")).toBeUndefined();
  });
});
