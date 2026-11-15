/**
 * App1 Q17: the first session and the week-4 return, kept once per account
 * by the session triggers (lib/launchMilestones.js).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  WEEK_FOUR,
  countsAsSession,
  nextLaunchMilestones,
  recordSessionMilestones,
} = require("../lib/launchMilestones.js");

const DAY = 86_400_000;
const SETUP = Date.parse("2026-11-02T08:00:00Z");
const at = (days, hours = 0) => SETUP + days * DAY + hours * 3_600_000;

const LIFT = { exercises: [{ sets: [{ reps: 5, weight: 60 }] }] };
const RUN = { distance: 5000, duration: 1800 };

describe("nextLaunchMilestones", () => {
  it("keeps the first counted session with its days since setup", () => {
    expect(
      nextLaunchMilestones(
        {},
        { kind: "run", atMs: at(3, 5), setupAtMs: SETUP }
      )
    ).toEqual({
      firstSession: { atMs: at(3, 5), kind: "run", daysSinceSetup: 3 },
    });
  });

  it("records nothing for an account set up before the map existed", () => {
    for (const current of [undefined, null, [], "x"])
      expect(
        nextLaunchMilestones(current, {
          kind: "lift",
          atMs: at(1),
          setupAtMs: SETUP,
        })
      ).toBeNull();
  });

  it("refuses a session it cannot date against setup", () => {
    for (const session of [
      { kind: "lift", atMs: at(1), setupAtMs: NaN },
      { kind: "lift", atMs: NaN, setupAtMs: SETUP },
      { kind: "lift", atMs: SETUP - 1, setupAtMs: SETUP },
      { kind: "swim", atMs: at(1), setupAtMs: SETUP },
    ])
      expect(nextLaunchMilestones({}, session)).toBeNull();
  });

  it("writes nothing again for a later session, and keeps the earlier of two", () => {
    const first = nextLaunchMilestones(
      {},
      { kind: "lift", atMs: at(2), setupAtMs: SETUP }
    );
    expect(
      nextLaunchMilestones(first, {
        kind: "run",
        atMs: at(4),
        setupAtMs: SETUP,
      })
    ).toBeNull();
    // A trigger for an earlier save that commits second.
    expect(
      nextLaunchMilestones(first, {
        kind: "run",
        atMs: at(1),
        setupAtMs: SETUP,
      })
    ).toEqual({
      firstSession: { atMs: at(1), kind: "run", daysSinceSetup: 1 },
    });
  });

  it("keeps the week-4 return only for a session on days 21 to 27", () => {
    const first = {
      firstSession: { atMs: at(0, 2), kind: "lift", daysSinceSetup: 0 },
    };
    expect(WEEK_FOUR).toEqual({ fromDay: 21, toDay: 27 });
    for (const days of [20, 28])
      expect(
        nextLaunchMilestones(first, {
          kind: "lift",
          atMs: at(days, 23),
          setupAtMs: SETUP,
        })
      ).toBeNull();
    const week4 = nextLaunchMilestones(first, {
      kind: "run",
      atMs: at(21),
      setupAtMs: SETUP,
    });
    expect(week4).toEqual({
      ...first,
      week4Return: { atMs: at(21), kind: "run", daysSinceSetup: 21 },
    });
    expect(
      nextLaunchMilestones(week4, {
        kind: "lift",
        atMs: at(27, 23),
        setupAtMs: SETUP,
      })
    ).toBeNull();
  });

  it("can make both at once: a first session in the fourth week", () => {
    expect(
      nextLaunchMilestones({}, { kind: "lift", atMs: at(24), setupAtMs: SETUP })
    ).toEqual({
      firstSession: { atMs: at(24), kind: "lift", daysSinceSetup: 24 },
      week4Return: { atMs: at(24), kind: "lift", daysSinceSetup: 24 },
    });
  });
});

describe("countsAsSession", () => {
  it("holds the cohort report's rule", () => {
    expect(countsAsSession("lift", LIFT)).toBe(true);
    expect(countsAsSession("lift", { exercises: [{ sets: [] }] })).toBe(false);
    expect(countsAsSession("run", RUN)).toBe(true);
    expect(countsAsSession("run", { ...RUN, savedAnyway: true })).toBe(false);
    expect(countsAsSession("run", { distance: 20, duration: 1800 })).toBe(
      false
    );
    expect(countsAsSession("swim", RUN)).toBe(false);
  });
});

/** The profile in a transaction, as the trigger's Admin SDK sees it. */
function fakeDb(user) {
  const writes = [];
  const ref = { path: "users/u1" };
  return {
    writes,
    collection: (name) => ({
      doc: (id) => {
        expect(`${name}/${id}`).toBe("users/u1");
        return ref;
      },
    }),
    runTransaction: async (fn) =>
      fn({
        get: async () => ({ exists: !!user, data: () => user }),
        update: (r, value) => writes.push([r.path, value]),
      }),
  };
}

const setupStamp = { toMillis: () => SETUP };

describe("recordSessionMilestones", () => {
  it("writes the first session onto a profile that keeps them", async () => {
    const db = fakeDb({
      onboardingCompletedAt: setupStamp,
      launchMilestones: {},
    });
    const next = await recordSessionMilestones(db, {
      uid: "u1",
      kind: "lift",
      data: LIFT,
      atMs: at(5),
    });
    expect(next.firstSession).toEqual({
      atMs: at(5),
      kind: "lift",
      daysSinceSetup: 5,
    });
    expect(db.writes).toEqual([["users/u1", { launchMilestones: next }]]);
  });

  it("writes nothing for a session that does not count", async () => {
    const db = fakeDb({
      onboardingCompletedAt: setupStamp,
      launchMilestones: {},
    });
    expect(
      await recordSessionMilestones(db, {
        uid: "u1",
        kind: "run",
        data: { ...RUN, isInvalid: true },
        atMs: at(5),
      })
    ).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it("writes nothing for an older account, or one with no setup time", async () => {
    for (const user of [
      { onboardingCompletedAt: setupStamp },
      { launchMilestones: {} },
      null,
    ]) {
      const db = fakeDb(user);
      expect(
        await recordSessionMilestones(db, {
          uid: "u1",
          kind: "run",
          data: RUN,
          atMs: at(5),
        })
      ).toBeNull();
      expect(db.writes).toEqual([]);
    }
  });
});

describe("wiring", () => {
  const INDEX = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const slice = (name) => {
    const start = INDEX.indexOf(`exports.${name} = functions`);
    expect(start).toBeGreaterThan(-1);
    return INDEX.slice(start, INDEX.indexOf("\nexports.", start + 1));
  };

  it("both session triggers record by the document's create time", () => {
    for (const [name, kind] of [
      ["onWorkoutCreated", "lift"],
      ["onRunCreated", "run"],
    ]) {
      const trigger = slice(name);
      expect(trigger).toMatch(
        new RegExp(
          `launchMilestones\\.recordSessionMilestones\\(db, \\{\\s+uid,\\s+kind: "${kind}",\\s+data,\\s+atMs: snap\\.createTime\\?\\.toMillis\\?\\.\\(\\)`
        )
      );
      // Inside a retried step, so a failure delivers the event again.
      expect(trigger).toMatch(/steps\.run\("launch milestones"/);
    }
  });

  it("setup stamps the map on the first completion only", () => {
    const onboarding = slice("completeOnboarding");
    const gate = onboarding.indexOf("if (!alreadyCompleted) {");
    const stamp = onboarding.indexOf("nextProfileData.launchMilestones = {};");
    expect(gate).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(gate);
    expect(stamp).toBeLessThan(
      onboarding.indexOf("if (existing.exists)", gate)
    );
  });
});
