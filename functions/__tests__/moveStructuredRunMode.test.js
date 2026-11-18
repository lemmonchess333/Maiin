/**
 * App1 Q25: the one-off move of an account still on the retired
 * "structured" run mode, for an account nobody opens again. It makes the
 * loader's move (useProgram.ts) and nothing else, and a dry run writes
 * nothing.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  moveStructuredRunMode,
  parseArgs,
} = require("../scripts/moveStructuredRunMode");

const DELETE = Symbol("delete");

/**
 * Just enough Firestore: `users` queried by `runMode`, each user's
 * `programState/current`, and transactions that apply `update` patches.
 * `changeBeforeTx` lets a test move an account between the query and its
 * transaction, as the app would.
 */
function fakeFirestore(accounts, { changeBeforeTx } = {}) {
  const writes = [];
  const refFor = (id) => {
    const ref = {
      path: `users/${id}`,
      collection: (name) => {
        if (name !== "programState")
          throw new Error(`unexpected collection ${name}`);
        return {
          doc: (doc) => ({ path: `users/${id}/programState/${doc}`, id, doc }),
        };
      },
    };
    return ref;
  };
  const read = (ref) => {
    const [, id, , doc] = ref.path.split("/");
    const account = accounts[id];
    const data = doc ? account?.plan : account?.profile;
    return { exists: !!data, data: () => data };
  };
  const apply = (ref, patch) => {
    writes.push({ path: ref.path, patch });
    const [, id, , doc] = ref.path.split("/");
    const target = doc ? accounts[id].plan : accounts[id].profile;
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE) delete target[key];
      else target[key] = value;
    }
  };
  return {
    writes,
    collection: (name) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        where: (field, op, value) => ({
          get: async () => ({
            docs: Object.keys(accounts)
              .sort()
              .filter((id) => accounts[id].profile?.[field] === value)
              .map((id) => ({ id, ref: refFor(id) })),
          }),
        }),
      };
    },
    runTransaction: async (fn) => {
      changeBeforeTx?.(accounts);
      const pending = [];
      const result = await fn({
        get: async (ref) => read(ref),
        update: (ref, patch) => pending.push([ref, patch]),
      });
      for (const [ref, patch] of pending) apply(ref, patch);
      return result;
    },
  };
}

function testAccounts() {
  return {
    a: {
      profile: { runMode: "structured", raceGoal: null, weeklyRunsTarget: 3 },
      plan: {
        workouts: [{ name: "Push" }],
        runDays: [{ date: "2026-01-05" }],
        runPlan: { mode: "structured" },
      },
    },
    b: { profile: { runMode: "freeform" }, plan: { runDays: [] } },
    c: { profile: { runMode: "structured" } },
  };
}

describe("moveStructuredRunMode", () => {
  it("only counts on a dry run, and writes nothing", async () => {
    const firestore = fakeFirestore(testAccounts());
    expect(await moveStructuredRunMode(firestore)).toEqual({
      found: 2,
      moved: 0,
      plansCleared: 0,
      dryRun: true,
    });
    expect(firestore.writes).toEqual([]);
  });

  it("makes the loader's move: runMode freeform, the plan's run days and run plan cleared", async () => {
    const accounts = testAccounts();
    const firestore = fakeFirestore(accounts);
    const report = await moveStructuredRunMode(firestore, {
      apply: true,
      fieldDelete: DELETE,
    });
    expect(report).toEqual({
      found: 2,
      moved: 2,
      plansCleared: 1,
      dryRun: false,
    });
    expect(accounts.a.profile).toEqual({
      runMode: "freeform",
      raceGoal: null,
      weeklyRunsTarget: 3,
    });
    expect(accounts.a.plan).toEqual({
      workouts: [{ name: "Push" }],
      runDays: [],
    });
    // No plan is made for an account without one.
    expect(accounts.c).toEqual({ profile: { runMode: "freeform" } });
    // The account already on free running is not touched.
    expect(firestore.writes.map((w) => w.path)).toEqual([
      "users/a",
      "users/a/programState/current",
      "users/c",
    ]);
  });

  it("leaves an account the app moved after the query", async () => {
    const accounts = testAccounts();
    const firestore = fakeFirestore(accounts, {
      changeBeforeTx: (all) => {
        all.a.profile.runMode = "freeform";
      },
    });
    const report = await moveStructuredRunMode(firestore, {
      apply: true,
      fieldDelete: DELETE,
    });
    expect(report.found).toBe(2);
    expect(report.moved).toBe(1);
    expect(accounts.a.plan.runPlan).toEqual({ mode: "structured" });
    expect(firestore.writes.map((w) => w.path)).toEqual(["users/c"]);
  });

  it("refuses to apply without a delete sentinel, and parses its options", async () => {
    await expect(
      moveStructuredRunMode(fakeFirestore(testAccounts()), { apply: true })
    ).rejects.toThrow("fieldDelete");
    expect(parseArgs(["--project", "p", "--apply"])).toEqual({
      apply: true,
      projectId: "p",
    });
    expect(() => parseArgs(["--project", "p", "--force"])).toThrow(
      "Unknown option"
    );
    expect(() => parseArgs([])).toThrow("--project");
  });
});
