import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  memoryFirestore,
  fieldDelete,
} = require("./helpers/memoryFirestore.cjs");
const {
  RETIRED_FIELD_PATHS,
  retiredFieldPaths,
  stripRetiredProgramFields,
  parseArgs,
} = require("../scripts/stripRetiredProgramFields");

const plan = () => ({
  goal: "recomp",
  weekNumber: 3,
  updatedAt: 1000,
  workouts: [{ dayName: "Push", exercises: [] }],
  runDays: [{ id: "r1", dayIndex: 2, templateId: "easy_30" }],
  settings: { autoProgression: true, smallPlates: false },
});

/** A plan as stored before App1 Q24, with every retired field. */
const stored = () => ({
  ...plan(),
  fatigueScore: 12,
  plateauResponses: 1,
  templateId: "ppl_4day",
  recoveringMuscles: ["Chest"],
  settings: { autoProgression: true, smallPlates: false, microloading: true },
  trainingBlock: { id: "b1", focus: "strength", amnestyWeeksLeft: 3 },
  deloadSnapshot: { weekNumber: 3, workouts: [], fatigueScore: 12 },
});

/** What the strip leaves of `stored()`. */
const strippedPlan = () => ({
  ...plan(),
  trainingBlock: { id: "b1", focus: "strength" },
  deloadSnapshot: { weekNumber: 3, workouts: [] },
});

const run = (fs, options = {}) =>
  stripRetiredProgramFields({
    firestore: fs,
    fieldDelete: fieldDelete(),
    documentId: () => "__name__",
    ...options,
  });

describe("stripRetiredProgramFields", () => {
  it("lists the seven fields, a run day's templateId not among them", () => {
    expect(RETIRED_FIELD_PATHS.sort()).toEqual(
      [
        "deloadSnapshot.fatigueScore",
        "fatigueScore",
        "plateauResponses",
        "recoveringMuscles",
        "settings.microloading",
        "templateId",
        "trainingBlock.amnestyWeeksLeft",
      ].sort()
    );
    expect(retiredFieldPaths(plan())).toEqual([]);
  });

  it("defaults to a dry run that counts each field and writes nothing", async () => {
    const fs = memoryFirestore({
      "users/a/programState/current": stored(),
      "users/b/programState/current": { ...plan(), fatigueScore: 0 },
      "users/c/programState/current": plan(),
    });
    const report = await run(fs);
    expect(report).toMatchObject({
      plans: 3,
      carrying: 2,
      stripped: 0,
      dryRun: true,
    });
    expect(report.fields).toEqual({
      fatigueScore: 2,
      plateauResponses: 1,
      templateId: 1,
      recoveringMuscles: 1,
      "settings.microloading": 1,
      "trainingBlock.amnestyWeeksLeft": 1,
      "deloadSnapshot.fatigueScore": 1,
    });
    expect(fs.data.get("users/a/programState/current")).toEqual(stored());
    expect(fs.operations).toEqual([]);
  });

  it("with apply, deletes only the retired fields, and a second run finds none", async () => {
    const fs = memoryFirestore({
      "users/a/programState/current": stored(),
      "users/c/programState/current": plan(),
    });
    const report = await run(fs, { apply: true });
    expect(report).toMatchObject({ carrying: 1, stripped: 1, dryRun: false });
    expect(fs.data.get("users/a/programState/current")).toEqual(strippedPlan());
    // The run day keeps its template; a plan with nothing to strip is not
    // written at all.
    expect(
      fs.data.get("users/a/programState/current").runDays[0].templateId
    ).toBe("easy_30");
    expect(fs.operations).toEqual([["update", "users/a/programState/current"]]);
    const again = await run(fs, { apply: true });
    expect(again).toMatchObject({ carrying: 0, stripped: 0 });
  });

  it("reads only users' plans, never another programState document", async () => {
    const fs = memoryFirestore({
      "users/a/programState/current": stored(),
      "users/a/programState/draft": stored(),
      "elsewhere/x/programState/current": stored(),
      "users/a/programState/current/commandReceipts/cmd1": { kind: "x" },
    });
    const report = await run(fs, { apply: true });
    expect(report).toMatchObject({ scanned: 3, plans: 1, stripped: 1 });
    expect(fs.data.get("users/a/programState/draft")).toEqual(stored());
    expect(fs.data.get("elsewhere/x/programState/current")).toEqual(stored());
  });

  it("pages, prints a checkpoint, and resumes from it", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 205 }, (_, i) => [
        `users/u${String(i).padStart(3, "0")}/programState/current`,
        stored(),
      ])
    );
    const fs = memoryFirestore(entries);
    const checkpoints = [];
    const first = await run(fs, {
      apply: true,
      maxPages: 1,
      onPage: (c) => checkpoints.push(c),
    });
    expect(first.stripped).toBe(200);
    expect(checkpoints).toHaveLength(1);
    expect(first.cursor).toBe("users/u199/programState/current");
    const rest = await run(fs, { apply: true, after: first.cursor });
    expect(rest.stripped).toBe(5);
    for (const path of Object.keys(entries)) {
      expect(fs.data.get(path)).toEqual(strippedPlan());
    }
  });

  it("stops on a page whose plan went away, and a rerun finishes", async () => {
    const fs = memoryFirestore({
      "users/a/programState/current": stored(),
      "users/b/programState/current": stored(),
    });
    // The account deletion executor removes b's plan mid-run: the update
    // fails rather than make a document, as Firestore's does.
    fs.failures.set(
      "update:users/b/programState/current",
      new Error("NOT_FOUND")
    );
    await expect(run(fs, { apply: true })).rejects.toThrow("NOT_FOUND");
    expect(fs.data.get("users/a/programState/current")).toEqual(stored());
    fs.failures.clear();
    fs.data.delete("users/b/programState/current");
    const rerun = await run(fs, { apply: true });
    expect(rerun.stripped).toBe(1);
    expect(fs.data.has("users/b/programState/current")).toBe(false);
  });
});

describe("parseArgs", () => {
  it("needs an explicit project and writes only with --apply", () => {
    expect(() => parseArgs([])).toThrow("--project");
    expect(parseArgs(["--project", "demo-tropos"])).toMatchObject({
      apply: false,
      projectId: "demo-tropos",
    });
    expect(parseArgs(["--project", "demo-tropos", "--apply"]).apply).toBe(true);
  });

  it("takes a printed checkpoint and refuses anything else", () => {
    expect(
      parseArgs([
        "--project",
        "demo-tropos",
        "--after",
        "users/u1/programState/current",
      ]).after
    ).toBe("users/u1/programState/current");
    expect(() =>
      parseArgs(["--project", "demo-tropos", "--after", "users/u1"])
    ).toThrow("--after");
    expect(() => parseArgs(["--project", "demo-tropos", "--force"])).toThrow(
      "Unknown argument"
    );
  });
});
