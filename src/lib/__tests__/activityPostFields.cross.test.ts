/**
 * A feed post's fields, on both sides of the write.
 *
 * `postActivity` sends a post to `activities/{id}`; firestore.rules checks
 * it against a closed field list and refuses the whole write when it
 * carries one more. The two lists drifted: every share sheet sends a
 * `caption` when one is typed, the rules list did not have it, and every
 * captioned post was refused. The rules suite had a "regression guard for
 * postActivity" that sent a hand-written post, and its author left the
 * caption out, so it passed. A hand-kept copy of a list is the thing that
 * drifts.
 *
 * This file compares the rules list with `ACTIVITY_POST_FIELDS`, the
 * runtime copy of `ActivityPost`'s keys, in both directions:
 *   - a field the type has and the rules lack is a post that fails on a
 *     phone;
 *   - a field the rules allow and no post can carry is an allowance
 *     nothing uses.
 * And it pins the caption limit to the one number the share sheets cut
 * at, and the session savers to the type, so an extra field on their
 * payloads is a compile error rather than a refused write.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { globSync } from "tinyglobby";

import {
  ACTIVITY_POST_FIELDS,
  ACTIVITY_POST_STAMPS,
  CAPTION_MAX,
} from "../activityPost";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** The `allow create` rule inside `match /activities/{activityId}`. */
function activitiesCreateRule(): string {
  const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
  const block = rules.indexOf("match /activities/{activityId}");
  const create = rules.indexOf("allow create:", block);
  const update = rules.indexOf("allow update:", create);
  if (block < 0 || create < 0 || update < 0) {
    throw new Error("could not locate the activities create rule");
  }
  return rules.slice(create, update);
}

describe("feed post fields: postActivity and firestore.rules agree", () => {
  it("the rules allow exactly the fields a post can carry, plus postActivity's stamps", () => {
    const list = activitiesCreateRule().match(
      /keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/
    );
    expect(list, "the create rule has a hasOnly field list").toBeTruthy();
    const allowed = [...list![1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect([...allowed].sort()).toEqual(
      [...ACTIVITY_POST_FIELDS, ...ACTIVITY_POST_STAMPS].sort()
    );
  });

  it("the rules hold a caption to the share sheets' limit", () => {
    const rule = activitiesCreateRule();
    const cap = rule.match(/caption\.size\(\) <= (\d+)/);
    expect(cap, "the create rule caps the caption's length").toBeTruthy();
    expect(Number(cap![1])).toBe(CAPTION_MAX);
    expect(rule).toContain("request.resource.data.caption is string");
  });

  it("the share sheets take their caption limit from the one constant", () => {
    // A sheet with its own copy can drift from the rules one edit at a time.
    const src = resolve(repoRoot, "src");
    const definers = globSync("**/*.{ts,tsx}", { cwd: src, absolute: true })
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => /\bconst CAPTION_MAX\s*=/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(repoRoot.length + 1));
    expect(definers).toEqual(["src/lib/activityPost.ts"]);
  });

  it("the session savers type their posts, so an unknown field fails the build", () => {
    /* The three savers build the post in a callback that createSessionShare
       hands to postActivity and to the offline queue. TypeScript checks a
       literal's extra fields only where it meets a declared type, so each
       callback's return is annotated: an unannotated one would carry any
       field straight to the rules. */
    for (const file of [
      "src/pages/RunSummary.tsx",
      "src/pages/Routine.tsx",
      "src/features/program/useProgram.ts",
    ]) {
      const source = readFileSync(resolve(repoRoot, file), "utf8");
      expect(source, file).toContain("createSessionShare(");
      expect(source, file).toContain("payload: (decision): ActivityPost => ({");
      expect(source, file).not.toContain("postActivity(");
    }
    const helper = readFileSync(
      resolve(repoRoot, "src/lib/sessionPost.ts"),
      "utf8"
    );
    expect(helper).toContain(
      "payload: (decision: ShareDecision) => ActivityPost;"
    );
    expect(helper).toContain("postActivity(payload)");
  });
});
