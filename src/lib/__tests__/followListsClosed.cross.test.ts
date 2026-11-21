/**
 * The follow lists are closed only to an app that no longer reads them.
 *
 * `firestore.rules` keeps `followers/{uid}/users` and `following/{uid}/users`
 * to their owner (Polish4 call 1). A profile's two numbers were counted from
 * those lists, so closing them needs three things in the same tree: the
 * server's counts (`functions/lib/followCounts.js`), the rule that lets a
 * profile read one, and a reader that takes a refused count of someone
 * else's list as nobody instead of failing (`countOrNobody`).
 *
 * This fails when the rules are closed and any of the three is missing.
 * That is the state of a branch that closes the lists before the counts
 * have merged: merge the counts first, then bring this branch up to main.
 * It also stops a later change removing the count reader, or the counts,
 * from under closed lists.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

const rules = read("firestore.rules");

/** The `allow read` of one follow collection's block, as written. */
function readRuleOf(collection: "followers" | "following"): string {
  const start = rules.indexOf(`match /${collection}/{uid}/users/{`);
  expect(start, `firestore.rules has no ${collection} block`).toBeGreaterThan(
    -1
  );
  const from = rules.indexOf("allow read:", start);
  return rules.slice(from, rules.indexOf(";", from) + 1);
}

/** Open to any signed-in account, as the lists were before Polish4. */
const openToAnyone = (rule: string) =>
  /^allow read:\s*if request\.auth != null;$/.test(rule.trim());

const closed = (["followers", "following"] as const).filter(
  (collection) => !openToAnyone(readRuleOf(collection))
);

const BEFORE_THE_COUNTS =
  "The follow lists are closed in firestore.rules, and the app still needs " +
  "them. Merge the server-kept follow counts first (functions/lib/" +
  "followCounts.js, getFollowCounts), then bring this branch up to main.";

describe("closing the follow lists", () => {
  it("closes both lists or neither", () => {
    expect([0, 2]).toContain(closed.length);
  });

  it.runIf(closed.length > 0)("has the server's counts to read instead", () => {
    expect(
      existsSync(resolve(repoRoot, "functions/lib/followCounts.js")),
      BEFORE_THE_COUNTS
    ).toBe(true);
    expect(rules, BEFORE_THE_COUNTS).toContain("match /followCounts/{uid}");
  });

  it.runIf(closed.length > 0)(
    "has a reader that takes a refused count as nobody",
    () => {
      const api = read("src/lib/socialApi.ts");
      expect(api, BEFORE_THE_COUNTS).toContain('"followCounts"');
      expect(api, BEFORE_THE_COUNTS).toContain("countOrNobody");
      expect(api, BEFORE_THE_COUNTS).toContain('"permission-denied"');
    }
  );

  it.runIf(closed.length > 0)(
    "leaves a follow readable by the two people on it",
    () => {
      expect(readRuleOf("followers")).toContain(
        "request.auth.uid == followerUid"
      );
      expect(readRuleOf("following")).toContain(
        "request.auth.uid == targetUid"
      );
      for (const collection of ["followers", "following"] as const) {
        expect(readRuleOf(collection)).toContain("request.auth.uid == uid");
      }
    }
  );
});
