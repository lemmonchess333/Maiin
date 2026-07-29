import { describe, it, expect } from "vitest";
import {
  applyProgression,
  applyDeload,
  advanceWeek,
  computeFatigueScore,
  generateProgram,
  generateWeekPrescription,
  expectedDayCount,
  goalProfileFor,
  applyFatigue,
  dedupeDayExercises,
  rotateUntrainedAccessories,
  splitRationale,
  isCycleEndWeek,
} from "../programEngine";
import { exerciseBank } from "../variationBank";
import { EXERCISES, isBodyweightExerciseId } from "@/lib/exercises";
import { deloadWeight } from "../easierToday";
import { PROGRAMME_PLATEAU_MIN } from "../adjustmentRule";
import type {
  Goal,
  ProgramExercise,
  ProgramState,
  WorkoutDay,
} from "../programTypes";

function makeTestExercise(
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 6,
    baseReps: 6,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

function makeBodyweightExercise(
  overrides: Partial<ProgramExercise> = {}
): ProgramExercise {
  return makeTestExercise({
    name: "Pull-ups",
    exerciseId: "pull-ups",
    movementCategory: "vertical_pull",
    weight: 0,
    lastSuccessfulWeight: 0,
    lastAttemptedWeight: 0,
    reps: 8,
    ...overrides,
  });
}

// â”€â”€ Double Progression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("isCycleEndWeek â€” programme_complete badge trigger", () => {
  it("is true on deload weeks (every 4th â€” the mesocycle end)", () => {
    for (const w of [4, 8, 12, 16, 52]) {
      expect(isCycleEndWeek(w)).toBe(true);
      // Stays in lockstep with the periodization schedule itself.
      expect(generateWeekPrescription(w).deload).toBe(true);
    }
  });

  it("is false on progression weeks", () => {
    for (const w of [1, 2, 3, 5, 6, 7, 9]) {
      expect(isCycleEndWeek(w)).toBe(false);
    }
  });

  it("is false for a 0/invalid week (no completion to credit)", () => {
    expect(isCycleEndWeek(0)).toBe(false);
  });
});

describe("applyProgression â€” double progression", () => {
  it("does NOT increase weight when reps meet target but don't hit ceiling", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // Hit exactly 6 reps (target) â€” should succeed but NOT increase weight yet
    const result = applyProgression(ex, 6, 60, "recomp", false);
    expect(result.weight).toBe(60); // stays same â€” accumulating reps
    expect(result.consecutiveFailures).toBe(0);
  });

  it("does NOT increase weight when reps exceed target by 1", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    const result = applyProgression(ex, 7, 60, "recomp", false);
    expect(result.weight).toBe(60); // still accumulating â€” ceiling is reps+2=8
  });

  it("increases weight when reps hit ceiling (target + 2)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // Hit 8 reps (6+2 = ceiling) â€” NOW increase weight
    const result = applyProgression(ex, 8, 60, "recomp", false);
    expect(result.weight).toBe(62.5); // 60 + 2.5 + 0 (recomp bonus = 0)
    expect(result.reps).toBe(6); // reset to base
  });

  it("adds goal bonus on lean bulk", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    const result = applyProgression(ex, 8, 60, "lean bulk", false);
    expect(result.weight).toBe(63.75); // 60 + 2.5 + 1.25
  });

  it("requires 3 consecutive failures before deload (not 2)", () => {
    const ex = makeTestExercise({ consecutiveFailures: 1 });
    // 2nd failure â€” should NOT deload yet
    const result = applyProgression(ex, 4, 60, "recomp", false);
    expect(result.consecutiveFailures).toBe(2);
    expect(result.weight).toBe(60); // no deload

    // 3rd failure â€” NOW deload
    const result2 = applyProgression(result, 4, 60, "recomp", false);
    expect(result2.consecutiveFailures).toBe(0);
    expect(result2.weight).toBeLessThan(60);
    expect(result2.plateauCount).toBe(1);
  });
});

// â”€â”€ Bodyweight Progression â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("applyProgression â€” bodyweight exercises", () => {
  it("progresses via rep increase when hitting ceiling", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    // Hit 10 reps (8+2 = ceiling)
    const result = applyProgression(ex, 10, 0, "recomp", false);
    expect(result.weight).toBe(0); // stays bodyweight
    expect(result.reps).toBe(9); // rep target increased by 1
  });

  it("does not progress when below rep ceiling", () => {
    const ex = makeBodyweightExercise({ reps: 8 });
    const result = applyProgression(ex, 9, 0, "recomp", false);
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(8); // no change
  });

  it("deloads by reducing rep target on consecutive failures", () => {
    const ex = makeBodyweightExercise({ reps: 8, consecutiveFailures: 2 });
    const result = applyProgression(ex, 5, 0, "recomp", false);
    expect(result.reps).toBe(7); // reduced by 1
    expect(result.weight).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
  });

  it("enforces minimum 4 reps on deload", () => {
    const ex = makeBodyweightExercise({ reps: 4, consecutiveFailures: 2 });
    const result = applyProgression(ex, 2, 0, "recomp", false);
    expect(result.reps).toBe(4); // can't go below 4
  });

  it("also works for linear progression type", () => {
    const ex = makeBodyweightExercise({ progressionType: "linear", reps: 8 });
    const result = applyProgression(ex, 10, 0, "recomp", false);
    expect(result.weight).toBe(0);
    expect(result.reps).toBe(9);
  });
});

describe("applyProgression â€” uncalibrated loaded exercise", () => {
  it("promotes the first real logged load into the programme", () => {
    const exercise = makeTestExercise({
      exerciseId: "lat-pulldown",
      movementCategory: "vertical_pull",
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
    });
    const out = applyProgression(exercise, exercise.reps, 35, "recomp", false);
    expect(out.weight).toBe(35);
    expect(out.lastSuccessfulWeight).toBe(35);
    expect(out.lastAttemptedWeight).toBe(35);
  });
});

// â”€â”€ RPE autoregulation (D-LIFT-6) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("applyProgression â€” RPE autoregulation", () => {
  it("HOLDS load when the completed set was at RPE â‰¥ 9.5 (double)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    // hit ceiling (8 reps) but at maximal effort â†’ no weight increase
    const held = applyProgression(ex, 8, 60, "recomp", false, 10);
    expect(held.weight).toBe(60); // held
    expect(held.consecutiveFailures).toBe(0); // still a success, not a failure
    // same set at a sub-maximal RPE â†’ normal weight increase
    const up = applyProgression(ex, 8, 60, "recomp", false, 8);
    expect(up.weight).toBe(62.5);
  });

  it("HOLDS the microloading bump at RPE â‰¥ 9.5 (linear)", () => {
    const ex = makeTestExercise({
      progressionType: "linear",
      reps: 6,
      weight: 60,
    });
    expect(applyProgression(ex, 6, 60, "recomp", true, 9.5).weight).toBe(60);
    expect(applyProgression(ex, 6, 60, "recomp", true, 7).weight).toBe(61);
  });

  it("progresses normally when no RPE is logged (back-compat)", () => {
    const ex = makeTestExercise({ reps: 6, weight: 60 });
    expect(applyProgression(ex, 8, 60, "recomp", false).weight).toBe(62.5);
  });
});

// â”€â”€ Bodyweight rep cap (D-LIFT-11) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("applyProgression â€” bodyweight rep cap", () => {
  it("caps the rep target at 20 and prompts adding load", () => {
    const ex = makeBodyweightExercise({ reps: 20 });
    const out = applyProgression(ex, 22, 0, "recomp", false);
    expect(out.reps).toBe(20); // not 21 â€” capped
    expect(out.notes).toMatch(/add load/i);
  });

  it("still increments below the cap", () => {
    const ex = makeBodyweightExercise({ reps: 12 });
    const out = applyProgression(ex, 14, 0, "recomp", false);
    expect(out.reps).toBe(13);
    expect(out.notes).toBeUndefined();
  });

  it("honours a generated rep-range ceiling below the global cap", () => {
    const ex = makeBodyweightExercise({ reps: 15, repRangeMax: 15 });
    const out = applyProgression(ex, 17, 0, "recomp", false);
    expect(out.reps).toBe(15);
    expect(out.notes).toMatch(/15\+ reps/i);
  });
});

// â”€â”€ Day dedupe (D-LIFT-12) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("dedupeDayExercises", () => {
  it("re-points a duplicate exercise id to another variation in the category", () => {
    const dup = makeTestExercise({
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
    });
    const out = dedupeDayExercises([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [dup, { ...dup }], // two bench-press on one day
      },
    ]);
    const ids = out[0].exercises.map((e) => e.exerciseId);
    expect(ids[0]).toBe("bench-press");
    expect(ids[1]).not.toBe("bench-press"); // re-pointed
    expect(new Set(ids).size).toBe(2); // no duplicate
  });

  it("leaves a day with no duplicates unchanged", () => {
    const a = makeTestExercise({ exerciseId: "bench-press" });
    const b = makeTestExercise({
      exerciseId: "squat",
      movementCategory: "knee_dominant",
    });
    const out = dedupeDayExercises([
      {
        dayName: "D",
        dayType: "full_body",
        completed: false,
        exercises: [a, b],
      },
    ]);
    expect(out[0].exercises.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "squat",
    ]);
  });
});

// â”€â”€ Accessory rotation (D-LIFT-4) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("rotateUntrainedAccessories", () => {
  const accessory = (over: Partial<ProgramExercise>): ProgramExercise =>
    makeTestExercise({
      exerciseId: "incline-db-press",
      movementCategory: "horizontal_push",
      isAccessory: true,
      performanceHistory: [],
      ...over,
    });

  it("rotates an untrained accessory to a different variation in its category", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [accessory({})],
      },
    ]);
    const e = out[0].exercises[0];
    expect(e.isAccessory).toBe(true);
    expect(e.exerciseId).not.toBe("incline-db-press"); // rotated
    // still a horizontal_push variation
    const validIds = new Set(exerciseBank.horizontal_push.map((o) => o.id));
    expect(validIds.has(e.exerciseId)).toBe(true);
  });

  it("never rotates a main lift", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [
          makeTestExercise({ exerciseId: "bench-press", isAccessory: false }),
        ],
      },
    ]);
    expect(out[0].exercises[0].exerciseId).toBe("bench-press");
  });

  it("never rotates an accessory the user has trained (has history)", () => {
    const out = rotateUntrainedAccessories([
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [
          accessory({
            performanceHistory: [
              {
                date: "2026-01-01",
                weight: 20,
                repsCompleted: 10,
                repsTarget: 10,
              },
            ],
          }),
        ],
      },
    ]);
    expect(out[0].exercises[0].exerciseId).toBe("incline-db-press"); // kept
  });
});

// â”€â”€ Deload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("applyDeload", () => {
  it("rounds weight to 2.5kg increments", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [makeTestExercise({ weight: 100, sets: 4 })],
      },
    ];
    const result = applyDeload(workouts);
    // 100 * 0.85 = 85 â†’ round(85/2.5)*2.5 = 85 (exact)
    expect(result[0].exercises[0].weight).toBe(85);
    expect(result[0].exercises[0].sets).toBe(3); // 4-1=3
  });

  it("rounds non-exact values to nearest 2.5kg", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Push",
        dayType: "push",
        completed: false,
        exercises: [makeTestExercise({ weight: 60, sets: 3 })],
      },
    ];
    const result = applyDeload(workouts);
    // 60 * 0.85 = 51 â†’ round(51/2.5)*2.5 = round(20.4)*2.5 = 20*2.5 = 50
    expect(result[0].exercises[0].weight).toBe(50);
  });

  it("does not change bodyweight exercise weight", () => {
    const workouts: WorkoutDay[] = [
      {
        dayName: "Pull",
        dayType: "pull",
        completed: false,
        exercises: [makeBodyweightExercise({ sets: 4 })],
      },
    ];
    const result = applyDeload(workouts);
    expect(result[0].exercises[0].weight).toBe(0);
    expect(result[0].exercises[0].sets).toBe(3); // still reduces sets
  });
});

// â”€â”€ computeFatigueScore (D-LIFT-8) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("computeFatigueScore", () => {
  const day = (exs: ProgramExercise[]): WorkoutDay => ({
    dayName: "D",
    dayType: "upper",
    completed: true,
    exercises: exs,
  });

  it("is 0 when nothing is failing", () => {
    expect(
      computeFatigueScore([day([makeTestExercise({ consecutiveFailures: 0 })])])
    ).toBe(0);
  });

  it("scales with unresolved recent failures (Ã—8)", () => {
    expect(
      computeFatigueScore([
        day([
          makeTestExercise({ consecutiveFailures: 2 }),
          makeTestExercise({ consecutiveFailures: 1 }),
        ]),
      ])
    ).toBe(24); // (2+1)*8
  });

  it("needs a meaningful share failing to clear the >20 cut threshold", () => {
    // one lift at two misses = 16 â†’ below 20 (no cut); two lifts = 32 â†’ trips
    expect(
      computeFatigueScore([day([makeTestExercise({ consecutiveFailures: 2 })])])
    ).toBeLessThanOrEqual(20);
    expect(
      computeFatigueScore([
        day([
          makeTestExercise({ consecutiveFailures: 2 }),
          makeTestExercise({ consecutiveFailures: 2 }),
        ]),
      ])
    ).toBeGreaterThan(20);
  });

  it("clamps to 100 (can't ratchet unbounded)", () => {
    const exs = Array.from({ length: 30 }, () =>
      makeTestExercise({ consecutiveFailures: 2 })
    );
    expect(computeFatigueScore([day(exs)])).toBe(100);
  });
});

// â”€â”€ advanceWeek â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe("advanceWeek", () => {
  const baseProgramState: ProgramState = {
    go×yòÚ$z{-®éÜj×46ö×ÆWFVC¢‚Â&W5F&vWC¢‚ÒÀ¢ÒÀ¢Ò’’À¢Ò’“° ¢—B‚&¶VW2W†W&6—6RÂ–ç7Fæ6RÂÆöBæB†—7F÷'’f÷"WfW'’66W76÷'’"Â‚’Óâ°¢òòBF—2(i"WW"öÆ÷vW"Âv†–6‚—27Æ—BF†BW6W2Ö¶T66W76÷'’âF†—0¢òòW†7Bf—‡GW&R&Vw&W76VBöâÖ–ã¢SR¶r'VÆv&–â7Æ—B7VBv—F€¢òò†—7F÷'’&V6ÖRC¶r†6²7VBv—F‚æöæRà¢6öç7Bf—'7BÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢BÀ¢VæFVf–æVBÀ¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3°¢6öç7BG&–æVBÒG&–äÆÂ†f—'7B“°¢6öç7Bv–âÒvVæW&FU&öw&Ò‚'&V6ö×"ÂBÂG&–æVBÂ&‡—W'G&÷‡’"’çv÷&¶÷WG3° ¢G&–æVBæf÷$V6‚‚†BÂF’’Óà¢BæW†W&6—6W2æf÷$V6‚‚†&Vf÷&RÂV’’Óâ°¢6öç7BgFW"Òv–å¶F•ÒæW†W&6—6W5¶V•Ó°¢W‡V7B†gFW"æW†W&6—6T–BÂBG¶F—ÒöRG¶V—Ö’çFô&R†&Vf÷&RæW†W&6—6T–B“°¢W‡V7B†gFW"æ–ç7Fæ6T–BÂBG¶F—ÒöRG¶V—Ö’çFô&R†&Vf÷&Ræ–ç7Fæ6T–B“°¢W‡V7B†gFW"çvV–v‡BÂBG¶F—ÒöRG¶V—Ö’çFô&RƒSR“°¢W‡V7B†gFW"çW&f÷&Öæ6T†—7F÷'’ÂBG¶F—ÒöRG¶V—Ö’çFô†fTÆVæwF‚ƒ“°¢Ò¢“°¢Ò“° ¢—B‚&†öÆG27&÷72&WVFVB&VvVæW&FW2Âæ÷B§W7BF†Rf—'7B"Â‚’Óâ°¢ÆWBv÷&¶÷WG2ÒG&–äÆÂ€¢vVæW&FU&öw&Ò‚'&V6ö×"ÂbÂVæFVf–æVBÂ&‡—W'G&÷‡’"’çv÷&¶÷WG0¢“°¢6öç7B–G2Òv÷&¶÷WG2æÖ‚†B’ÓâBæW†W&6—6W2æÖ‚†R’ÓâRæW†W&6—6T–B’“°¢f÷"†ÆWB’Ò²’Â3²’³Ò’°¢v÷&¶÷WG2ÒvVæW&FU&öw&Ò‚'&V6ö×"ÂbÂv÷&¶÷WG2Â&‡—W'G&÷‡’"’çv÷&¶÷WG3°¢W‡V7B‡v÷&¶÷WG2æÖ‚†B’ÓâBæW†W&6—6W2æÖ‚†R’ÓâRæW†W&6—6T–B’’’çFôWVÂ€¢–G0¢“°¢Ð¢Ò“° ¢—B‚'7F–ÆÂÆWG2F†R$U45$•D”ôâ6†ævR(	BöæÇ’–FVçF—G’æBÆör6''’"Â‚’Óâ°¢òòF†R6''’×W7Bæ÷Bg&VW¦R6WG2÷&W2Â÷"&VÂvöÂ6†ævRv÷VÆB&P¢òò6–ÆVçFÇ’–væ÷&VBà¢6öç7B7G&VæwF‚ÒG&–äÆÂ€¢vVæW&FU&öw&Ò‚'&V6ö×"ÂBÂVæFVf–æVBÂ'7G&VæwF‚"’çv÷&¶÷WG0¢“°¢6öç7B7vVBÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢BÀ¢7G&VæwF‚À¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3°¢6öç7B&W4öbÒ‡s¢v÷&¶÷WDF•µÒ’Óà¢ræfÆDÖ‚†B’ÓâBæW†W&6—6W2æÖ‚†R’ÓâRç&W2’“°¢W‡V7B‡&W4öb‡7vVB’’ææ÷BçFôWVÂ‡&W4öb‡7G&VæwF‚’“°¢Ò“° ¢—B‚&FöW2æ÷B6''’7&÷726Æ÷BF†BÆVv—F–ÖFVÇ’6†ævVBÖ÷fVÖVçB"Â‚’Óâ°¢òòÇ”÷fW&Æ62&R×ö–çG26Æ÷G3²F†R6''’—26FVv÷'’ÖwV&FVB6ò—@¢òò6âwBG&rFVFÆ–gBw2ÆöröçFòF†R&WÆ6VÖVçBà¢6öç7Bf—'7BÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢2À¢VæFVf–æVBÀ¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3°¢f—'7Bæf÷$V6‚‚†B’Óà¢BæW†W&6—6W2æf÷$V6‚‚†R’ÓâW‡V7B†RæÖ÷fVÖVçD6FVv÷'’’çFô&TFVf–æVB‚’¢“°¢6öç7Bv–âÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢2À¢G&–äÆÂ†f—'7B’À¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3°¢v–âæf÷$V6‚‚†BÂF’’Óà¢BæW†W&6—6W2æf÷$V6‚‚†RÂV’’Óà¢W‡V7B†RæÖ÷fVÖVçD6FVv÷'’’çFô&R€¢f—'7E¶F•ÒæW†W&6—6W5¶V•ÒæÖ÷fVÖVçD6FVv÷'¢¢¢“°¢Ò“°§Ò“° ¢òòF†Rf&–F–öâ&æ²w2–G2vW&RæWfW"–ææVBv–ç7BF†RW†W&6—6RD"(	BF†P¢òò–çFVw&—G’FW7B6÷fW'2FV×ÆFW2æB–æ§W'’7V'7F—GWF–öç2öæÇ’â3FFV@¢òò&öÆW2FòF†÷6RVçG&–W2Â6ò–âF†R–G2Föò&Vf÷&RF†W’G&–gBà¦FW67&–&R‚'f&–F–öâ&æ²–B–çFVw&—G’"Â‚’Óâ°¢—B‚&WfW'’&æ²W†W&6—6T–B&W6öÇfW2Fò&VÂU„U$4•4U2VçG'’"Â‚’Óâ°¢6öç7B–G2ÒæWr6WB„U„U$4•4U2æÖ‚†R’ÓâRæ–B’“°¢6öç7B&C¢7G&–æuµÒÒµÓ°¢f÷"†6öç7B¶6FVv÷'’Â÷F–öç5Òöbö&¦V7BæVçG&–W2†W†W&6—6T&æ²’’°¢f÷"†6öç7Bòöb÷F–öç2’°¢–b‚–G2æ†2†òæ–B’’&BçW6‚†G¶6FVv÷'—ÒòG¶òæ–GÖ“°¢Ð¢Ð¢W‡V7B†&B’çFôWVÂ…µÒ“°¢Ò“°§Ò“° ¢òò&6¶Æör3rw2F–ÖR†—2„ã"’(	BF–ÖVB†öÆG26÷VçB4T4ôäE2Âæ÷B&W2à¦FW67&–&R‚'F–ÖVB†öÆG2†&6¶Æör3rF–ÖR†—2’"Â‚’Óâ°¢6öç7BÆæ²Ò†ó¢'F–ÃÅ&öw&ÔW†W&6—6SâÒ·Ò’Óà¢Ö¶UFW7DW†W&6—6R‡°¢æÖS¢%Ææ²"À¢W†W&6—6T–C¢'Ææ²"À¢Ö÷fVÖVçD6FVv÷'“¢&6÷&R"À¢vV–v‡C¢À¢Æ7E7V66W76gVÅvV–v‡C¢À¢Æ7DGFV×FVEvV–v‡C¢À¢&W3¢3À¢&6U&W3¢3À¢&W&ævTÖƒ¢CRÀ¢&WVæ—C¢'6V6öæG2"À¢ââæòÀ¢Ò“° ¢—B‚&6Æ–Ö'2–âR×6V6öæB7FW2Âæ÷B×&W7FW2"Â‚’Óâ°¢6öç7B÷WBÒÇ•&öw&W76–öâ‡Ææ²‚’Â3"ÂÂ'&V6ö×"ÂfÇ6R“°¢W‡V7B†÷WBç&W2’çFô&Rƒ3R“°¢Ò“° ¢—B‚'7F÷2BF†RWF†÷&VB6V–Æ–ær&F†W"F†âG&–gF–ær"Â‚’Óâ°¢6öç7B÷WBÒÇ•&öw&W76–öâ€¢Ææ²‡²&W3¢C2Â&6U&W3¢C2Ò’À¢CRÀ¢À¢'&V6ö×"À¢fÇ6P¢“°¢W‡V7B†÷WBç&W2’çFô&RƒCR“°¢Ò“° ¢—B‚'&ö×G2FòFBÆöBBF†R6V–Æ–ærÂæ÷BB#w&W2r"Â‚’Óâ°¢òòF†RFVfV7C¢Ææ²7F'G2B3ÂÇ&VG’$õdRÔ…ô$ôE•tT”t…Eõ$U2Â6ð¢òòç’÷fW'6†ö÷B–ÖÖVF–FVÇ’Gf—6VB$†—GF–ær#²&W2(	BFBÆöB"Bv†@¢òò—2â÷&F–æ'’†öÆBÆVæwF‚à¢6öç7B&VÆ÷t6V–Æ–ærÒÇ•&öw&W76–öâ‡Ææ²‚’Â3"ÂÂ'&V6ö×"ÂfÇ6R“°¢W‡V7B†&VÆ÷t6V–Æ–ærææ÷FW2’çFô&UVæFVf–æVB‚“° ¢6öç7BD6V–Æ–ærÒÇ•&öw&W76–öâ€¢Ææ²‡²&W3¢CRÂ&6U&W3¢CRÒ’À¢CrÀ¢À¢'&V6ö×"À¢fÇ6P¢“°¢W‡V7B†D6V–Æ–ærææ÷FW2’çFôÖF6‚‚öFBÆöBö’“°¢W‡V7B†D6V–Æ–ærææ÷FW2’ææ÷BçFôÖF6‚‚ó#Â²&W2ò“°¢W‡V7B†D6V–Æ–ærç&W2’çFô&RƒCR“²òò†VÆBÂæ÷B'V×VB7BF†R6V–Æ–æp¢Ò“° ¢—B‚&fÆÇ2&6²Fòc26V–Æ–ærv†Vâæò&ævRv2WF†÷&VB"Â‚’Óâ°¢6öç7B÷WBÒÇ•&öw&W76–öâ€¢Ææ²‡²&W3¢cÂ&6U&W3¢cÂ&W&ævTÖƒ¢VæFVf–æVBÒ’À¢cRÀ¢À¢'&V6ö×"À¢fÇ6P¢“°¢W‡V7B†÷WBææ÷FW2’çFôÖF6‚‚öFBÆöBö’“°¢W‡V7B†÷WBç&W2’çFô&Rƒc“°¢Ò“° ¢—B‚&ÆVfW2÷&F–æ'’&öG—vV–v‡B&W2ÆöæR"Â‚’Óâ°¢òòF†R&WF‚×W7B&RVçF÷V6†VC¢VÆÂ×W7F–ÆÂ7FW2'’æB7F–ÆÀ¢òòW6W2F†R#×&W6à¢6öç7BVÆÇWÒÖ¶T&öG—vV–v‡DW†W&6—6R‡²&W3¢‚Ò“°¢W‡V7B†Ç•&öw&W76–öâ‡VÆÇWÂÂÂ'&V6ö×"ÂfÇ6R’ç&W2’çFô&Rƒ’“°¢6öç7B6VBÒÖ¶T&öG—vV–v‡DW†W&6—6R‡²&W3¢#Ò“°¢6öç7B÷WBÒÇ•&öw&W76–öâ†6VBÂ#"ÂÂ'&V6ö×"ÂfÇ6R“°¢W‡V7B†÷WBç&W2’çFô&Rƒ#“°¢W‡V7B†÷WBææ÷FW2’çFôÖF6‚‚ó#Â²&W2ò“°¢Ò“°§Ò“° ¢òò&6¶Æör3„ÓbF¦6Væ7’’v—&VB–çFòvVæW&FU&öw&ÒâF†RvVV²w24„P¢òò6öÖW2g&öÒ&öf–ÆRçvVVµ66†VGVÆR(	B&VBÖöæÇ’âÆ–gG27F’7Æ—BÖ÷&FW&V@¢òò„E"Ó"“²F†—2öæÇ’FV6–FW2v†–6‚6W76–öâ6—G2æW‡BFòv†–6‚à¦FW67&–&R‚&F¦6Væ7’÷&FW&–ær†&6¶Æör3ÂÓb’"Â‚’Óâ°¢6öç7B66†VBÒ†F—3¢çVÖ&W%µÒ’Óà¢³ÂÂ"Â2ÂBÂRÂeÒæÖ‚†B’Óâ‡°¢F“¢BÀ¢G—S¢F—2æ–æ6ÇVFW2†B’ò&Æ–gB"¢'&W7B"À¢Ò’“°¢6öç7BvVâÒ€¢ã¢çVÖ&W"À¢66†VGVÆSó¢&VFöæÇ”'&“Ç²F“¢çVÖ&W#²G—S¢7G&–ærÓâÀ¢W†—7F–æsó¢v÷&¶÷WDF•µÐ¢’Óà¢vVæW&FU&öw&Ò‚'&V6ö×"ÂâÂW†—7F–ærÂ&‡—W'G&÷‡’"ÂVæFVf–æVBÂ66†VGVÆR¢çv÷&¶÷WG3° ¢—B‚&6†ævW2æ÷F†–ærf÷"7&VBÖ÷WBvVV²"Â‚’Óâ°¢òòÖöâõvVBôg&’(	BæòGvò6W76–öç2&R&6²×FòÖ&6²Â6òF†W&R—2æ÷F†–æp¢òòF¦6Væ7’6â–×&÷fRâF†—2—2F†R66RF†R'VÆRÕU5BÆVfRÆöæRà¢6öç7BÆ–âÒvVâƒ2’æÖ‚†B’ÓâBæF”æÖR“°¢6öç7B7&VBÒvVâƒ2Â66†VB…³Â2ÂUÒ’’æÖ‚†B’ÓâBæF”æÖR“°¢W‡V7B‡7&VB’çFôWVÂ‡Æ–â“°¢Ò“° ¢—B‚&6†ævW2æ÷F†–ærv†Vâæò66†VGVÆR—27WÆ–VB"Â‚’Óâ°¢W‡V7B†vVâƒbÂVæFVf–æVB’æÖ‚†B’ÓâBæF”æÖR’’çFôWVÂ€¢vVâƒbÂVæFVf–æVB’æÖ‚†B’ÓâBæF”æÖR¢“°¢Ò“° ¢—B‚'6W&FW2÷7FW&–÷"Ö†Vg’F—2öâgVÆÇ’6öç6V7WF—fRvVV²"Â‚’Óâ°¢6öç7B&Vf÷&RÒvVâƒb“°¢6öç7BgFW"ÒvVâƒbÂ66†VB…³Â"Â2ÂBÂRÂeÒ’“°¢6öç7B÷7FW&–÷"Ò‡s¢v÷&¶÷WDF•µÒ’Óà¢ræÖ‚†B’Óà¢BæW†W&6—6W2ç&VGV6R€¢†âÂR’Óà¢â°¢†RæÖ÷fVÖVçD6FVv÷'’ÓÓÒ&†—öFöÖ–æçB"ÇÀ¢RæÖ÷fVÖVçD6FVv÷'’ÓÓÒ&†÷&—¦öçFÅ÷VÆÂ"ÇÀ¢RæÖ÷fVÖVçD6FVv÷'’ÓÓÒ'fW'F–6Å÷VÆÂ ¢òRç6WG0¢¢’À¢ ¢¢“°¢6öç7B6÷7BÒ‡s¢v÷&¶÷WDF•µÒ’Óâ°¢6öç7BÒ÷7FW&–÷"‡r“°¢ÆWB2Ò°¢f÷"†ÆWB’Ò²’²ÂæÆVæwFƒ²’³Ò’2³ÒÖF‚æÖ–â‡¶•ÒÂ¶’²Ò“°¢&WGW&â3°¢Ó°¢W‡V7B†6÷7B†gFW"’’çFô&TÆW75F†ä÷$WVÂ†6÷7B†&Vf÷&R’“°¢Ò“° ¢—B‚&¶VW2F†RW6‚÷VÆÂöÆVw2&÷FF–öâ–çF7B"Â‚’Óâ°¢òòF†Rv÷''’F†B¶WBF†—2Væ'V–ÇC¢tTäU$”2÷fW&ÆÖWG&–2&V÷&FW'2À¢òò÷WBöb—G2&÷FF–öââ66÷&–æröæÇ’F†R÷7FW&–÷"6†–âFöW2æ÷B(	B¢òòbÖF’vVV²7F—26ÆVâGvòÖ7–6ÆR&÷FF–öâÂ§W7B÷76–&Ç’7F'F–æröà¢òòF–ffW&VçBF’à¢6öç7BæÖW2ÒvVâƒbÂ66†VB…³Â"Â2ÂBÂRÂeÒ’’æÖ€¢†B’ÓâBæF”æÖRç7Æ—B‚""•³Ð¢“°¢W‡V7B†æÖW2ç6Æ–6RƒÂ2’’çFôWVÂ†æÖW2ç6Æ–6Rƒ2Âb’“°¢Ò“° ¢—B‚&¶VW2F†R÷&FW"7F&ÆR7&÷72&VvVæW&FW2"Â‚’Óâ°¢6öç7B2Ò66†VB…³Â"Â2ÂBÂRÂeÒ“°¢6öç7BW7F&Æ—6†VBÒvVâƒbÂ2“°¢ÆWB7W'&VçBÒW7F&Æ—6†VC°¢f÷"†ÆWB’Ò²’Â3²’³Ò’°¢7W'&VçBÒvVâƒbÂ2Â7W'&VçB“°¢W‡V7B†7W'&VçBæÖ‚†B’ÓâBæF”æÖR’’çFôWVÂ€¢W7F&Æ—6†VBæÖ‚†B’ÓâBæF”æÖR¢“°¢Ð¢Ò“° ¢—B‚&6'&–W2WfW'’W†W&6—6RFòF†R$”t…BF’gFW"&V÷&FW&–ær"Â‚’Óâ°¢òòF†R'VrF†—2fVGW&Rv2&Æö6¶VBöâÂæ÷r&Vw&W76–öâ–ââF†R'V–ÆFW'0¢òò6''’6fVBW†W&6—6W2'’õ4•D”ôâÂv†–6‚77VÖVB6fVB÷&FW"ÓÒ'V–ÆFW ¢òò÷&FW"â&V÷&FW&–ær'&ö¶RF†B6–ÆVçFÇ“¢v—F‚6fVBVÆÂÅW6‚ÄÆVw2æ@¢òò'V–ÆFW"W6‚ÅVÆÂÄÆVw2ÂÆövvVBVÆÂ×WvV–v‡BÆæFVBöâ&Væ6‚&W72à¢òòÆ–våFô6æöæ–6ÆÖ¶W2F†R6''’¶W’öâF’äÔR–ç7FVBà¢6öç7B2Ò66†VB…³Â"Â2ÂBÂRÂeÒ“°¢6öç7BW7F&Æ—6†VBÒvVâƒbÂ2“°¢6öç7BG&–æVBÒW7F&Æ—6†VBæÖ‚†B’Óâ‡°¢ââæBÀ¢W†W&6—6W3¢BæW†W&6—6W2æÖ‚†R’Óâ‡²ââæRÂvV–v‡C¢cÒ’’À¢Ò’“°¢6öç7Bv–âÒvVâƒbÂ2ÂG&–æVB“° ¢v–âæf÷$V6‚‚†BÂF’’Óâ°¢W‡V7B†BæF”æÖR’çFô&R‡G&–æVE¶F•ÒæF”æÖR“°¢BæW†W&6—6W2æf÷$V6‚‚†RÂV’’Óâ°¢6öç7B&Vf÷&RÒG&–æVE¶F•ÒæW†W&6—6W5¶V•Ó°¢–b‚&Vf÷&R’&WGW&ã°¢W‡V7B†RæW†W&6—6T–BÂBG¶F—ÒöRG¶V—Ò‚G¶BæF”æÖWÒ–’çFô&R€¢&Vf÷&RæW†W&6—6T–@¢“°¢W‡V7B†RçvV–v‡BÂBG¶F—ÒöRG¶V—Ö’çFô&Rƒc“°¢Ò“°¢Ò“°¢Ò“° ¢—B‚&Æ–vç2'’æÖRWfVâv†VâF†R6fVBÆâ—2–âF–ffW&VçB÷&FW""Â‚’Óâ°¢òòF—&V7FÇ“¢†æBF†RVæv–æR6fVBÆâv†÷6RF—2&R6‡VffÆVBæ@¢òò6öæf—&ÒV6‚F’w26öçFVçBföÆÆ÷w2—G2äÔRÂæ÷B—G2–æFW‚à¢6öç7B2Ò66†VB…³Â"Â2ÂBÂRÂeÒ“°¢6öç7B&6RÒvVâƒbÂ2“°¢6öç7B6‡VffÆVBÒ²ââæ&6UÒç&WfW'6R‚’æÖ‚†B’Óâ‡°¢ââæBÀ¢W†W&6—6W3¢BæW†W&6—6W2æÖ‚†R’Óâ‡²ââæRÂvV–v‡C¢srÒ’’À¢Ò’“°¢6öç7B÷WBÒvVâƒbÂ2Â6‡VffÆVB“°¢÷WBæf÷$V6‚‚†B’Óâ°¢6öç7B6÷W&6RÒ6‡VffÆVBæf–æB‚‡‚’Óâ‚æF”æÖRÓÓÒBæF”æÖR“°¢W‡V7B‡6÷W&6R’çFô&TFVf–æVB‚“°¢BæW†W&6—6W2æf÷$V6‚‚†RÂV’’Óâ°¢6öç7B&Vf÷&RÒ6÷W&6RæW†W&6—6W5¶V•Ó°¢–b†&Vf÷&R’W‡V7B†RæW†W&6—6T–B’çFô&R†&Vf÷&RæW†W&6—6T–B“°¢Ò“°¢Ò“°¢Ò“°§Ò“° ¢òò&VvVæW&FR×W7BæWfW"G&÷ÆövvVBÆöBÂöâå’7Æ—BâF†—2—2F†RwV&@¢òòf÷"F†Rv†öÆR6Æ72&F†W"F†âf÷"öæR6Æ÷C¢F†R'V–ÆFW'26''’6fV@¢òòW†W&6—6W2F‡&÷Vv‚†æB×w&—GFVâf–æDW†—7F–ær†F”–G‚ÂW„–G‚–6ÆÇ2ÂæB¢òò6–ævÆRw&öær–æFW‚6–ÆVçFÇ’&V'V–ÆG2F†BÆ–gBg&öÒFVfVÇG2WfW'’F–ÖRF†P¢òòW6W"6†ævW26WGF–ærâöæR7V6‚öfbÖ'’ÖöæR‡F†RÂÆVw2F’w26÷&R6Æ÷BÀ¢òò6ÆÆ–ærf–æDW†—7F–ærƒ"ÂB’–çFòf÷W"×6Æ÷BF’’7W'f—fVBVçF–ÂF†—2FW7@¢òòW†—7FVBà¢òð¢òò4õ%$T5DTB##bÓrÓ#‚âF†—2FW7BW6VBFò7F×vV–v‡C¢cöâUdU%¢òòW†W&6—6RæBF†Vâ76W'BWfW'’W†W&6—6R7F–ÆÂ&VBc(	B6òç’W&×WFF–öà¢òòöbF†R6''’76VB—BÂ–æ6ÇVF–ærF†RöæRâVF—Bf÷VæB6†—–æp¢òò†&Væ6‚&W74¶g&öÒ&&&VÆÂ7VEÖ’â—BÇ6ò6ö×WFVB&Vf÷&Væ@¢òòæWfW"6ö×&VBv–ç7B—BâF—7F–æ7BW"×6Æ÷BvV–v‡G2&RF†Rv†öÆRö–çC ¢òòF†W’Ö¶R7vf—6–&ÆRà¦FW67&–&R‚'&VvVæW&FR&W6W'fW2WfW'’ÆövvVBÆöB†ÆÂ7Æ—G2’"Â‚’Óâ°¢—BæV6‚…³Â"Â2ÂBÂRÂeÒ’‚"V’ÖF’7Æ—B"Â†F—2’Óâ°¢6öç7Bf—'7BÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢F—2À¢VæFVf–æVBÀ¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3°¢òòVæ—VRÆöBW"Ä”eBÂ6òÖ—2Ö6''’æÖW2—G2÷vâ6÷W&6Rà¢6öç7BÆöDf÷"ÒæWrÖÇ7G&–ærÂçVÖ&W#â‚“°¢f—'7@¢æfÆDÖ‚†B’ÓâBæW†W&6—6W2¢æf÷$V6‚‚†RÂ’’Óâ°¢–b‚ÆöDf÷"æ†2†RæW†W&6—6T–B’’ÆöDf÷"ç6WB†RæW†W&6—6T–BÂ²’“°¢Ò“°¢6öç7BG&–æVBÒf—'7BæÖ‚†B’Óâ‡°¢ââæBÀ¢W†W&6—6W3¢BæW†W&6—6W2æÖ‚†R’Óâ°¢6öç7BrÒÆöDf÷"ævWB†RæW†W&6—6T–B’2çVÖ&W#°¢&WGW&â°¢ââæRÀ¢vV–v‡C¢rÀ¢W&f÷&Öæ6T†—7F÷'“¢°¢²FFS¢###bÓÓ"ÂvV–v‡C¢rÂ&W46ö×ÆWFVC¢‚Â&W5F&vWC¢‚ÒÀ¢ÒÀ¢Ó°¢Ò’À¢Ò’“°¢6öç7Bv–âÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢F—2À¢G&–æVBÀ¢&‡—W'G&÷‡’ ¢’çv÷&¶÷WG3° ¢6öç7B6÷W&6TöbÒ‡s¢çVÖ&W"’Óà¢²ââæÆöDf÷"æVçG&–W2‚•Òæf–æB‚…²ÂeÒ’ÓâbÓÓÒr“òå³Òóò'Væ¶æ÷vâ#° ¢v–âæf÷$V6‚‚†B’Óà¢BæW†W&6—6W2æf÷$V6‚‚†RÂV’’Óâ°¢6öç7BW‡V7FVBÒÆöDf÷"ævWB†RæW†W&6—6T–B“°¢W‡V7B€¢W‡V7FVBÀ¢G¶BæF”æÖWÒò6Æ÷BG¶V—Ó¢G¶RæW†W&6—6T–GÒv2æ÷B–âF†R6fVBÆæ ¢’çFô&TFVf–æVB‚“°¢W‡V7B€¢RçvV–v‡BÀ¢G¶BæF”æÖWÒò6Æ÷BG¶V—Ó¢G¶RæW†W&6—6T–GÒ6'&–VBG·6÷W&6Töb†RçvV–v‡B—Òw2ÆöF ¢’çFô&R†W‡V7FVB“°¢W‡V7B€¢RçW&f÷&Öæ6T†—7F÷'“òæÆVæwF‚À¢G¶BæF”æÖWÒò6Æ÷BG¶V—Ò‚G¶RæW†W&6—6T–GÒ– ¢’çFô&Rƒ“°¢Ò¢“°¢Ò“°§Ò“° ¢òòF†R÷væW"×&W÷'FVBFVfV7C¢FVfVÇB2ÖF’&öw&ÖÖR&W67&–&VB&&&VÆÀ¢òò7VBƒ2÷vVV²æBBÖF’&W67&–&VB&&&VÆÂ7W&Âƒ2(	BöâWfW'’vöÂÂ’æRà¢òòF†RGvòÖ÷7B6öÖÖöâ6öæf–wW&F–öç2–âF†Râ†VÆ×2w2Æ—FW&À¢òò6÷VçFW"ÖW†×ÆRÂ6†—VBâwV&FVB7&÷72WfW'’7Æ—BæBvöÂà¦FW67&–&R‚&æòÆ–gB—2&W67&–&VBÖ÷&RF†âGv–6RvVV²"Â‚’Óâ°¢6öç7BtôÅ2Ò²&‡—W'G&÷‡’"Â'7G&VæwF‚"Â&fEöÆ÷72"Â&vVæW&Â%Ò26öç7C°¢—BæV6‚„tôÅ2’‚"W2ÂWfW'’7Æ—B"Â†vöÂ’Óâ°¢f÷"†6öç7BF—2öb³Â"Â2ÂBÂRÂeÒ’°¢6öç7B²v÷&¶÷WG2ÒÒvVæW&FU&öw&Ò‚'&V6ö×"ÂF—2ÂVæFVf–æVBÂvöÂ“°¢6öç7B6÷VçG2ÒæWrÖÇ7G&–ærÂçVÖ&W#â‚“°¢f÷"†6öç7BW‚öbv÷&¶÷WG2æfÆDÖ‚†B’ÓâBæW†W&6—6W2’’°¢6÷VçG2ç6WB†W‚ææÖRÂ†6÷VçG2ævWB†W‚ææÖR’óò’²“°¢Ð¢6öç7B÷fW"Ò²ââæ6÷VçG2æVçG&–W2‚•Òæf–ÇFW"‚…²ÂåÒ’Óâââ"“°¢W‡V7B†÷fW"ÂG¶vöÇÒòG¶F—7ÒÖF–’çFôWVÂ…µÒ“°¢Ð¢Ò“° ¢—B‚&ÆVfW2æòGWÆ–6FRW†W&6—6Rv—F†–âç’6–ævÆRF’"Â‚’Óâ°¢òòF†RVæB×FòÖVæBwV&çFVS¢F†R&WVB6×W7Bæ÷BVæFòv†@¢òòFVGWTF”W†W&6—6W2F–BV&Æ–W"–âF†R—VÆ–æRà¢f÷"†6öç7BF—2öb³Â"Â2ÂBÂRÂeÒ’°¢6öç7B²v÷&¶÷WG2ÒÒvVæW&FU&öw&Ò€¢'&V6ö×"À¢F—2À¢VæFVf–æVBÀ¢&‡—W'G&÷‡’ ¢“°¢v÷&¶÷WG2æf÷$V6‚‚†B’Óâ°¢6öç7B–G2ÒBæW†W&6—6W2æÖ‚†R’ÓâRæW†W&6—6T–B“°¢W‡V7B†æWr6WB†–G2’ç6—¦RÂG¶F—7ÒÖF’òG¶BæF”æÖWÖ’çFô&R€¢–G2æÆVæwF€¢“°¢Ò“°¢Ð¢Ò“° ¢—B‚'7F–ÆÂG&–ç2F†R×W66ÆRBF†R7Æ—Bw2&öÖ—6VBg&WVVæ7’"Â‚’Óâ°¢òòF†R6×W7B6†ævRt„”4‚f&–F–öâf–ÆÇ26Æ÷BÂæWfW"†÷rögFVâF†P¢òò×W66ÆR—2G&–æVB(	BF†Bg&WVVæ7’—2v†B7Æ—E&F–öæÆR&öÖ—6W2à¢6öç7B²v÷&¶÷WG2ÒÒvVæW&FU&öw&Ò‚'&V6ö×"Â2ÂVæFVf–æVBÂ&‡—W'G&÷‡’"“°¢6öç7B¶æVTF—2Òv÷&¶÷WG2æf–ÇFW"‚†B’Óà¢BæW†W&6—6W2ç6öÖR‚†R’ÓâRæÖ÷fVÖVçD6FVv÷'’ÓÓÒ&¶æVUöFöÖ–æçB"¢“°¢W‡V7B†¶æVTF—2’çFô†fTÆVæwF‚ƒ2“°¢Ò“°§Ò“°