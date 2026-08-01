/**
 * Training Blocks (PROGRAM-BLOCK-01) — pure model.
 *
 * A private, time-bound layer ABOVE the existing programme: "for the
 * next 4/8/12 weeks I'm doing X, training N times a week, and I'll
 * review what changed at the end." It gives the rolling weekly
 * programme a beginning, middle and end — the story a lifter carries
 * in their head — without replacing `generateProgram`, resetting week
 * history, or touching fatigue/progression state.
 *
 * Locked decisions (plan-file row GsPb1, 2026-07-10):
 *   - presets: Strength Foundation / Muscle Building / Consistency
 *     Reset / Return to Training / Hybrid Support
 *   - durations: 4 / 8 / 12 weeks only
 *   - performance targets OPTIONAL; "success" = consistency (planned
 *     vs completed) plus an optional user-chosen anchor-movement
 *     metric (≤3 anchors, PR-based) — never a universal weight-loss
 *     target; hideWeightNumber respected by every consumer
 *   - end-of-block choices are EXPLICIT (continue / repeat / adjust /
 *     new block) — no silent programme rewrite
 *
 * Storage: `users/{uid}/trainingBlocks/{blockId}` — owner-only
 * (rules), swept on account deletion. One ACTIVE block at a time is
 * a UI constraint, not a schema one (history keeps past blocks).
 */

import type {
  ActiveTrainingBlock,
  BlockPace,
  PrimaryGoal,
} from "./programTypes";

export type BlockPreset =
  | "strength_foundation"
  | "muscle_building"
  | "consistency_reset"
  | "return_to_training"
  | "hybrid_support";

export type BlockDurationWeeks = 4 | 8 | 12;

export type BlockStatus = "active" | "completed" | "abandoned";

/** Explicit end-of-block decisions — never a silent rewrite. */
export type BlockOutcomeChoice = "continue" | "repeat" | "adjust" | "new";

/** Closed vocabularies, for validating an untrusted Firestore read. */
const PRIMARY_GOALS: readonly PrimaryGoal[] = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "general",
  "running",
];
const BLOCK_PACES: readonly BlockPace[] = ["full", "lighter", "easing"];

export interface TrainingBlock {
  /** Doc id — `${startDate}-${createdAt}`, readable and unique per block. */
  id: string;
  /**
   * The pre-Blk2 preset. OPTIONAL because Blk2 replaces it with the
   * `focus` × `pace` pair; every archived block written before that still
   * carries one, and must keep parsing.
   */
  preset?: BlockPreset;
  /** Editable display title, defaults to the preset label. */
  title: string;
  /** Local YYYY-MM-DD the block starts (a Monday is conventional but
   *  not required — weeks are counted from this date). */
  startDate: string;
  durationWeeks: BlockDurationWeeks;
  /** Target lift count per week — inherited from the programme's
   *  weekly schedule at creation, editable. */
  weeklyLiftTarget: number;
  /** Optional anchor movements (exerciseIds, ≤3) whose PRs the block
   *  review surfaces. Optional by locked decision. */
  anchorExerciseIds: string[];
  /** Personal "why" — inherited from profile.trainingWhy at creation,
   *  editable per block. Empty string = none. */
  why: string;
  status: BlockStatus;
  /** Set when status leaves "active". */
  endedAt?: number;
  /** The explicit end-of-block choice, recorded at review. */
  outcome?: BlockOutcomeChoice;
  /* ─── Blk2 archive fields ──────────────────────────────────────
     What the block actually did to the programme, recorded when it is
     archived. All optional: pre-Blk2 rows have none of them, and a block
     is legible without them. `ActiveTrainingBlock` in programTypes.ts is
     the live counterpart — this is the finished record. ── */
  /** Training focus the block prescribed. */
  focus?: PrimaryGoal;
  pace?: BlockPace;
  /** The standing focus restored at release. */
  goalBefore?: PrimaryGoal;
  /**
   * Whether the block owned the prescription. Absent or false for the
   * pre-Blk2 wrapper blocks and for one adopted at deploy.
   */
  owned?: boolean;
  /** True when the user ended it before the window elapsed. */
  endedEarly?: true;
  /** ms epoch, client clock. */
  createdAt: number;
}

export const BLOCK_PRESETS: Array<{
  value: BlockPreset;
  label: string;
  description: string;
}> = [
  {
    value: "strength_foundation",
    label: "Strength Foundation",
    description: "Get stronger at your main lifts with steady progression.",
  },
  {
    value: "muscle_building",
    label: "Muscle Building",
    description: "Consistent volume, week over week, for growth.",
  },
  {
    value: "consistency_reset",
    label: "Consistency Reset",
    description: "Rebuild the habit — showing up is the whole goal.",
  },
  {
    value: "return_to_training",
    label: "Return to Training",
    description: "Ease back in after time away, without the guilt.",
  },
  {
    value: "hybrid_support",
    label: "Hybrid Support",
    description: "Lifting that supports your running, not competes with it.",
  },
];

export const BLOCK_DURATIONS: BlockDurationWeeks[] = [4, 8, 12];

/**
 * The training-focus vocabulary, shared by the block picker and the
 * lift-plan editor.
 *
 * One source of truth on purpose. Blk1's original confusion was two
 * pickers speaking the same vocabulary with different effects; under Blk2
 * they have the SAME effect, so the words must also be the same, or the
 * user sees "Muscle Building" in one place and "Build muscle" in the other
 * for what is now literally one setting.
 */
export const FOCUS_LABELS: Record<PrimaryGoal, string> = {
  hypertrophy: "Build muscle",
  strength: "Get stronger",
  fat_loss: "Lose fat",
  general: "Stay fit",
  running: "Running support",
};

export function focusLabel(goal: PrimaryGoal): string {
  return FOCUS_LABELS[goal] ?? FOCUS_LABELS.general;
}

/** Ordered for the picker — the two most-asked-for first. */
export const FOCUS_ORDER: readonly PrimaryGoal[] = [
  "hypertrophy",
  "strength",
  "fat_loss",
  "general",
  "running",
];

export const PACE_OPTIONS: ReadonlyArray<{
  value: BlockPace;
  label: string;
  description: string;
}> = [
  {
    value: "full",
    label: "Full",
    description: "Your sessions as they are.",
  },
  {
    value: "lighter",
    label: "Lighter",
    description: "The short session is offered first, every time.",
  },
  {
    value: "easing",
    label: "Easing back in",
    description:
      "Short session first, and your weights hold steady for two weeks.",
  },
];

/**
 * Map a pre-Blk2 block into the live shape, for a user who had one open
 * when Blk2 shipped.
 *
 * Without this the block simply DISAPPEARS: the archive doc still says
 * `status: "active"`, but `programState.trainingBlock` is absent, so the
 * Lift tab offers "Start a training block" as though they never had one.
 *
 * `owned: false` is the whole point of the field. A legacy block was a
 * narrative wrapper — it never represcribed anything — so it must not have
 * a prescription applied on adoption, nor released on exit. It runs out
 * its window and ends the way it always would have.
 *
 * The two "habit" presets DO become a pace, because that is what they
 * always were: Consistency Reset promised "showing up is the whole goal"
 * and Return to Training promised "ease back in", and neither did anything
 * before. Pace governs how a session is OFFERED, not what it prescribes,
 * so applying it to an unowned block is consistent with `owned: false`.
 */
export function paceFromLegacyPreset(
  preset: BlockPreset | undefined
): BlockPace {
  switch (preset) {
    case "consistency_reset":
      return "lighter";
    case "return_to_training":
      return "easing";
    default:
      return "full";
  }
}

/**
 * Build the live block from a legacy archive row. `currentFocus` is used
 * for BOTH `focus` and `goalBefore` — the block never changed the focus,
 * so there is nothing to restore that is not already in force, and making
 * them equal means a release is a no-op by construction.
 */
export function legacyToActiveBlock(
  legacy: TrainingBlock,
  currentFocus: PrimaryGoal
): ActiveTrainingBlock {
  return {
    id: legacy.id,
    owned: false,
    focus: currentFocus,
    goalBefore: currentFocus,
    pace: paceFromLegacyPreset(legacy.preset),
    durationWeeks: legacy.durationWeeks,
    startDate: legacy.startDate,
    amnestyWeeksLeft: 0,
    weeklyLiftTarget: legacy.weeklyLiftTarget,
    anchorExerciseIds: legacy.anchorExerciseIds,
    why: legacy.why,
    createdAt: legacy.createdAt,
    schemaVersion: 1,
  };
}

/** Where a user's training blocks live. The ONLY place the collection
 *  name is written — `useTrainingBlock` reads the list and writes
 *  individual docs, so the name used to appear at three call sites plus
 *  here, with only this copy under test. */
export function blocksCollectionPath(uid: string): string {
  return `users/${uid}/trainingBlocks`;
}

export function blockDocPath(uid: string, blockId: string): string {
  return `${blocksCollectionPath(uid)}/${blockId}`;
}

/**
 * Archive doc id. Readable, and unique per BLOCK rather than per
 * (day, preset).
 *
 * Was `${startDate}-${preset}`, which collides for real: the archive write
 * is a no-merge `setDoc`, so starting a block, ending it and starting
 * another of the same kind on the same calendar day silently OVERWRITES the
 * row that was just completed. That is live data loss today, not a
 * hypothetical for Blk2 — it just gets easier to hit once "change focus"
 * exists as a one-tap action.
 *
 * `createdAt` rather than the preset because Blk2 retires the preset
 * vocabulary, and a block's identity was never really its kind.
 */
export function makeBlockId(startDate: string, createdAt: number): string {
  return `${startDate}-${createdAt}`;
}

/** Local YYYY-MM-DD → ms epoch at local midnight. */
function localDateMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Exclusive end date (the day AFTER the last block day), YYYY-MM-DD. */
export function blockEndDate(
  block: Pick<TrainingBlock, "startDate" | "durationWeeks">
): string {
  const end = new Date(
    localDateMs(block.startDate) + block.durationWeeks * WEEK_MS
  );
  const y = end.getFullYear();
  const m = String(end.getMonth() + 1).padStart(2, "0");
  const d = String(end.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 1-based week number of `today` within the block, or null when
 * `today` is before the start or on/after the exclusive end.
 */
export function blockWeekOf(
  block: Pick<TrainingBlock, "startDate" | "durationWeeks">,
  today: string
): number | null {
  const elapsed = localDateMs(today) - localDateMs(block.startDate);
  if (elapsed < 0) return null;
  const week = Math.floor(elapsed / WEEK_MS) + 1;
  return week > block.durationWeeks ? null : week;
}

/** True once `today` reaches the exclusive end — time for the review. */
export function isBlockFinished(
  block: Pick<TrainingBlock, "startDate" | "durationWeeks">,
  today: string
): boolean {
  return localDateMs(today) >= localDateMs(blockEndDate(block));
}

/**
 * Boundary guard for Firestore reads. Null for anything malformed.
 *
 * RELAX, NEVER TIGHTEN. This is all-or-nothing and `useTrainingBlock`
 * filters the nulls out silently, so adding a REQUIRED field here makes
 * every pre-existing block disappear from the user's history with nothing
 * logged and nothing surfaced. The same goes for the return literal below:
 * a field not named there is stripped on read and then destroyed by the
 * next full-document write, so new fields have to be carried explicitly
 * even though they are optional.
 */
export function parseTrainingBlock(data: unknown): TrainingBlock | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // Blk2 retires the preset vocabulary, so ABSENT is legal — but a preset
  // that is present and unrecognised is still malformed.
  const presetValid =
    d.preset === undefined || BLOCK_PRESETS.some((p) => p.value === d.preset);
  const durationValid =
    d.durationWeeks === 4 || d.durationWeeks === 8 || d.durationWeeks === 12;
  const statusValid =
    d.status === "active" ||
    d.status === "completed" ||
    d.status === "abandoned";
  if (
    typeof d.id !== "string" ||
    !presetValid ||
    typeof d.title !== "string" ||
    typeof d.startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(d.startDate) ||
    !durationValid ||
    typeof d.weeklyLiftTarget !== "number" ||
    !statusValid ||
    typeof d.createdAt !== "number"
  ) {
    return null;
  }
  const anchors = Array.isArray(d.anchorExerciseIds)
    ? d.anchorExerciseIds
        .filter((a): a is string => typeof a === "string")
        .slice(0, 3)
    : [];
  const outcome =
    d.outcome === "continue" ||
    d.outcome === "repeat" ||
    d.outcome === "adjust" ||
    d.outcome === "new"
      ? d.outcome
      : undefined;
  const focus = PRIMARY_GOALS.find((g) => g === d.focus);
  const pace = BLOCK_PACES.find((p) => p === d.pace);
  const goalBefore = PRIMARY_GOALS.find((g) => g === d.goalBefore);
  return {
    id: d.id,
    ...(d.preset !== undefined ? { preset: d.preset as BlockPreset } : {}),
    title: d.title,
    startDate: d.startDate,
    durationWeeks: d.durationWeeks as BlockDurationWeeks,
    weeklyLiftTarget: d.weeklyLiftTarget,
    anchorExerciseIds: anchors,
    why: typeof d.why === "string" ? d.why : "",
    status: d.status as BlockStatus,
    ...(typeof d.endedAt === "number" ? { endedAt: d.endedAt } : {}),
    ...(outcome ? { outcome } : {}),
    // Blk2 archive fields. Carried so a finished block records what it
    // actually did to the programme — without them the history would
    // re-render every Blk2 block as an unlabelled wrapper.
    ...(focus ? { focus } : {}),
    ...(pace ? { pace } : {}),
    ...(goalBefore ? { goalBefore } : {}),
    ...(typeof d.owned === "boolean" ? { owned: d.owned } : {}),
    ...(d.endedEarly === true ? { endedEarly: true as const } : {}),
    createdAt: d.createdAt,
  };
}
