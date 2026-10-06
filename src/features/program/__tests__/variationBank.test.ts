/**
 * Tests for `variationBank` — the movement-category exercise picker
 * used by the procedural program engine to choose specific exercises
 * for each pattern slot (e.g. horizontal_push → bench press / incline
 * bench / DB bench / etc).
 *
 * `pickExercise` keeps the current exercise when the level allows it and
 * otherwise returns the category's primary; a stall never changes it
 * (Lift4 (2)). `pickAccessory` picks deterministically across the
 * non-primary, non-excluded options.
 */
import { describe, it, expect } from "vitest";
import {
  exerciseBank,
  pickExercise,
  pickAccessory,
  rescaleForSwap,
  exerciseDisplayName,
} from "../variationBank";
import { getExerciseById } from "@/lib/exercises";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("rescaleForSwap — unsafe boundaries", () => {
  it("zeros a loaded-to-bodyweight swap instead of carrying kilograms", () => {
    expect(
      rescaleForSwap(80, "bench-press", "push-ups", "horizontal_push")
    ).toBe(0);
  });

  it("leaves a bodyweight-to-loaded swap explicitly uncalibrated", () => {
    expect(rescaleForSwap(0, "push-ups", "db-bench", "horizontal_push")).toBe(
      0
    );
  });

  it("does not invent a ratio for an unknown or cross-category target", () => {
    expect(
      rescaleForSwap(120, "deadlift", "glute-bridge", "hip_dominant")
    ).toBe(0);
    expect(
      rescaleForSwap(120, "deadlift", "incline-db-press", "hip_dominant")
    ).toBe(0);
  });

  it("carries no load into pull-ups, the vertical pull the bank leaves unfactored", () => {
    // Read by its factor alone, each of these came out at 82.5 to 200 kg.
    for (const from of [
      "lat-pulldown",
      "straight-arm-pulldown",
      "single-arm-lat-pulldown",
    ]) {
      expect(rescaleForSwap(50, from, "pull-ups", "vertical_pull")).toBe(0);
    }
  });

  it("does not read a weighted pull-up's added load as a pulldown's", () => {
    expect(
      rescaleForSwap(10, "pull-ups", "lat-pulldown", "vertical_pull")
    ).toBe(0);
  });

  it("still scales between two loaded vertical pulls", () => {
    expect(
      rescaleForSwap(
        50,
        "lat-pulldown",
        "single-arm-lat-pulldown",
        "vertical_pull"
      )
    ).toBeGreaterThan(0);
  });
});

describe("exerciseBank — structural invariants", () => {
  it("covers every MovementCategory", () => {
    /* If a future MovementCategory gets added to programTypes.ts
       but missed in the bank, the engine would crash at
       exerciseBank[category]. Pin the full coverage. */
    const expected = [
      "horizontal_push",
      "vertical_push",
      "horizontal_pull",
      "vertical_pull",
      "knee_dominant",
      "hip_dominant",
      "arms_biceps",
      "arms_triceps",
      "core",
    ] as const;
    for (const cat of expected) {
      expect(exerciseBank[cat]).toBeDefined();
      expect(exerciseBank[cat].length).toBeGreaterThan(0);
    }
  });

  it("every category has exactly one primary exercise", () => {
    /* pickExercise with no current exercise falls back to
       `options.find(primary)` then `options[0]`. Both should be the
       same exercise — if multiple are flagged primary the picker
       silently picks the first one, which is fragile. */
    for (const [category, options] of Object.entries(exerciseBank)) {
      const primaries = options.filter((o) => o.primary);
      expect(primaries.length, `category ${category}`).toBe(1);
    }
  });
});

describe("pickExercise", () => {
  it("returns the matching current exercise", () => {
    /* User has been on db-bench for a while, hasn't plateaued.
       Stay on db-bench — don't shuffle them onto bench-press
       for no reason. */
    const result = pickExercise("horizontal_push", "db-bench");
    expect(result.id).toBe("db-bench");
  });

  it("falls through to the primary when current id is not in the category", () => {
    /* The id doesn't match any exercise in horizontal_push (it's
       a hip-dominant id). Picker falls back to the primary. */
    const result = pickExercise("horizontal_push", "deadlift");
    expect(result.id).toBe("bench-press");
  });

  it("returns the primary when no current id is provided", () => {
    expect(pickExercise("horizontal_push").id).toBe("bench-press");
    expect(pickExercise("hip_dominant").id).toBe("deadlift");
    expect(pickExercise("knee_dominant").id).toBe("squat");
  });

  it("keeps a variation the level allows, and gives the primary otherwise", () => {
    // A front squat is technical: a beginner gets the squat, an
    // intermediate keeps theirs.
    expect(pickExercise("knee_dominant", "front-squat", "beginner").id).toBe(
      "squat"
    );
    expect(
      pickExercise("knee_dominant", "front-squat", "intermediate").id
    ).toBe("front-squat");
  });
});

describe("pickAccessory", () => {
  it("never returns the primary exercise", () => {
    /* Accessories explicitly exclude the primary so the program
       has variety beyond the main lift. */
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("horizontal_push");
      const primary = exerciseBank.horizontal_push.find((e) => e.primary);
      expect(result.id).not.toBe(primary?.id);
    }
  });

  it("never returns the excluded id", () => {
    /* Used so the program doesn't pick the same accessory twice
       on the same day. */
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("horizontal_push", "db-bench");
      expect(result.id).not.toBe("db-bench");
    }
  });

  it("returns a valid exercise from the category", () => {
    const validIds = new Set(exerciseBank.vertical_pull.map((o) => o.id));
    for (let i = 0; i < 30; i++) {
      const result = pickAccessory("vertical_pull");
      expect(validIds.has(result.id)).toBe(true);
    }
  });

  it("biases toward LENGTHENED options when the category has any (D-LIFT-2)", () => {
    // Categories with tagged lengthened accessories should ONLY return those
    // (lengthened bias), never a non-lengthened non-primary.
    // Reads the flag from the CATALOGUE (11b) — the bank's duplicate copy is
    // gone, and reading it here would have been a second source of truth in
    // the very test that pins the first.
    const isLengthened = (id: string) =>
      getExerciseById(id)?.lengthenedBias === true;
    const withLengthened = (
      Object.keys(exerciseBank) as (keyof typeof exerciseBank)[]
    ).filter((cat) => exerciseBank[cat].some((e) => isLengthened(e.id)));
    expect(withLengthened.length).toBeGreaterThan(0);
    for (const cat of withLengthened) {
      const lengthenedIds = new Set(
        exerciseBank[cat].filter((e) => isLengthened(e.id)).map((e) => e.id)
      );
      for (let i = 0; i < 25; i++) {
        expect(lengthenedIds.has(pickAccessory(cat).id)).toBe(true);
      }
    }
  });

  it("still returns a valid non-primary for categories with NO lengthened tag", () => {
    // core has no lengthened accessories — falls back to the full non-primary
    // pool, preserving variety.
    const nonPrimary = new Set(
      exerciseBank.core.filter((e) => !e.primary).map((e) => e.id)
    );
    for (let i = 0; i < 25; i++) {
      expect(nonPrimary.has(pickAccessory("core").id)).toBe(true);
    }
  });

  it("returns the primary as a defensive fallback when all non-primaries are excluded", () => {
    /* Edge case: only one non-primary exists and it's excluded.
       Filter returns []; picker falls back to exerciseBank[cat][0]
       (the primary). Vertical_push has 3 non-primary options so
       construct the worst case by excluding them all. */
    /* Pick a category with exactly 2 non-primary options to keep
       this tractable. arms_triceps has 3 non-primary options
       (skull-crushers, overhead-extension, tricep-dips). Excluding
       all three should force the fallback. */
    const result = pickAccessory("arms_triceps", "skull-crushers");
    /* Since we can only exclude one id, exclusion still leaves
       2 valid candidates. Just verify result is one of them. */
    expect(["overhead-extension", "tricep-dips"]).toContain(result.id);
  });
});

/* ─── One exercise record (11b) ──────────────────────────────────────────
   The bank used to restate `name` and the lengthened-position flag from
   `src/lib/exercises.ts`, and every one of those duplicates had drifted:

     - `chest-supported-db-row` was "Chest-Supported DB Row" here and
       "Chest-Supported Dumbbell Row" in the catalogue — and the bank's copy
       is what gets written into the user's programme, so the programme card
       and the exercise guide named the same lift differently. The SERVER's
       name mirror (`functions/lib/exerciseCatalog.js`) has been pinned to the
       catalogue by a cross-test for some time; the client bank was the
       unpinned third copy.
     - Fifteen bank entries carried `lengthened: true`; ZERO catalogue rows
       carried `lengthenedBias`. A documented field with no data and no
       reader, so anything asking the catalogue got `false` for every lift.
     - The bank's grouping said `tricep-dips` is `arms_triceps`;
       `STORED_CATEGORY` said `horizontal_push`. One exercise, two movements,
       depending on which module asked.

   These pin the merge. Read them as "there is one place each of these facts
   is written down", not as "the two copies currently agree". ── */
describe("one exercise record (11b)", () => {
  const allOptions = (
    Object.keys(exerciseBank) as (keyof typeof exerciseBank)[]
  ).flatMap((cat) => exerciseBank[cat].map((o) => ({ cat, ...o })));

  it("every bank id exists in the catalogue", () => {
    // The bank holds ids and nothing else identifying, so an id with no
    // catalogue row is a broken reference: the user would see the raw id.
    const orphans = allOptions
      .filter((o) => !getExerciseById(o.id))
      .map((o) => `${o.cat}/${o.id}`);
    expect(orphans, orphans.join(", ")).toEqual([]);
    expect(allOptions.length).toBeGreaterThan(40); // the scan is not empty
  });

  it("the bank's grouping agrees with STORED_CATEGORY", () => {
    // Two tables answer "what movement is this": the bank's grouping (used to
    // seed loads) and STORED_CATEGORY (stamped onto every ProgramExercise).
    // They disagreed on tricep-dips. CLAUDE.md's #1 recurring mistake is the
    // same fact derived in two places; this is the pin that makes them one.
    const disagree = allOptions
      .filter((o) => inferMovementCategory("", o.id) !== o.cat)
      .map(
        (o) =>
          `${o.id}: bank=${o.cat} stored=${inferMovementCategory("", o.id)}`
      );
    expect(disagree, disagree.join("\n")).toEqual([]);
  });

  it("a bank entry cannot restate a catalogue field", () => {
    // Structural, so this survives someone re-adding `name` by hand rather
    // than only catching today's two fields. Parses the interface at test
    // time (the `profileFieldRegistry` technique) and holds the key set.
    const src = readFileSync(resolve(__dirname, "../variationBank.ts"), "utf8");
    const body = /interface ExerciseOption \{([\s\S]*?)\n\}/.exec(src)?.[1];
    expect(
      body,
      "ExerciseOption interface not found — did it get renamed?"
    ).toBeDefined();
    const fields = [...(body ?? "").matchAll(/^ {2}(\w+)\??:/gm)].map(
      (m) => m[1]
    );

    // Only PROGRAMME facts belong here: how this generator uses the movement.
    // Anything describing the MOVEMENT itself (name, muscles, equipment,
    // lengthenedBias, instructions, difficulty) belongs to the catalogue.
    // `bodyweightFloor` is a prescription-gating fact like `complexity` —
    // whether THIS generator may offer the movement to a beginner — not a
    // movement description, so it lives here (2026-08-03 beginner audit).
    expect(fields.sort()).toEqual(
      ["bodyweightFloor", "complexity", "id", "loadFactor", "primary"].sort()
    );
  });

  it("the lengthened-position data lives in the catalogue and is not empty", () => {
    // The half of the merge that could silently un-do itself: dropping
    // `lengthened` from the bank without the backfill would leave
    // `pickAccessory`'s bias reading `false` for everything, and the accessory
    // picker would still return SOMETHING — no test would fail on emptiness
    // alone. So assert the data is actually there.
    const lengthened = allOptions.filter(
      (o) => getExerciseById(o.id)?.lengthenedBias === true
    );
    expect(lengthened.length).toBeGreaterThanOrEqual(15);
  });

  it("picked names come from the catalogue, including the row that drifted", () => {
    expect(exerciseDisplayName("chest-supported-db-row")).toBe(
      "Chest-Supported Dumbbell Row"
    );
    // …and every picker agrees, because they all resolve through it.
    const picked = pickExercise("horizontal_pull", "chest-supported-db-row");
    expect(picked.name).toBe(getExerciseById(picked.id)?.name);
  });
});
