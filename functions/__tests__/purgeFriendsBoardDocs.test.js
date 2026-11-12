/**
 * The friends board's clean-up script (Trim1 call 3(a)): it deletes the
 * stored weeks and removes the stored answer, and touches nothing else.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { purgeFriendsBoardDocs } = require("../scripts/purgeFriendsBoardDocs");

const FIELD_DELETE = Symbol("FieldValue.delete()");

/** Just enough Firestore: two collections, an `in` filter, and batches. */
function fakeFirestore({ weeks, users }) {
  const deleted = [];
  const updated = [];
  let commits = 0;
  const snap = (prefix, entries) => ({
    docs: entries.map(([id, data]) => ({
      ref: { path: `${prefix}/${id}` },
      data: () => data,
    })),
  });
  return {
    deleted,
    updated,
    commits: () => commits,
    collection: (name) => {
      if (name === "friendsBoard")
        return { get: async () => snap(name, Object.entries(weeks)) };
      expect(name).toBe("users");
      return {
        where: (field, op, values) => {
          expect([field, op]).toEqual(["showWeekOnBoard", "in"]);
          return {
            get: async () =>
              snap(
                name,
                Object.entries(users).filter(([, data]) =>
                  values.includes(data.showWeekOnBoard)
                )
              ),
          };
        },
      };
    },
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      update: (ref, data) => updated.push([ref.path, data]),
      commit: async () => {
        commits += 1;
      },
    }),
  };
}

const stored = () =>
  fakeFirestore({
    weeks: { ana: { sessions: 3 }, ben: { sessions: 1 } },
    users: {
      ana: { showWeekOnBoard: true, displayName: "Ana" },
      ben: { showWeekOnBoard: false },
      // Never asked: no field, so nothing to remove.
      cy: { displayName: "Cy" },
    },
  });

describe("purgeFriendsBoardDocs", () => {
  it("a dry run counts and changes nothing", async () => {
    const firestore = stored();
    const report = await purgeFriendsBoardDocs({
      firestore,
      fieldDelete: FIELD_DELETE,
    });
    expect(report).toEqual({
      weeks: 2,
      answers: 2,
      weeksDeleted: 0,
      answersRemoved: 0,
      dryRun: true,
    });
    expect(firestore.deleted).toEqual([]);
    expect(firestore.updated).toEqual([]);
    expect(firestore.commits()).toBe(0);
  });

  it("deletes every stored week and removes both answers, yes and no", async () => {
    const firestore = stored();
    const report = await purgeFriendsBoardDocs({
      firestore,
      fieldDelete: FIELD_DELETE,
      apply: true,
    });
    expect(report).toMatchObject({
      weeksDeleted: 2,
      answersRemoved: 2,
      dryRun: false,
    });
    expect(firestore.deleted).toEqual(["friendsBoard/ana", "friendsBoard/ben"]);
    // Only the one field is named, so nothing else on the user changes.
    expect(firestore.updated).toEqual([
      ["users/ana", { showWeekOnBoard: FIELD_DELETE }],
      ["users/ben", { showWeekOnBoard: FIELD_DELETE }],
    ]);
  });

  it("someone never asked is not written to", async () => {
    const firestore = stored();
    await purgeFriendsBoardDocs({
      firestore,
      fieldDelete: FIELD_DELETE,
      apply: true,
    });
    expect(firestore.updated.map(([path]) => path)).not.toContain("users/cy");
  });

  it("works through more weeks than one batch holds", async () => {
    const weeks = Object.fromEntries(
      Array.from({ length: 950 }, (_, i) => [`u${i}`, { sessions: 1 }])
    );
    const firestore = fakeFirestore({ weeks, users: {} });
    const report = await purgeFriendsBoardDocs({
      firestore,
      fieldDelete: FIELD_DELETE,
      apply: true,
    });
    expect(report.weeksDeleted).toBe(950);
    expect(firestore.deleted).toHaveLength(950);
    expect(firestore.commits()).toBe(3);
  });

  it("a second run finds nothing", async () => {
    const firestore = fakeFirestore({ weeks: {}, users: { cy: {} } });
    const report = await purgeFriendsBoardDocs({
      firestore,
      fieldDelete: FIELD_DELETE,
      apply: true,
    });
    expect(report).toMatchObject({
      weeks: 0,
      answers: 0,
      weeksDeleted: 0,
      answersRemoved: 0,
    });
    expect(firestore.commits()).toBe(0);
  });
});
