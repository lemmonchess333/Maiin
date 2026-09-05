/**
 * Golden fixture over the whole plan-generation space.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * The v8 pack's Handoff 01 asked for "baseline fixtures" and then spent
 * itself on an `npm ci` failure that does not occur. This is the thing it was
 * reaching for, and it is the prerequisite for every remaining repair in the
 * lifting arc: you cannot safely change `movementCategory` inference, the
 * muscle-attribution map, the `isAccessory` tagging or the template load seeds
 * without first pinning **what the generator actually emits today**.
 *
 * `find src functions -name "*fixture*" -o -name "*golden*"` returned zero
 * files before this. There are ~15 `*.cross.test.ts` parity tests (client ↔
 * server mirrors), but nothing snapshotted the generator's own output, so any
 * change to it was reviewed by reading rather than by diffing.
 *
 * ── The fixture pins WRONG values on purpose ─────────────────────────────
 *
 * Several numbers in the snapshot are defects, and they are recorded as
 * defects rather than quietly accepted — see `KNOWN_DEFECTS` below, and the
 * assertions at the bottom that hold each one in place until its repair lands.
 * A golden file that silently blessed them would be worse than none: it would
 * convert "we have not fixed this yet" into "this is the expected output".
 *
 * When a repair lands, the snapshot diff IS the review artefact — it shows
 * exactly which of the 90 configurations moved and by how much. Update the
 * snapshot in the same commit as the fix, and delete the matching
 * `KNOWN_DEFECTS` entry.
 *
 * ── Determinism ──────────────────────────────────────────────────────────
 *
 * `buildPlan` is a pure function of its input — both `Math.random()` sites
 * were removed from the generator (`variationBank.ts` records the measurement
 * that motivated it: "twelve calls → EIGHT different programmes"). `currentDate`
 * is pinned so nothing reads the clock. If this file ever goes flaky, that
 * determinism has regressed and THAT is the bug.
 */
import { describe, it, expect } from "vitest";

import { buildPlan } from "../planBuilder";
import {
  weeklyVolumeByJudgementMuscle,
  judgementLandmark,
} from "../volumeModel";
import { inferMovementCategory } from "@/lib/exerciseMovementCategory";
import type { PlanBuilderInput } from "../planBuilder";
import type { PrimaryGoal } from "../programTypes";

const GOALS: PrimaryGoal[] = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "general",
  "running",
];
const EQUIPMENT = ["full_gym", "home_gym", "minimal"] as const;
const LIFT_DAYS = [1, 2, 3, 4, 5, 6];

/** A fixed Sunday, so nothing in the plan depends on when the suite runs. */
const CURRENT_DATE = "2026-03-08";

function input(
  liftDays: number,
  equipment: (typeof EQUIPMENT)[number],
  primaryGoal: PrimaryGoal
): PlanBuilderInput {
  return {
    primaryGoal,
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment,
    injuries: [],
    currentDate: CURRENT_DATE,
  } as PlanBuilderInput;
}

interface ConfigSummary {
  config: string;
  splitType: string;
  days: string[];
  /** `exerciseId × sets × reps @ weight`, per day. The prescription itself. */
  prescription: string[];
  /** Weekly sets per JUDGEMENT group, each read against its own per-group
   *  goal band (taxonomy split). This is the tally the balancers and the
   *  reconciler act on. */
  volume: Record<string, string>;
}

function summarise(
  liftDays: number,
  equipment: (typeof EQUIPMENT)[number],
  goal: PrimaryGoal
): ConfigSummary {
  const { programState } = buildPlan(input(liftDays, equipment, goal));
  // Judgement groups with per-group bands (taxonomy split) — the same
  // classification the balancers and reconciler act on, so the ratchet
  // below counts the violations the engine can actually see.
  const tally = weeklyVolumeByJudgementMuscle(programState.workouts);

  const volume: Record<string, string> = {};
  for (const { muscle, sets } of [...tally].sort((a, b) =>
    a.muscle.localeCompare(b.muscle)
  )) {
    const band = judgementLandmark(goal, muscle);
    const status = sets < band.low ? "LOW" : sets > band.high ? "HIGH" : "ok";
    volume[muscle] = `${sets} (${status})`;
  }

  return {
    config: `${liftDays}d/${equipment}/${goal}`,
    splitType: programState.splitType,
    days: programState.workouts.map((d) => d.dayName),
    prescription: programState.workouts.map(
      (d) =>
        `${d.dayName}: ` +
        d.exercises
          .map(
            (e) =>
              `${e.exerciseId}${e.isAccessory === true ? "~" : ""} ${e.sets}×${e.reps}${
                e.repRangeMax ? `-${e.repRangeMax}` : ""
              }@${e.weight}`
          )
          .join(" | ")
    ),
    volume,
  };
}

const SWEEP: ConfigSummary[] = [];
for (const d of LIFT_DAYS) {
  for (const eq of EQUIPMENT) {
    for (const g of GOALS) SWEEP.push(summarise(d, eq, g));
  }
}

describe("plan generation — golden sweep", () => {
  it("covers the whole declared space (guards a silently-shrunk sweep)", () => {
    // If a loop bound is edited down, every snapshot below still "passes"
    // while covering less. Pin the count.
    expect(SWEEP).toHaveLength(
      LIFT_DAYS.length * EQUIPMENT.length * GOALS.length
    );
    expect(SWEEP).toHaveLength(90);
  });

  it("matches the committed snapshot", () => {
    // The snapshot is also the determinism check: both Math.random() sites
    // were removed from the generator, and a build that disagreed with the
    // committed sweep would fail here. (A same-input-twice comparison used
    // to sit beside this; it could only ever agree with itself.)
    expect(SWEEP).toMatchSnapshot();
  });
});

/* ─── Known defects, held in place until their repair lands ──────────────
   Each of these is WRONG and is asserted anyway, so the snapshot above can
   never be read as an endorsement. Delete the assertion in the same commit
   as the fix; if one starts failing because someone fixed it, that is the
   test doing its job and the fix should say so.

   Sources: the three code audits in docs/proposals/lifting-v8-evaluation.md
   §2.4, which measured these but which I had not re-run myself — building
   this fixture is what verifies them. ── */
describe("KNOWN_DEFECTS — asserted so the snapshot is not read as approval", () => {
  /* D-VOL — STILL OPEN, and the largest remaining defect in the generator.
     `overshootsCeiling` only vetoes ADDS, and volumeModel.ts's own comment
     concedes "the builders are not policed by this" — so the tally the model
     publishes disagrees with the bands the model publishes, in the same week.

     P1 moved it without closing it. Per-muscle readings went 196 → 180 over
     ceiling (the attribution fix) and 270 → 263 under floor (the accessory
     fix); by CONFIGURATION it now stands at 53 of 90 over and 60 of 90 under.
     Back still reads HIGH in 45 configurations and Glutes LOW in 40, because
     the day BUILDERS hard-code their slot counts and nothing reconciles them
     against the landmarks afterwards.

     Closing it means making the builders landmark-aware, which changes every
     generated programme and produces a large snapshot diff — P2/P3-sized, not
     a P1 repair. Left as a RATCHET instead: the bounds below are the current
     actuals, so the numbers can only go down. Tighten them whenever they
     improve; the test fails the moment a change makes it worse.

     These bounds are denominated in the JUDGEMENT-layer unit as of the
     2026-08-03 taxonomy split: indirect sets at the literature's 1:1
     (ADR-0010's flip, landed with per-group bands), classified per
     JudgementMuscle against judgementLandmark. Earlier bounds in this file
     were canonical-ten 0.5-currency numbers and are NOT comparable.

     History, so the units are never conflated:
       (canonical, 0.5)  53 over / 60 under  — pre-reconciler
       (canonical, 0.5)  42 over / 68 under  — reconciler + intra-exercise
                                               dedupe (high tightened, low
                                               re-baselined for the dedupe)
       (judged, 1:1)     50 over / 68 under  — taxonomy split + currency
                                               flip. Not a regression from
                                               42: different unit, 14 groups
                                               per config instead of 10, and
                                               severity COLLAPSED — the
                                               worst reading is now <150% of
                                               its ceiling, where the
                                               canonical worst ran 185%
                                               (Back 37 vs 20). Remaining
                                               overs are mild and sit in
                                               secondary-fed groups at the
                                               compressed strength/fat-loss
                                               scalings, where the
                                               reconciler's floors bind.
       (judged, 1:1)     50 over / 55 under  — 2026-08-03 coach-read fixes:
                                               2-day flips to full-body
                                               (2×/muscle frequency), direct
                                               side-delt slots on shoulder-
                                               focus days, calf-specific
                                               band (direct-only pricing).
                                               All 13 fewer unders are real
                                               volume/pricing corrections,
                                               not counting changes.
       (judged, 1:1)     50 over / 47 under  — 2026-08-03 tier coach-read:
                                               the RDL family gains the same
                                               isometric Traps credit the
                                               conventional deadlift always
                                               had (the loaded-hold rule,
                                               muscleTaxonomy.test.ts), so
                                               home/minimal UpperBack stops
                                               reading UNDER for volume the
                                               swap never removed.
     Tighten whenever they improve; the test fails the moment a change makes
     either worse in the CURRENT unit. */
  it("D-VOL: landmark violations are ratcheted and must only shrink", () => {
    const high = SWEEP.filter((s) =>
      Object.values(s.volume).some((v) => v.includes("HIGH"))
    ).length;
    const low = SWEEP.filter((s) =>
      Object.values(s.volume).some((v) => v.includes("LOW"))
    ).length;

    expect(high, `${high} configs over a landmark ceiling`).toBeLessThanOrEqual(
      50
    );
    expect(low, `${low} configs under a landmark floor`).toBeLessThanOrEqual(
      47
    );

    // …and it is genuinely not solved, so the ratchet is never read as a pass.
    expect(high + low).toBeGreaterThan(0);
  });

  /* D-ACC — REPAIRED. Was: `buildFullBody` passed the isAccessory flag but
     `buildUpperLower` and `buildPPL` did not, so arm isolation and core work
     were tagged MAIN. `balanceWeeklyVolume` only grows accessories and
     `applyWeeklyVolumeShape` holds mains flat, so those muscles could never
     be topped up no matter how far under the floor they sat.

     Effect on this snapshot: accessory-tagged slots go 525 → 825, and the
     audit's headline case resolves — 4d/full_gym/hypertrophy had Biceps=10
     against a floor of 12 with no growable slot, and now reads 12. Seven
     fewer under-floor readings overall. The regression pin is below. */
  it("arm isolation and core are ACCESSORIES in every split (D-ACC pin)", () => {
    // The property, not one example: no split may tag arm isolation or core
    // work as a main lift, because that silently disables every volume lever
    // the model has for them.
    const violations: string[] = [];
    for (const s of SWEEP) {
      for (const line of s.prescription) {
        for (const slot of line.split(" | ")) {
          const isArmOrCore =
            /\b(curl|pushdown|tricep|crunch|plank|leg-raise|cable-woodchopper)/i.test(
              slot
            ) && !/nordic|hamstring|leg-curl/i.test(slot);
          if (isArmOrCore && !/~\s/.test(slot)) {
            violations.push(`${s.config} :: ${slot.trim()}`);
          }
        }
      }
    }
    expect(violations, violations.slice(0, 8).join("\n")).toEqual([]);
  });

  it("D-CAT: movementCategory is inferred from the exercise NAME, not stored", () => {
    // First-match-wins keyword matching over the display name. "fly"/"flye"
    // sit under horizontal_push, so `Reverse Flyes` and `Rear Delt Machine
    // Fly` — both PULL movements — classify as PUSH, corrupting the exact
    // `balancePushPull` rail that exists to keep pull ≥ push for the shoulder.
    // Asserted against the inference directly since the generator does not
    // surface the category in the prescription string.
    expect(inferMovementCategory("Reverse Flyes")).toBe("horizontal_push");
    expect(inferMovementCategory("Rear Delt Machine Fly")).toBe(
      "horizontal_push"
    );
    expect(inferMovementCategory("Nordic Hamstring Curl")).toBe("arms_biceps");
    expect(inferMovementCategory("Cable Glute Kickback")).toBe("arms_triceps");
  });

  /* D-MAP — REPAIRED. Was: adductors and hip flexors both mapped to "Quads",
     so a Hip Adduction Machine booked quad volume and every ab movement fed
     the quad tally through its hip-flexor secondary; a trailing-space
     `"hip flexors "` key contradicted the live one from an unreachable line;
     and an unattributable PRIMARY discarded the whole lift, so thirteen
     "Full Body" movements trained nothing.

     Effect on this snapshot: 16 fewer false HIGH readings across the 90
     configurations, and Quads drops by 1 wherever ab work had been inflating
     it. The decisions now live as assertions in `volumeModel.test.ts` so they
     have to be argued with rather than silently reverted. */
});
