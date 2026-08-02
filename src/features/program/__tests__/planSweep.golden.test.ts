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
  weeklyVolumeByMuscle,
  volumeLandmark,
  toCanonical,
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
  /** Weekly sets per canonical muscle, and how each reads against the goal's
   *  landmark band. This is the tally the whole volume model rests on. */
  volume: Record<string, string>;
}

function summarise(
  liftDays: number,
  equipment: (typeof EQUIPMENT)[number],
  goal: PrimaryGoal
): ConfigSummary {
  const { programState } = buildPlan(input(liftDays, equipment, goal));
  const band = volumeLandmark(goal);
  const tally = weeklyVolumeByMuscle(programState.workouts);

  const volume: Record<string, string> = {};
  for (const { muscle, sets } of [...tally].sort((a, b) =>
    a.muscle.localeCompare(b.muscle)
  )) {
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

  it("is deterministic — two builds of the same input agree exactly", () => {
    // The precondition for everything else here. Both Math.random() sites
    // were removed from the generator; if this fails, that regressed.
    for (const g of GOALS) {
      expect(summarise(4, "full_gym", g)).toEqual(summarise(4, "full_gym", g));
    }
  });

  it("matches the committed snapshot", () => {
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
  const find = (c: string) => SWEEP.find((s) => s.config === c)!;

  it("D-VOL: the generator violates its own landmark bands, in BOTH directions", () => {
    // volumeModel's `overshootsCeiling` only vetoes ADDS; volumeModel.ts's own
    // comment concedes "the builders are not policed by this". So the tally it
    // publishes disagrees with the bands it publishes, in the same week.
    const offenders = SWEEP.filter((s) =>
      Object.values(s.volume).some((v) => v.includes("HIGH"))
    );
    expect(offenders.length).toBeGreaterThan(0);

    const underfed = SWEEP.filter((s) =>
      Object.values(s.volume).some((v) => v.includes("LOW"))
    );
    expect(underfed.length).toBeGreaterThan(0);
  });

  it("D-ACC: upper/lower and PPL tag arm isolation as MAIN lifts", () => {
    // `buildFullBody` passes the isAccessory flag; `buildUpperLower` and
    // `buildPPL` do not for their vertical-push, biceps, triceps and core
    // slots. Consequence: `balanceWeeklyVolume` can only grow accessories, so
    // those muscles can never be topped up, and `applyWeeklyVolumeShape`
    // holds them flat because it treats them as progression anchors.
    const day1 = find("4d/full_gym/hypertrophy").prescription[0];
    // Named explicitly rather than regex-sniffed, so this cannot quietly pass
    // against a plan that no longer contains them.
    expect(day1).toContain("barbell-curl ");
    expect(day1).toContain("rope-tricep-pushdown ");
    // …and neither carries the `~` marker, i.e. both are MAIN lifts.
    expect(day1).not.toContain("barbell-curl~");
    expect(day1).not.toContain("rope-tricep-pushdown~");
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

  it("D-MAP: the muscle map mis-attributes and silently drops muscles", () => {
    // Anatomically wrong: adductors and hip flexors are not quadriceps, so a
    // Hip Adduction Machine currently books quad volume.
    expect(toCanonical("adductors")).toBe("Quads");
    expect(toCanonical("hip flexors")).toBe("Quads");
    // Dropped entirely: forearm work earns zero volume anywhere.
    expect(toCanonical("Forearms")).toBeNull();
    expect(toCanonical("Brachioradialis")).toBeNull();
  });
});
