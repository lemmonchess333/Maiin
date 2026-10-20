import { describe, it, expect } from "vitest";
import {
  affectedActivityDays,
  isParticipationMetric,
  participationValue,
  recomputeParticipationChallenge,
  reconcileParticipationChallenges,
} from "../lib/challengeParticipationProgress";

const UID = "participant";
const JAN = {
  metric: "active_days",
  startDate: new Date("2027-01-01T00:00:00Z"),
  endDate: new Date("2027-02-01T00:00:00Z"),
  tiers: { bronze: 1, silver: 2, gold: 3 },
};
const MINUTES = { ...JAN, metric: "training_minutes" };
const DAY = "2027-01-10";
const workout = (durationMinutes = 30, date = DAY) => ({
  date,
  durationMinutes,
});
const run = (duration = 1800, date = DAY, extra = {}) => ({
  date,
  duration,
  distance: 5000,
  ...extra,
});

describe("participation projections", () => {
  it("deduplicates local days across both sports and multiple sessions", () => {
    expect(
      participationValue(
        JAN,
        [workout(), workout(45)],
        [run(), run(1800, "2027-01-11")]
      )
    ).toBe(2);
  });

  it("combines partial minutes before conversion and keeps fractional credit", () => {
    expect(participationValue(MINUTES, [], [run(30), run(30)])).toBe(1);
    expect(participationValue(MINUTES, [workout(0.5)], [run(45)])).toBe(1.25);
  });

  it.each([undefined, null, 0, -2, NaN, Infinity, "30", {}])(
    "a logged workout with duration %s still counts a day, without invented minutes",
    (durationMinutes) => {
      const data = { date: DAY, durationMinutes };
      expect(participationValue(JAN, [data], [])).toBe(1);
      expect(participationValue(MINUTES, [data], [])).toBe(0);
    }
  );

  it.each([
    { isInvalid: true },
    { savedAnyway: true },
    { distance: 49 },
    { duration: 29 },
    { duration: Infinity },
    { duration: "1800" },
    { duration: NaN },
    { duration: 0 },
    { distance: Infinity },
    { distance: "5000" },
  ])("rejects an ineligible or malformed run %j", (extra) => {
    expect(participationValue(JAN, [], [run(1800, DAY, extra)])).toBe(0);
    expect(participationValue(MINUTES, [], [run(1800, DAY, extra)])).toBe(0);
  });

  it("credits the start date and excludes the end date and missing activity days", () => {
    const workouts = [
      workout(10, "2026-12-31"),
      workout(10, "2027-01-01"),
      workout(10, "2027-01-31"),
      workout(10, "2027-02-01"),
      { durationMinutes: 500 },
    ];
    expect(participationValue(JAN, workouts, [])).toBe(2);
    expect(participationValue(MINUTES, workouts, [])).toBe(20);
  });

  it("does not treat legacy sum metrics as participation projections", () => {
    expect(isParticipationMetric("total_km")).toBe(false);
    expect(
      participationValue({ ...JAN, metric: "total_km" }, [], [])
    ).toBeNull();
    expect(
      affectedActivityDays(workout(), run(), workout(5, "bad-date"))
    ).toEqual([DAY]);
  });
});

// A version-checked transactional store. Tests can change sources or
// membership at commit time; the transaction callback must reread facts on
// retry. Queries outside the transaction are recorded separately so moving
// the source scan before the transaction cannot quietly pass these tests.
function store() {
  const records = new Map();
  const events = [];
  let version = 0;
  let beforeCommit;
  const put = (path, data) => {
    records.set(path, structuredClone(data));
    version++;
  };
  const remove = (path) => {
    records.delete(path);
    version++;
  };
  const snapshot = (path, view) => ({
    id: path.split("/").at(-1),
    exists: view.has(path),
    data: () => structuredClone(view.get(path)),
  });
  const querySnapshot = (ref, view) => ({
    docs: [...view.keys()]
      .filter((path) => {
        if (path.split("/").slice(0, -1).join("/") !== ref.path) return false;
        return ref.filters.every(([field, operator, value]) => {
          const actual = view.get(path)[field];
          // Firestore leaves out a document that lacks the field.
          if (actual === undefined) return false;
          switch (operator) {
            case ">=":
              return actual >= value;
            case ">":
              return actual > value;
            case "<":
              return actual < value;
            case "<=":
              return actual <= value;
            default:
              throw new Error(`fake query: unsupported operator ${operator}`);
          }
        });
      })
      .map((path) => snapshot(path, view)),
  });
  const doc = (path) => ({
    path,
    kind: "doc",
    collection: (name) => collection(`${path}/${name}`),
  });
  const collection = (path, filters = []) => ({
    path,
    filters,
    kind: "query",
    doc: (id) => doc(`${path}/${id}`),
    where: (...filter) => collection(path, [...filters, filter]),
    get: async () => {
      events.push(`outside:${path}`);
      return querySnapshot({ path, filters }, records);
    },
  });
  const db = {
    collection,
    runTransaction: async (callback) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const readVersion = version;
        const view = structuredClone(records);
        const writes = [];
        await callback({
          get: async (ref) => {
            events.push(`transaction:${ref.path}`);
            return ref.kind === "query"
              ? querySnapshot(ref, view)
              : snapshot(ref.path, view);
          },
          update: (ref, data) => writes.push([ref.path, data]),
        });
        if (beforeCommit && writes.length) {
          const hook = beforeCommit;
          beforeCommit = undefined;
          hook();
        }
        if (readVersion !== version) continue;
        for (const [path, data] of writes)
          put(path, { ...records.get(path), ...data });
        return;
      }
      throw new Error("transaction did not converge");
    },
  };
  const member = (id) => `challenges/${id}/participants/${UID}`;
  const join = (id, joinedAt = 1) =>
    put(member(id), { currentValue: 0, tierAchieved: null, joinedAt });
  const value = (id) => records.get(member(id))?.currentValue;
  const source = (kind, id) => `users/${UID}/${kind}/${id}`;
  return {
    db,
    records,
    events,
    put,
    remove,
    member,
    join,
    value,
    source,
    beforeCommit: (hook) => {
      beforeCommit = hook;
    },
  };
}

function seeded() {
  const fake = store();
  fake.put("challenges/days", JAN);
  fake.put("challenges/minutes", MINUTES);
  fake.join("days");
  fake.join("minutes");
  return fake;
}

describe("current-source transactional reconciliation", () => {
  it("credits a midmonth join and rejoin exactly once, across source ID collisions", async () => {
    const s = seeded();
    s.put(s.source("workouts", "same-id"), workout(45));
    s.put(s.source("runs", "same-id"), run(900));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([1, 60]);
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([1, 60]);
    s.remove(s.member("days"));
    await recomputeParticipationChallenge(s.db, "days", UID);
    expect(s.value("days")).toBeUndefined();
    s.join("days", 2);
    await recomputeParticipationChallenge(s.db, "days", UID);
    expect(s.value("days")).toBe(1);
    expect([...s.records.keys()].some((key) => key.includes("/applied/"))).toBe(
      false
    );
  });

  it("uses current duration after edits and stale event redelivery", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(45));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    s.put(s.source("workouts", "lift"), workout(10));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect(s.value("minutes")).toBe(10);
  });

  it("moves credit between both affected months and preserves unrelated challenges", async () => {
    const s = seeded();
    s.put("challenges/feb", {
      ...JAN,
      startDate: JAN.endDate,
      endDate: new Date("2027-03-01T00:00:00Z"),
    });
    s.put("challenges/legacy", { ...JAN, metric: "total_km" });
    s.join("feb");
    s.join("legacy");
    s.put(s.source("workouts", "lift"), workout(10));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    s.put(s.source("workouts", "lift"), workout(10, "2027-02-01"));
    await reconcileParticipationChallenges(s.db, UID, [DAY, "2027-02-01"]);
    expect([s.value("days"), s.value("minutes"), s.value("feb")]).toEqual([
      0, 0, 1,
    ]);
    expect(s.value("legacy")).toBe(0);
    expect(s.events).not.toContain(`transaction:${s.member("legacy")}`);
  });

  it("deleting one same-day source keeps the day until the last source is gone", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(45));
    s.put(s.source("runs", "run"), run(900));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    s.remove(s.source("workouts", "lift"));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([1, 15]);
    s.remove(s.source("runs", "run"));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([0, 0]);
    s.put(s.source("runs", "run"), run(600));
    // A late delete delivery sees the recreated source, not its deleted snapshot.
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([1, 10]);
  });

  it("eligibility changes remove run credit and can restore it", async () => {
    const s = seeded();
    s.put(s.source("runs", "run"), run());
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    s.put(s.source("runs", "run"), run(1800, DAY, { isInvalid: true }));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([0, 0]);
    s.put(s.source("runs", "run"), run(1800));
    await reconcileParticipationChallenges(s.db, UID, [DAY]);
    expect([s.value("days"), s.value("minutes")]).toEqual([1, 30]);
  });

  it("reads bounded source queries inside the participant transaction", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(15));
    s.put(s.source("workouts", "other-month"), workout(999, "2027-02-01"));
    await recomputeParticipationChallenge(s.db, "minutes", UID);
    expect(s.value("minutes")).toBe(15);
    expect(s.events).toEqual([
      `transaction:${s.member("minutes")}`,
      "transaction:challenges/minutes",
      `transaction:users/${UID}/workouts`,
      `transaction:users/${UID}/runs`,
    ]);
  });

  it("retries a source edit during the scan instead of committing the stale total", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(45));
    s.beforeCommit(() => s.put(s.source("workouts", "lift"), workout(10)));
    await recomputeParticipationChallenge(s.db, "minutes", UID);
    expect(s.value("minutes")).toBe(10);
    expect(
      s.events.filter((event) => event === `transaction:${s.member("minutes")}`)
    ).toHaveLength(2);
  });

  it("does not recreate a membership deleted while the scan was in flight", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(45));
    s.beforeCommit(() => s.remove(s.member("minutes")));
    await recomputeParticipationChallenge(s.db, "minutes", UID);
    expect(s.value("minutes")).toBeUndefined();
  });

  it("a concurrent rejoin keeps its identity and gets a fresh projection", async () => {
    const s = seeded();
    s.put(s.source("workouts", "lift"), workout(45));
    s.beforeCommit(() => s.join("minutes", 2));
    await recomputeParticipationChallenge(s.db, "minutes", UID);
    expect(s.records.get(s.member("minutes"))).toMatchObject({
      joinedAt: 2,
      currentValue: 45,
    });
  });

  it("a malformed window or unrelated event does not scan or change participants", async () => {
    const s = seeded();
    await reconcileParticipationChallenges(s.db, UID, ["2027-02-03", "bad"]);
    expect(
      s.events.filter((event) => event.startsWith("transaction:"))
    ).toEqual([]);
    s.put("challenges/minutes", { ...MINUTES, endDate: JAN.startDate });
    await recomputeParticipationChallenge(s.db, "minutes", UID);
    expect(s.value("minutes")).toBe(0);
    expect(s.events).not.toContain(`transaction:users/${UID}/workouts`);
  });
});
