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
import {
  FASTEST_EFFORT_METERS,
  FIRST_DISTANCE_METERS,
  MAX_POST_MOMENTS,
  MOMENT_EXERCISE_MAX,
  MOMENT_LIMITS,
  POST_MOMENT_KEYS,
  POST_MOMENT_KINDS,
  STREAK_MILESTONES,
} from "../postMoments";

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
    /* A saver hands createSessionShare a callback that builds the post,
       and createSessionShare posts or queues it. TypeScript checks a
       literal's extra fields only where it meets a declared type, so every
       post is built where one is declared: by liftPost or runPost, each
       declared to return ActivityPost. An undeclared builder would carry
       any field straight to the rules. */
    const read = (file: string) =>
      readFileSync(resolve(repoRoot, file), "utf8");
    const declaration = (source: string, name: string) => {
      const at = source.indexOf(`export function ${name}(`);
      expect(at, name).toBeGreaterThanOrEqual(0);
      return source.slice(at, source.indexOf("\nexport ", at));
    };
    expect(declaration(read("src/lib/liftPost.ts"), "liftPost")).toContain(
      "): ActivityPost {"
    );
    const runs = read("src/lib/runCompletion.ts");
    expect(declaration(runs, "runPost")).toContain("): ActivityPost {");

    for (const [file, builder] of [
      ["src/lib/liftCompletion.ts", "liftPost"],
      ["src/lib/runCompletion.ts", "runPost"],
    ]) {
      const source = read(file);
      expect(source, file).toContain("createSessionShare(");
      expect(source, file).toMatch(
        new RegExp(`payload: \\(decision\\) =>\\s+${builder}\\(`)
      );
      expect(source, file).not.toContain("postActivity(");
    }
    // The finish screens save through those modules, never by hand.
    for (const [file, call] of [
      ["src/pages/Routine.tsx", "completeLift("],
      ["src/features/program/useProgram.ts", "completeLift("],
      ["src/pages/RunSummary.tsx", "completeRun("],
    ]) {
      const source = read(file);
      expect(source, file).toContain(call);
      expect(source, file).not.toContain("createSessionShare(");
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

/** The rules' `validPostMoment`, each kind's clause by its kind. */
function momentClauses(): Map<string, string> {
  const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
  const start = rules.indexOf("function validPostMoment(m) {");
  const end = rules.indexOf("\n    }\n", start);
  if (start < 0 || end < 0) throw new Error("could not locate validPostMoment");
  const body = rules.slice(start, end);
  const marks = [...body.matchAll(/m\.kind == '([A-Za-z]+)'/g)];
  const clauses = new Map<string, string>();
  marks.forEach((mark, i) => {
    const next = marks[i + 1]?.index ?? body.length;
    clauses.set(mark[1], body.slice(mark.index, next));
  });
  return clauses;
}

const numbersIn = (list: string) =>
  list.split(",").map((n) => Number(n.trim()));

/** The list a field is held to in a kind's clause (`m.days in [...]`). */
function listIn(clause: string, field: string): number[] {
  const at = clause.indexOf(`m.${field} in [`);
  expect(at, `${field} is held to a list`).toBeGreaterThanOrEqual(0);
  const open = clause.indexOf("[", at);
  return numbersIn(clause.slice(open + 1, clause.indexOf("]", open)));
}

/** A field's upper bound in a kind's clause (`m.x <= n`, or its size). */
function upperBound(clause: string, field: string): number {
  for (const form of [`m.${field}.size() <= `, `m.${field} <= `]) {
    const at = clause.indexOf(form);
    if (at >= 0) return parseInt(clause.slice(at + form.length), 10);
  }
  throw new Error(`no upper bound on ${field}`);
}

describe("post moments: postMoments.ts and firestore.rules agree", () => {
  it("the create rule holds a post to MAX_POST_MOMENTS and checks each one", () => {
    const rule = activitiesCreateRule();
    expect(rule).toContain("request.resource.data.moments is list");
    const cap = rule.match(/moments\.size\(\) <= (\d+)/);
    expect(cap, "the create rule caps the moments").toBeTruthy();
    expect(Number(cap![1])).toBe(MAX_POST_MOMENTS);
    // Every index under the cap is checked, and none past it.
    const checked = [
      ...rule.matchAll(
        /validPostMoment\(request\.resource\.data\.moments\[(\d+)\]\)/g
      ),
    ].map((m) => Number(m[1]));
    expect(checked).toEqual(
      Array.from({ length: MAX_POST_MOMENTS }, (_, i) => i)
    );
  });

  it("the rules know exactly the module's kinds, each with exactly its keys", () => {
    const clauses = momentClauses();
    expect([...clauses.keys()].sort()).toEqual([...POST_MOMENT_KINDS].sort());
    for (const kind of POST_MOMENT_KINDS) {
      const clause = clauses.get(kind)!;
      const only = clause.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/);
      expect(only, `${kind} has a key list`).toBeTruthy();
      const keys = [...only![1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
      expect(keys.sort(), kind).toEqual([...POST_MOMENT_KEYS[kind]].sort());
      // A kind with keys beyond `kind` requires every one of them.
      if (keys.length > 1) {
        const all = clause.match(/keys\(\)\.hasAll\(\[([^\]]*)\]\)/);
        expect(all?.[1], `${kind} requires its keys`).toBe(only![1]);
      }
    }
  });

  it("the rules' lists are the module's: first distances, effort distances, streak days", () => {
    const clauses = momentClauses();
    expect(listIn(clauses.get("firstDistance")!, "meters")).toEqual([
      ...FIRST_DISTANCE_METERS,
    ]);
    expect(listIn(clauses.get("fastestEffort")!, "meters")).toEqual([
      ...FASTEST_EFFORT_METERS,
    ]);
    expect(listIn(clauses.get("streak")!, "days")).toEqual([
      ...STREAK_MILESTONES,
    ]);
  });

  it("the rules hold each number and the exercise name to the module's bounds", () => {
    const clauses = momentClauses();
    const pr = clauses.get("pr")!;
    expect(upperBound(pr, "exercise")).toBe(MOMENT_EXERCISE_MAX);
    expect(upperBound(pr, "weightKg")).toBe(MOMENT_LIMITS.weightKgMax);
    expect(upperBound(pr, "reps")).toBe(MOMENT_LIMITS.repsMax);
    expect(upperBound(clauses.get("longestRun")!, "meters")).toBe(
      MOMENT_LIMITS.metersMax
    );
    expect(upperBound(clauses.get("fastestEffort")!, "seconds")).toBe(
      MOMENT_LIMITS.secondsMax
    );
    expect(upperBound(clauses.get("planWeek")!, "weeks")).toBe(
      MOMENT_LIMITS.weeksMax
    );
  });
});
