/**
 * programmeChanges — single source of truth for "what is the user about to
 * change?" on the Pgm4 unified Programme Settings editor.
 *
 * The save flow rebuilds the plan (lift workouts + run plan regenerate) behind
 * a confirmation. Two things must agree, or the UI lies:
 *   - the sticky save bar's enabled/disabled state ("is the form dirty?"), and
 *   - the "Changes" recap shown inside the confirm modal.
 *
 * Deriving both from ONE function guarantees they can't drift: `dirty` is just
 * `computeProgrammeChanges(...).length > 0`. The gating below mirrors the engine
 * exactly — run days only count outside freeform, race fields only in race_prep
 * — so the recap never shows a phantom change that wouldn't actually rebuild.
 *
 * NOTE this is a *recap* of the inputs the user touched, not a preview of the
 * regenerated plan. It answers "did I change what I meant to?" on a multi-field
 * edit; it does not claim to show the resulting workouts.
 */

export interface ProgrammeSnapshot {
  primaryGoal: string;
  nutritionPhase: string;
  experience: string;
  liftDays: number;
  preferredSplit: string;
  equipment: string;
  injuries: string[];
  runMode: string;
  weeklyRunDays: number;
  raceDistance: string;
  raceTargetDate: string;
}

export interface ProgrammeChange {
  /** Field label, e.g. "Lift days". */
  label: string;
  /** Human-readable previous value. */
  from: string;
  /** Human-readable new value. */
  to: string;
}

// Label maps mirror the editor's option copy. A missing key degrades to the
// raw value rather than throwing, so an un-mapped future enum shows its id
// instead of crashing the confirm modal.
const FOCUS_LABELS: Record<string, string> = {
  hypertrophy: "Build muscle",
  strength: "Get stronger",
  fat_loss: "Lose fat",
  general: "Stay fit",
  running: "Running support",
};

const NUTRITION_LABELS: Record<string, string> = {
  cut: "Cutting",
  "lean bulk": "Lean bulk",
  recomp: "Recomp",
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const SPLIT_LABELS: Record<string, string> = {
  auto: "No preference",
  full_body: "Full Body",
  upper_lower: "Upper / Lower",
  ppl: "Push / Pull / Legs",
};

const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: "Full gym",
  home_gym: "Home gym",
  minimal: "Minimal / bodyweight",
};

const INJURY_LABELS: Record<string, string> = {
  lower_back: "Lower back",
  shoulder: "Shoulder",
  knee: "Knee",
  elbow: "Elbow",
  wrist: "Wrist",
};

const RUN_MODE_LABELS: Record<string, string> = {
  freeform: "Freeform",
  structured: "Structured",
  race_prep: "Race prep",
};

const RACE_DISTANCE_LABELS: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  half: "Half Marathon",
  marathon: "Marathon",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function labelFrom(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

function injuriesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

function injuriesLabel(injuries: string[]): string {
  const real = injuries.filter((id) => id !== "none");
  if (real.length === 0) return "None";
  return real.map((id) => INJURY_LABELS[id] ?? id).join(", ");
}

/**
 * Format a "YYYY-MM-DD" race date as "12 Jun 2026". Parsed by parts (not
 * `new Date(iso)`) to avoid the UTC-midnight off-by-one in negative timezones.
 */
function formatRaceDate(iso: string): string {
  if (!iso) return "Not set";
  const parts = iso.split("-").map(Number);
  const [y, m, d] = parts;
  if (parts.length !== 3 || !y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Diff the persisted snapshot against the draft, returning one row per
 * plan-shaping field the user actually changed. `[]` means nothing to save.
 */
export function computeProgrammeChanges(
  saved: ProgrammeSnapshot,
  draft: ProgrammeSnapshot
): ProgrammeChange[] {
  const changes: ProgrammeChange[] = [];

  if (draft.primaryGoal !== saved.primaryGoal) {
    changes.push({
      label: "Training focus",
      from: labelFrom(FOCUS_LABELS, saved.primaryGoal),
      to: labelFrom(FOCUS_LABELS, draft.primaryGoal),
    });
  }

  if (draft.nutritionPhase !== saved.nutritionPhase) {
    changes.push({
      label: "Nutrition phase",
      from: labelFrom(NUTRITION_LABELS, saved.nutritionPhase),
      to: labelFrom(NUTRITION_LABELS, draft.nutritionPhase),
    });
  }

  if (draft.experience !== saved.experience) {
    changes.push({
      label: "Experience",
      from: labelFrom(EXPERIENCE_LABELS, saved.experience),
      to: labelFrom(EXPERIENCE_LABELS, draft.experience),
    });
  }

  if (draft.liftDays !== saved.liftDays) {
    changes.push({
      label: "Lift days",
      from: String(saved.liftDays),
      to: String(draft.liftDays),
    });
  }

  if (draft.preferredSplit !== saved.preferredSplit) {
    changes.push({
      label: "Preferred split",
      from: labelFrom(SPLIT_LABELS, saved.preferredSplit),
      to: labelFrom(SPLIT_LABELS, draft.preferredSplit),
    });
  }

  if (draft.equipment !== saved.equipment) {
    changes.push({
      label: "Equipment",
      from: labelFrom(EQUIPMENT_LABELS, saved.equipment),
      to: labelFrom(EQUIPMENT_LABELS, draft.equipment),
    });
  }

  if (!injuriesEqual(draft.injuries, saved.injuries)) {
    changes.push({
      label: "Injuries",
      from: injuriesLabel(saved.injuries),
      to: injuriesLabel(draft.injuries),
    });
  }

  if (draft.runMode !== saved.runMode) {
    changes.push({
      label: "Running",
      from: labelFrom(RUN_MODE_LABELS, saved.runMode),
      to: labelFrom(RUN_MODE_LABELS, draft.runMode),
    });
  }

  // Run days only matter outside freeform — mirror the engine's gating.
  if (
    draft.runMode !== "freeform" &&
    draft.weeklyRunDays !== saved.weeklyRunDays
  ) {
    changes.push({
      label: "Run days",
      from: String(saved.weeklyRunDays),
      to: String(draft.weeklyRunDays),
    });
  }

  // Race fields only matter in race_prep.
  if (draft.runMode === "race_prep") {
    if (draft.raceDistance !== saved.raceDistance) {
      changes.push({
        label: "Race distance",
        from: labelFrom(RACE_DISTANCE_LABELS, saved.raceDistance),
        to: labelFrom(RACE_DISTANCE_LABELS, draft.raceDistance),
      });
    }
    if (draft.raceTargetDate !== saved.raceTargetDate) {
      changes.push({
        label: "Race date",
        from: formatRaceDate(saved.raceTargetDate),
        to: formatRaceDate(draft.raceTargetDate),
      });
    }
  }

  return changes;
}

/**
 * The Pgm5 "what's preserved" reassurance for the Save-changes confirm modal —
 * made visible so a cautious user knows recalibrating won't nuke their history.
 *
 * Single-sourced + testable (was an inline JSX ternary). A lift-days change
 * re-derives the skeleton (custom exercises reset); a content edit keeps the
 * workouts verbatim. Either way `preserveHistory: true` keeps the week count,
 * weekHistory, fatigue, and logged sessions — so we name the actual week.
 */
export function programmePreservationNote(args: {
  liftDaysChanged: boolean;
  weekNumber?: number;
}): string {
  const week =
    typeof args.weekNumber === "number" && args.weekNumber > 0
      ? `Week ${args.weekNumber}`
      : "Your current week";
  return args.liftDaysChanged
    ? `Changing your lift days rebuilds your weekly structure. Any exercises you've added, removed, or reordered will be reset to the new plan. ${week}, your history, and logged sessions are kept.`
    : `We'll update your plan with these settings and keep your current workouts — including any exercises you've customised. ${week}, your history, and logged sessions stay.`;
}
