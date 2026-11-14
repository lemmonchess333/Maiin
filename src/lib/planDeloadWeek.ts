import type { ScheduledRunDay } from "@/features/program/programTypes";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";

/**
 * The deload dose ladders — one ordered list per session family, easiest
 * first. Stepping a run "down a rung" means moving one place toward the
 * start of its own ladder.
 *
 * WHY LADDERS AND NOT A PERCENTAGE. The P1d lock words the run half as
 * "reduce long run volume by 25%", and the running evidence handoff's
 * explicit non-adoptions forbid exactly that shape: "a new source-derived
 * or universal taper duration/percentage, long-run cap, race predictor,
 * pace formula...". A flat 25% is a universal percentage. A rung is not —
 * it is a step inside the vocabulary the plan is already written in, so
 * the deloaded week is expressible as ordinary sessions the athlete has
 * seen before, and the reduction is whatever the plan's own spacing says.
 *
 * WHY THE FAMILY IS PRESERVED. The shipped ease-week converts quality to
 * `easy_30`, which is right for its trigger — the athlete tapping "I'm
 * struggling" is asking for a much easier week. It is wrong here: an
 * algorithmic deload that deletes every hard session strips the week's
 * intensity distribution and, mid-build, its specificity. The handoff
 * lists long/easy dose, quality dose, intensity specificity and density
 * as components that "can each change independently", and the taper
 * review it cites treats a taper as reduced VOLUME with the session's
 * purpose intact. So a tempo stays a tempo; it just gets shorter.
 *
 * This also keeps the change to ONE prescription dimension (dose), which
 * the lifting handoff asks for outside a deliberately-composed recipe.
 *
 * FLOORS. The first entry of each ladder has nowhere to go and is left
 * alone — a `long_6k` or a `tempo_20` is not what is driving accumulated
 * fatigue, and inventing a shorter template to satisfy the rule would be
 * worse than doing nothing.
 *
 * `8x400` is deliberately ABSENT from the intervals ladder. It is already
 * the lowest-volume interval session (3.2 km of work vs 4 km for `4x1k`),
 * and stepping `4x1k` onto it would change rep length 1 km → 400 m, which
 * is a different stimulus rather than a smaller dose of the same one.
 * Absent from a ladder means "never stepped, never a target".
 *
 * Ladder membership is pinned against RUN_TEMPLATES by the tests: every
 * id must exist, and every ladder must hold exactly one template `type`.
 */
export const DELOAD_LADDERS: readonly (readonly string[])[] = [
  // easy — plain
  ["easy_30", "easy_40", "easy_50", "easy_60", "easy_75", "easy_90"],
  // easy — strides kept separate so a strides session stays a strides
  // session (the strides ARE the point; dropping them is a family change).
  ["easy_30_strides", "easy_40_strides", "easy_50_strides"],
  ["tempo_20", "tempo_30", "tempo_40"],
  ["4x1k", "5x1k", "6x1k"],
  // Run24 (5): the session library's families, each a smaller dose of
  // itself. The base's light sessions, the taper's sharpeners and the time
  // trials are single sessions with no rung under them, so they are in no
  // ladder.
  ["cruise_3x8", "cruise_3x10"],
  ["progression_40", "progression_50", "progression_60"],
  ["6x2min", "5x3min", "4x4min"],
  ["8x200", "10x200", "12x200"],
  ["5k_pace_4x800", "5k_pace_5x800", "5k_pace_6x800"],
  ["10k_pace_3x2k", "10k_pace_4x2k"],
  ["hills_6x60s", "hills_8x60s", "hills_10x60s"],
  [
    "long_6k",
    "long_8k",
    "long_10k",
    "long_12k",
    "long_14k",
    "long_15k",
    "long_16k",
    "long_18k",
    "long_20k",
    "long_22k",
    "long_24k",
    "long_25k",
    "long_26k",
    "long_28k",
    "long_30k",
    "long_32k",
  ],
];

/**
 * Run24 (5): a tempo or interval session's ladder, for a new runner's
 * minutes (`newRunnerTemplate`): its own family's rungs, so a shorter
 * session is a smaller dose of the same one. A quality session in no ladder
 * is its own only rung, with nothing under it. Null for any other run.
 */
export function qualityRungsFor(
  template: Pick<RunTemplate, "id" | "type">
): readonly string[] | null {
  if (template.type !== "tempo" && template.type !== "intervals") return null;
  return (
    DELOAD_LADDERS.find((ladder) => ladder.includes(template.id)) ?? [
      template.id,
    ]
  );
}

/**
 * Run24 (5): what a quality session's work is, for the fits that shorten
 * one (a time limit, the running starting point): threshold blocks (a
 * tempo, cruise intervals), a progression run, repeats at the interval
 * band, at repetition pace or a race's, hills, a fartlek, a taper's
 * sharpener, or a time trial. Null for a run that is not a tempo or
 * intervals.
 */
function workKindOf(
  template: Pick<RunTemplate, "id" | "type" | "config">
): string | null {
  if (template.type !== "tempo" && template.type !== "intervals") return null;
  const { config } = template;
  // A time trial is fitted to a shorter trial (Run24 (4)).
  if (config.timeTrial) return "trial";
  if (config.taper)
    return `taper:${config.tempo ? "threshold" : config.repeatsAt}`;
  if (config.progression) return "progression";
  if (config.tempo) return "threshold";
  if (config.uphill) return "hills";
  if (config.repeatsAt) return `repeats:${config.repeatsAt}`;
  return config.intervals ? "interval" : `other:${template.id}`;
}

/**
 * Run24 (5): whether a fit may shorten `original` to `candidate`, and how
 * much it would rather: 1 for a rung of the session's own ladder, 0 for
 * another session of the same kind of work (4 × 4 minutes cut to 8 ×
 * 400 m, both repeats at the interval band; cruise intervals to a tempo),
 * null for anything else. So no fit turns a hill session into repeats at a
 * pace, a progression run into a tempo, or cruise intervals into a time
 * trial, nor a taper's sharpener into a build session or back; a session
 * with nothing of its own kind short enough is given an easy run. A run
 * that is not a tempo or intervals keeps its type's rule.
 */
export function shorteningRank(
  original: Pick<RunTemplate, "id" | "type" | "config">,
  candidate: Pick<RunTemplate, "id" | "type" | "config">
): 0 | 1 | null {
  if (candidate.type !== original.type) return null;
  const kind = workKindOf(original);
  if (kind === null) return 0;
  if (workKindOf(candidate) !== kind) return null;
  return qualityRungsFor(original)!.includes(candidate.id) ? 1 : 0;
}

/** One planned change: this run day drops from one template to the next
 *  rung down. Shaped like `EasySwap` (adjustWeek.ts) so both feed
 *  `overrideRunDay` the same way. */
export interface DeloadSwap {
  /** overrideRunDay key — stable runDay id when present, else dayIndex. */
  key: string | number;
  /** Local "YYYY-MM-DD" when the day carries one (drives preview copy). */
  date?: string;
  fromTemplateId: string;
  fromName: string;
  toTemplateId: string;
  toName: string;
}

/** Run24 (6): the long runs' rungs are 2 km apart, so a long run of 16 km
 *  or more steps down 4 km, the size of the step the coarser ladder took
 *  (20 → 15, 25 → 20 km), and a shorter one 2 km, as it did. */
const LONG_STEP_KM = (km: number) => (km >= 16 ? 4 : 2);
const longKmOf = (id: string): number | undefined => {
  const template = RUN_TEMPLATES.find((t) => t.id === id);
  return template?.type === "long"
    ? template.config.targetDistanceKm
    : undefined;
};

/** The rung below `templateId`, or null when it is a floor / not laddered.
 *  A long run steps to the longest rung at or under its distance less
 *  `LONG_STEP_KM`; `long_15k` and `long_25k`, which a plan made before the
 *  2 km ladder holds, step to 12 and 20 km. */
export function stepDownOneRung(templateId: string): string | null {
  for (const ladder of DELOAD_LADDERS) {
    const i = ladder.indexOf(templateId);
    if (i === 0) return null; // floor — nowhere below
    if (i < 0) continue;
    const km = longKmOf(templateId);
    if (km === undefined) return ladder[i - 1];
    const target = km - LONG_STEP_KM(km);
    for (let j = i - 1; j >= 0; j--) {
      const below = longKmOf(ladder[j]);
      if (below !== undefined && below <= target) return ladder[j];
    }
    return ladder[0];
  }
  return null; // races and anything unladdered
}

/**
 * Plan a deload week's run changes: every startable, non-past scheduled
 * run steps down one rung on its own ladder.
 *
 * Mirrors `planEasierWeek`'s guards deliberately — terminal/completed
 * days are facts rather than prescriptions, past days keep their history,
 * and the resolved template honours an existing `userOverride`. Races are
 * excluded by construction: no race id appears in any ladder, so
 * `stepDownOneRung` returns null for them (belt-and-braces on top of the
 * server's own race-immutability refusal).
 */
export function planDeloadWeek(
  runDays: ScheduledRunDay[],
  todayKey: string
): DeloadSwap[] {
  const swaps: DeloadSwap[] = [];
  for (const rd of runDays) {
    if (!isScheduledRunStartable(getScheduledRunStatus(rd))) continue;
    if (rd.date && rd.date < todayKey) continue;
    const resolvedId = rd.userOverride ?? rd.templateId;
    const toId = stepDownOneRung(resolvedId);
    if (!toId) continue;
    const from = RUN_TEMPLATES.find((t) => t.id === resolvedId);
    const to = RUN_TEMPLATES.find((t) => t.id === toId);
    if (!from || !to) continue;
    swaps.push({
      key: rd.id ?? rd.dayIndex,
      date: rd.date,
      fromTemplateId: from.id,
      fromName: from.name,
      toTemplateId: to.id,
      toName: to.name,
    });
  }
  return swaps;
}
