/**
 * The strip of the retired profile fields (App1 Q24): a dry run counts and
 * writes nothing; --apply deletes exactly the retired paths, stored nulls
 * included, and touches nothing else; it pages, resumes, and a second run
 * finds nothing.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  memoryFirestore,
  fieldDelete,
} = require("./helpers/memoryFirestore.cjs");
const {
  RETIRED_PROFILE_PATHS,
  storedRetiredPaths,
  stripRetiredProfileFields,
  parseArgs,
} = require("../scripts/stripRetiredProfileFields");
const { RETIRED_PROFILE_FIELDS } = require("../profileSanitizer");

const DELETE = fieldDelete();

/** A profile as an older build left it: live fields beside retired ones. */
const olderProfile = () => ({
  displayName: "Ana",
  weightKg: 70,
  targetCalories: 2200,
  targetProtein: 150,
  shareDefaults: { run: "followers" },
  program: { goal: "cut", startWeight: 72, currentPhase: "base" },
  email: "ana@example.com",
  currentStreak: 3,
  longestStreak: 9,
  lastLogDate: null,
  adjustCaloriesForTraining: true,
  tdeeBase: 2400,
  aiCalorieAdjustment: 0,
  targetCarbs: 230,
  targetFat: 70,
});

/** What is left of it once stripped: everything that is still live. */
const strippedProfile = () => ({
  displayName: "Ana",
  weightKg: 70,
  targetCalories: 2200,
  targetProtein: 150,
  shareDefaults: { run: "followers" },
  program: { goal: "cut", currentPhase: "base" },
});

const seeded = () =>
  memoryFirestore({
    "users/ana": olderProfile(),
    // Only nulls: a sign-up that never finished setup.
    "users/ben": {
      displayName: "",
      lastLogDate: null,
      onboardingComplete: false,
    },
    // Made by this release: nothing retired, so nothing to write.
    "users/cy": strippedProfile(),
    // Not a profile: a subcollection document is never read.
    "users/ana/streaks/data": { currentStreak: 3, longestStreak: 9 },
  });

describe("stripRetiredProfileFields", () => {
  it("strips exactly the sanitiser's retired fields and program.startWeight", () => {
    // One list (pinned to the registry by profileFieldRegistry.test.ts).
    expect(RETIRED_PROFILE_PATHS).toEqual([
      ...RETIRED_PROFILE_FIELDS,
      "program.startWeight",
    ]);
  });

  it("finds a stored null, and a key inside the program map", () => {
    expect(
      storedRetiredPaths({ lastLogDate: null, program: { startWeight: 0 } })
    ).toEqual(["lastLogDate", "program.startWeight"]);
    expect(
      storedRetiredPaths({ program: { goal: "cut" }, targetProtein: 150 })
    ).toEqual([]);
    expect(storedRetiredPaths({ program: null })).toEqual([]);
  });

  it("a dry run is the default, counts per field and writes nothing", async () => {
    const fs = seeded();
    const report = await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
    });
    expect(report).toMatchObject({
      scanned: 3,
      holding: 2,
      stripped: 0,
      dryRun: true,
    });
    expect(report.fields).toMatchObject({
      lastLogDate: 2,
      email: 1,
      currentStreak: 1,
      targetCarbs: 1,
      "program.startWeight": 1,
      macroTargets: 0,
      updatedAt: 0,
    });
    expect(fs.data.get("users/ana")).toEqual(olderProfile());
    expect(fs.operations).toEqual([]);
  });

  it("--apply deletes the retired paths and leaves every live field", async () => {
    const fs = seeded();
    const report = await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
    });
    expect(report).toMatchObject({ holding: 2, stripped: 2, dryRun: false });
    expect(fs.data.get("users/ana")).toEqual(strippedProfile());
    expect(fs.data.get("users/ben")).toEqual({
      displayName: "",
      onboardingComplete: false,
    });
    // Nothing retired: not written at all.
    expect(fs.operations.map(([, path]) => path)).toEqual([
      "users/ana",
      "users/ben",
    ]);
    // Only the profile document: the streaks document keeps its numbers.
    expect(fs.data.get("users/ana/streaks/data")).toEqual({
      currentStreak: 3,
      longestStreak: 9,
    });
  });

  it("a second run finds nothing to strip", async () => {
    const fs = seeded();
    await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
    });
    const again = await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
    });
    expect(again).toMatchObject({ scanned: 3, holding: 0, stripped: 0 });
  });

  it("pages through more profiles than one batch holds, and resumes after a checkpoint", async () => {
    const seed = {};
    for (let i = 0; i < 450; i += 1)
      seed[`users/u${String(i).padStart(3, "0")}`] = { lastLogDate: null };
    const fs = memoryFirestore(seed);
    const checkpoints = [];
    const first = await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
      maxPages: 1,
      onPage: (checkpoint) => checkpoints.push(checkpoint),
    });
    expect(first).toMatchObject({ scanned: 200, stripped: 200, pages: 1 });
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0].cursor).toBe("users/u199");

    const rest = await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
      after: parseArgs([
        "--project",
        "demo-tropos",
        "--after",
        checkpoints[0].cursor,
      ]).after,
    });
    expect(rest).toMatchObject({ scanned: 250, stripped: 250, pages: 2 });
    expect([...fs.data.values()].every((d) => !("lastLogDate" in d))).toBe(
      true
    );
  });

  it("a page that fails writes nothing, and running again finishes it", async () => {
    const fs = seeded();
    fs.failures.set("update:users/ben", new Error("NOT_FOUND"));
    await expect(
      stripRetiredProfileFields({
        firestore: fs,
        fieldDelete: DELETE,
        apply: true,
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(fs.data.get("users/ana")).toEqual(olderProfile());

    fs.failures.clear();
    await stripRetiredProfileFields({
      firestore: fs,
      fieldDelete: DELETE,
      apply: true,
    });
    expect(fs.data.get("users/ana")).toEqual(strippedProfile());
  });
});

describe("parseArgs", () => {
  it("is a dry run unless --apply is given, and needs a project", () => {
    expect(parseArgs(["--project", "adaptive-fitness-af8bb"])).toMatchObject({
      apply: false,
      projectId: "adaptive-fitness-af8bb",
    });
    expect(
      parseArgs(["--project", "adaptive-fitness-af8bb", "--apply"]).apply
    ).toBe(true);
    expect(() => parseArgs(["--apply"])).toThrow("--project");
    expect(() => parseArgs(["--project", "p1", "--force"])).toThrow(
      "Unknown argument"
    );
  });

  it("takes a checkpoint path as --after, and nothing else", () => {
    expect(parseArgs(["--project", "p1", "--after", "users/abc"]).after).toBe(
      "users/abc"
    );
    for (const bad of ["abc", "users/abc/streaks/data", "feeds/abc"])
      expect(() => parseArgs(["--project", "p1", "--after", bad])).toThrow(
        "--after"
      );
    expect(() => parseArgs(["--project", "p1", "--max-pages", "0"])).toThrow(
      "--max-pages"
    );
  });
});
