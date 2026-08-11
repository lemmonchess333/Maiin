import type { ScheduledRunDay } from "@/features/program/programTypes";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
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
  [
    "long_6k",
    "long_8k",
    "long_10k",
    "long_12k",
    "long_15k",
    "long_20k",
    "long_25k",
    "long_30k",
  ],
];

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

/** The rung below `templateId`, or null when it is a floor / not laddered. */
export function stepDownOneRung(templateId: string): string | null {
  for (const ladder of DELOAD_LADDERS) {
    const i = ladder.indexOf(templateId);
    if (i > 0) return ladder[i - 1];
    if (i === 0) return null; // floor — nowhere below
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
