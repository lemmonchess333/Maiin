/**
 * The retired profile fields stay retired: nothing in `src/` or
 * `functions/` reads or writes them (App1 Q24, 13 November 2026).
 *
 * The registry marks them (`retired` in profileFieldRegistry.ts), the type
 * no longer declares them, the sanitiser drops them, and
 * `functions/scripts/stripRetiredProfileFields.js` deletes the stored
 * copies. The rules still allow them, for older builds only. What none of
 * those stops is new code reaching for one through a cast or a raw
 * `DocumentData`, and a field that gains a reader while the strip script
 * deletes it is data loss. This scan fails first.
 *
 * It began as a narrower pin on `tdeeBase` and `aiCalorieAdjustment`, kept
 * because a comment in goalWeightPlan.ts credited the adaptive engine with
 * reading `tdeeBase` when nothing did. A general detector was declined then
 * because most of the dead fields were deliberate retentions; they are
 * retired now, so the list is the registry's, not a hand-kept one.
 *
 * Only names no other document uses are scanned. `email`, `goal`,
 * `currentStreak`, `longestStreak`, `targetCarbs`, `targetFat` and
 * `updatedAt` are also real fields elsewhere (the Auth user, `program`, the
 * streaks document and the public profile, the daily nutrition snapshot,
 * most collections), so a scan by name cannot tell them apart. Their
 * writers are pinned where they write: setup (Onboarding.test), the
 * goal-weight recipe (goalWeightPlan.test), the weigh-in
 * (everydayLogging.test), the custom target (NutritionSection.test), the
 * streak save (useStreaksSave.test) and the RevenueCat sync
 * (revenueCatWebhook.test); sign-up's document is the rules suite's
 * `signupProfile`.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { RETIRED_PROFILE_FIELDS } from "../profileFieldRegistry";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(p) && !/__tests__|\.test\.|\/test\//.test(p))
      out.push(p);
  }
  return out;
}

/** Comments and string literals are neither reads nor writes: the
 *  registry, the sanitiser's list and the strip script name every field
 *  as a string, and the comments that explain the retirement name them
 *  too. */
function stripInert(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, " ");
}

const SOURCES = [
  ...walk(resolve(repoRoot, "src")),
  ...walk(resolve(repoRoot, "functions")),
].map((p) => ({
  rel: p.slice(repoRoot.length + 1).replaceAll("\\", "/"),
  text: stripInert(readFileSync(p, "utf8")),
}));

/** A read is a property access or a destructure; a write or a declaration
 *  is a key (`field:` in an object literal, a type or an interface). */
function useSites(field: string): string[] {
  const access = new RegExp(`\\.\\s*${field}\\b`);
  const destructure = new RegExp(`\\{[^{}]*\\b${field}\\b[^{}]*\\}\\s*=`);
  const key = new RegExp(`\\b${field}\\s*\\??\\s*:`);
  return SOURCES.filter(
    (s) => access.test(s.text) || destructure.test(s.text) || key.test(s.text)
  ).map((s) => s.rel);
}

/** Shared names: see the header for where their writers are pinned. */
const SHARED_NAMES = new Set([
  "email",
  "goal",
  "currentStreak",
  "longestStreak",
  "targetCarbs",
  "targetFat",
  "updatedAt",
]);

const SCANNED = RETIRED_PROFILE_FIELDS.filter((f) => !SHARED_NAMES.has(f));

describe("retired profile fields", () => {
  it("scans enough source to mean something", () => {
    // Guards the guard: a walk that silently returned nothing would make
    // every assertion below vacuously true.
    expect(SOURCES.length).toBeGreaterThan(300);
    expect(SOURCES.some((s) => s.rel.startsWith("functions/"))).toBe(true);
  });

  it("detects a field that IS used", () => {
    // Positive control: `targetCalories` is read and written all over.
    expect(useSites("targetCalories").length).toBeGreaterThan(3);
  });

  it("scans every retired field that has a name of its own", () => {
    // A shared name listed above that is not retired, or a retired field
    // that dropped out of the scan, would make the list below lie.
    for (const name of SHARED_NAMES)
      expect(RETIRED_PROFILE_FIELDS).toContain(name);
    expect(SCANNED.length).toBe(
      RETIRED_PROFILE_FIELDS.length - SHARED_NAMES.size
    );
  });

  it.each(SCANNED)("nothing reads or writes %s", (field) => {
    expect(useSites(field)).toEqual([]);
  });

  it("nothing reads or writes program.startWeight", () => {
    // A key inside `program`, retired with the rest. TrendWeight's own
    // `startWeight` is a local, not a key.
    expect(useSites("startWeight")).toEqual([]);
  });
});
