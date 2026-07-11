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

export interface TrainingBlock {
  /** Doc id — `${startDate}-${preset}` keeps ids stable + readable. */
  id: string;
  preset: BlockPreset;
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

export function presetLabel(preset: BlockPreset): string {
  return BLOCK_PRESETS.find((p) => p.value === preset)?.label ?? preset;
}

/**
 * Blk1 lock (1): the explicit programme hand-off is offered ONLY where a
 * truthful one-field prefill exists — the preset maps to a PrimaryGoal the
 * lift-plan editor can preselect. The two habit presets return null: their
 * point is "same programme, just show up", and a wrong prefill is worse
 * than none. This mapping is the single source of truth for the offer.
 */
export function presetProgrammeGoal(
  preset: BlockPreset
): "strength" | "hypertrophy" | "running" | null {
  switch (preset) {
    case "strength_foundation":
      return "strength";
    case "muscle_building":
      return "hypertrophy";
    case "hybrid_support":
      return "running";
    case "consistency_reset":
    case "return_to_training":
      return null;
  }
}

export function blockDocPath(uid: string, blockId: string): string {
  return `users/${uid}/trainingBlocks/${blockId}`;
}

export function makeBlockId(startDate: string, preset: BlockPreset): string {
  return `${startDate}-${preset}`;
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

/** Boundary guard for Firestore reads. Null for anything malformed. */
export function parseTrainingBlock(data: unknown): TrainingBlock | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const presetValid = BLOCK_PRESETS.some((p) => p.value === d.preset);
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
  return {
    id: d.id,
    preset: d.preset as BlockPreset,
    title: d.title,
    startDate: d.startDate,
    durationWeeks: d.durationWeeks as BlockDurationWeeks,
    weeklyLiftTarget: d.weeklyLiftTarget,
    anchorExerciseIds: anchors,
    why: typeof d.why === "string" ? d.why : "",
    status: d.status as BlockStatus,
    ...(typeof d.endedAt === "number" ? { endedAt: d.endedAt } : {}),
    ...(outcome ? { outcome } : {}),
    createdAt: d.createdAt,
  };
}
