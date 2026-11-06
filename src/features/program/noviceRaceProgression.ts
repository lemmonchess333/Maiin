import {
  reconcileNoviceTrainingEvidence,
  type NoviceTrainingReport,
  type VerifiedNoviceActivity,
} from "./noviceTrainingEvidence";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { STARTER_STAGE_TEMPLATE_IDS } from "./starterPlan";

/** Explicit adoption only. This is not inferred from signup age or race date. */
export interface NoviceRaceProgressionInput {
  state: { stage: number; stageStartedOn: string };
  /** null means unavailable, not that the runner did no training. */
  reports: readonly NoviceTrainingReport[] | null;
  /** Same-account saved facts supplied by an authenticated reader, never by the report. */
  verifiedActivities?: readonly VerifiedNoviceActivity[];
  /** Deliberate capacity adoption, distinct from confirming an activity. */
  capacityConfirmation?: {
    stage: number;
    confirmedOn: string;
    raceGoal: { distance: string; targetDate: string };
  };
  /** Independent holds compose. A readiness answer cannot clear them. */
  holds?: readonly (
    "injury" | "post_race" | "clinical_restriction" | "plan_changed"
  )[];
  /** Explicit current check-in, never inferred from elapsed time or HR. */
  recovery: "ready" | "not_ready" | "unknown";
}

export interface NoviceRaceProgressionResult {
  state: NoviceRaceProgressionInput["state"];
  templateId: string;
  /** Proposed only; accepting it must persist a new current capacity confirmation. */
  proposedState?: NoviceRaceProgressionInput["state"];
  proposedTemplateId?: string;
  reason:
    | "repeat"
    | "advance_available"
    | "check_in"
    | "history_unavailable"
    | "baseline_review";
  creditedDays: string[];
  reportsNeedingReview: string[];
  /** Every race stays an event, not proof of readiness at any distance. */
  raceReadiness: "not_assessed";
  /** Withhold future prescriptions until recovery is explicitly checked. */
  prescribe: boolean;
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parseLocalDate(value).getTime()) &&
    localDateString(parseLocalDate(value)) === value
  );
}

/** Candidate policy: two distinct, explicitly manageable stage completions,
 * at most one advancement at a calendar boundary. Two credits and the 21-day
 * window are product heuristics, not clinical thresholds. Beyond 30 minutes
 * requires a separate baseline review; never catch up to a fixed race date.
 * This policy is opt-in in the generator, not yet activated by app writers. */
export function resolveNoviceRaceProgression(
  input: NoviceRaceProgressionInput,
  today: string
): NoviceRaceProgressionResult {
  const stage =
    Number.isInteger(input.state.stage) &&
    input.state.stage >= 1 &&
    input.state.stage <= STARTER_STAGE_TEMPLATE_IDS.length
      ? input.state.stage
      : 1;
  const state = { stage, stageStartedOn: input.state.stageStartedOn };
  const result: NoviceRaceProgressionResult = {
    state,
    templateId: STARTER_STAGE_TEMPLATE_IDS[stage - 1],
    reason: "repeat",
    creditedDays: [],
    reportsNeedingReview: [],
    raceReadiness: "not_assessed",
    prescribe: true,
  };
  if (
    stage !== input.state.stage ||
    !validDate(today) ||
    !validDate(state.stageStartedOn) ||
    state.stageStartedOn > today ||
    input.recovery !== "ready" ||
    (input.holds?.length ?? 0) > 0 ||
    !input.capacityConfirmation ||
    !Number.isInteger(input.capacityConfirmation.stage) ||
    input.capacityConfirmation.stage < 1 ||
    input.capacityConfirmation.stage !== stage ||
    !validDate(input.capacityConfirmation.confirmedOn) ||
    input.capacityConfirmation.confirmedOn > state.stageStartedOn
  ) {
    return { ...result, reason: "check_in", prescribe: false };
  }
  if (input.reports === null)
    return { ...result, reason: "history_unavailable" };
  const evidence = reconcileNoviceTrainingEvidence(
    input.reports,
    input.verifiedActivities ?? [],
    today
  );
  result.reportsNeedingReview = evidence.needsReview;
  const week = localWeekKey(parseLocalDate(today));
  const earliest = localDateString(addLocalDays(parseLocalDate(week), -21));
  // Conflicting duplicate identities cannot be counted twice or selectively
  // treated as successful. The UI must reconcile them before giving credit.
  const identities = new Map<string, (typeof input.reports)[number][]>();
  for (const report of evidence.accepted) {
    if (!report.activityId) continue;
    identities.set(report.activityId, [
      ...(identities.get(report.activityId) ?? []),
      report,
    ]);
  }
  result.creditedDays = [
    ...new Set(
      [...identities.values()]
        .filter((group) => {
          const first = group[0];
          return (
            group.every(
              (row) =>
                row.date === first.date &&
                row.completedStage === stage &&
                row.manageable === true &&
                row.sessionCompletedAsDescribed === true &&
                row.relativeEffort !== "harder"
            ) &&
            validDate(first.date) &&
            first.date >= state.stageStartedOn &&
            first.date >= earliest &&
            first.date < week
          );
        })
        .map((group) => group[0].date)
    ),
  ].sort();
  if (result.creditedDays.length < 2) return result;
  if (stage === STARTER_STAGE_TEMPLATE_IDS.length)
    return { ...result, reason: "baseline_review" };
  return {
    ...result,
    proposedState: { stage: stage + 1, stageStartedOn: today },
    proposedTemplateId: STARTER_STAGE_TEMPLATE_IDS[stage],
    reason: "advance_available",
  };
}
