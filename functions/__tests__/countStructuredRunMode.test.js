/**
 * App1 Q25: the count that decides when the retired "structured" run mode
 * can leave the code. It reads the profile, the plan and the saved runs,
 * writes nothing, and names no account unless asked.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  countStructuredRunMode,
  verdict,
} = require("../scripts/countStructuredRunMode");

/**
 * Just enough Firestore for the count: `users` paged by id, each user's
 * `programState/current`, and a count of their runs by `planMode`. Any
 * write throws.
 */
function fakeFirestore(accounts) {
  const ids = Object.keys(accounts).sort();
  const pages = [];
  const refuse = () => {
    throw new Error("the count must not write");
  };

  function userSnap(id) {
    const account = accounts[id];
    return {
      id,
      data: () => account.profile,
      ref: {
        collection: (name) => {
          if (name === "programState")
            return {
              doc: (doc) => ({
                get: async () => ({
                  exists: doc === "current" && !!account.plan,
                  data: () => account.plan,
                }),
                set: refuse,
                update: refuse,
              }),
            };
          if (name === "runs")
            return {
              where: (field, op, value) => ({
                count: () => ({
                  get: async () => ({
                    data: () => ({
                      count: (account.runs ?? []).filter(
                        (run) => op === "==" && run[field] === value
                      ).length,
                    }),
                  }),
                }),
              }),
            };
          throw new Error(`unexpected collection ${name}`);
        },
      },
    };
  }

  function usersQuery(limit, after) {
    return {
      startAfter: (snap) => usersQuery(limit, snap.id),
      get: async () => {
        const from = after ? ids.indexOf(after) + 1 : 0;
        const page = ids.slice(from, from + limit);
        pages.push(page.length);
        return { docs: page.map(userSnap) };
      },
    };
  }

  return {
    pages,
    batch: refuse,
    runTransaction: refuse,
    collection: (name) => {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        orderBy: () => ({ limit: (n) => usersQuery(n, null) }),
      };
    },
  };
}

const ACCOUNTS = {
  ana: {
    profile: { runMode: "structured" },
    plan: { runPlan: { mode: "structured" } },
    runs: [{ planMode: "structured" }, { planMode: "freeform" }],
  },
  ben: { profile: { runMode: "structured" }, plan: { runDays: [] } },
  cy: {
    profile: { runMode: "freeform" },
    plan: { runPlan: { mode: "structured" } },
  },
  dee: {
    profile: { runMode: "race_prep" },
    plan: { runPlan: { mode: "race_prep" } },
    runs: [{ planMode: "structured" }, { planMode: "structured" }],
  },
  eve: { profile: {} },
};

describe("countStructuredRunMode", () => {
  it("counts each place the mode is held, and the accounts holding it", async () => {
    const report = await countStructuredRunMode(fakeFirestore(ACCOUNTS));
    expect(report).toEqual({
      accounts: 5,
      profiles: 2,
      plans: 2,
      // ana in both places counts once.
      holding: 3,
      // History, which does not hold the removal back.
      savedRuns: { runs: 3, accounts: 2 },
    });
  });

  it("names no account unless asked", async () => {
    const report = await countStructuredRunMode(fakeFirestore(ACCOUNTS));
    expect(JSON.stringify(report)).not.toMatch(/ana|ben|cy|dee|eve/);
  });

  it("lists the uids behind the flag", async () => {
    const report = await countStructuredRunMode(fakeFirestore(ACCOUNTS), {
      listUids: true,
    });
    expect(report.uids).toEqual({
      profiles: ["ana", "ben"],
      plans: ["ana", "cy"],
      savedRuns: ["ana", "dee"],
    });
  });

  it("reads every page of accounts", async () => {
    const accounts = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        `u${i}`,
        { profile: { runMode: i === 6 ? "structured" : "freeform" } },
      ])
    );
    const firestore = fakeFirestore(accounts);
    const report = await countStructuredRunMode(firestore, { pageSize: 3 });
    expect(report.accounts).toBe(7);
    expect(report.profiles).toBe(1);
    expect(firestore.pages).toEqual([3, 3, 1]);
  });

  it("says when the removal can merge, and when it cannot", async () => {
    expect(
      verdict(
        await countStructuredRunMode(
          fakeFirestore({ eve: { profile: { runMode: "freeform" } } })
        )
      )
    ).toBe("No account holds the structured run mode: the removal can merge.");
    expect(
      verdict(await countStructuredRunMode(fakeFirestore(ACCOUNTS)))
    ).toMatch(/^3 account\(s\) still hold/);
  });
});
