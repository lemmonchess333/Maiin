/**
 * Partner streaks' clean-up script (Trim1 call 3(b)): it deletes the
 * stored bonds and touches nothing else.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { purgePartnerBondDocs } = require("../scripts/purgePartnerBondDocs");

/** Just enough Firestore: one collection and batches. */
function fakeFirestore(bondIds) {
  const deleted = [];
  const asked = [];
  let commits = 0;
  return {
    deleted,
    asked,
    commits: () => commits,
    collection: (name) => {
      asked.push(name);
      return {
        get: async () => ({
          docs: bondIds.map((id) => ({ ref: { path: `${name}/${id}` } })),
        }),
      };
    },
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {
        commits += 1;
      },
    }),
  };
}

describe("purgePartnerBondDocs", () => {
  it("a dry run counts and changes nothing", async () => {
    const firestore = fakeFirestore(["ana__ben", "ana__cy"]);
    expect(await purgePartnerBondDocs({ firestore })).toEqual({
      bonds: 2,
      deleted: 0,
      dryRun: true,
    });
    expect(firestore.deleted).toEqual([]);
    expect(firestore.commits()).toBe(0);
  });

  it("deletes every stored bond, and reads no other collection", async () => {
    const firestore = fakeFirestore(["ana__ben", "ana__cy"]);
    const report = await purgePartnerBondDocs({ firestore, apply: true });
    expect(report).toEqual({ bonds: 2, deleted: 2, dryRun: false });
    expect(firestore.deleted).toEqual([
      "partnerBonds/ana__ben",
      "partnerBonds/ana__cy",
    ]);
    // The follows a bond stood on are not its to touch.
    expect(firestore.asked).toEqual(["partnerBonds"]);
  });

  it("works through more bonds than one batch holds", async () => {
    const ids = Array.from({ length: 950 }, (_, i) => `a${i}__b${i}`);
    const firestore = fakeFirestore(ids);
    const report = await purgePartnerBondDocs({ firestore, apply: true });
    expect(report.deleted).toBe(950);
    expect(firestore.deleted).toHaveLength(950);
    expect(firestore.commits()).toBe(3);
  });

  it("a second run finds nothing", async () => {
    const firestore = fakeFirestore([]);
    const report = await purgePartnerBondDocs({ firestore, apply: true });
    expect(report).toEqual({ bonds: 0, deleted: 0, dryRun: false });
    expect(firestore.commits()).toBe(0);
  });

  it("the report names no bond", async () => {
    const firestore = fakeFirestore(["ana__ben"]);
    const report = await purgePartnerBondDocs({ firestore, apply: true });
    expect(JSON.stringify(report)).not.toContain("ana");
  });
});
