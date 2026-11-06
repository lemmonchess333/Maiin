import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { STARTER_STAGE_TEMPLATE_IDS } from "./starterPlan";

/** A factual report, separate from a completion tick or capacity confirmation. */
export interface NoviceTrainingReport {
  activityId: string;
  date: string;
  source?: "saved_activity" | "outside_session";
  durationSeconds?: number;
  relativeEffort?: "easier" | "matched" | "harder" | null;
  /** Explicit answer about completing the session, never prefilled true. */
  sessionCompletedAsDescribed?: boolean;
  completedStage?: number;
  manageable?: boolean;
}

export interface VerifiedNoviceActivity {
  activityId: string;
  date: string;
  durationSeconds: number;
  invalid?: boolean;
}

/** Normalizes evidence for the isolated candidate only. A future authenticated
 * reader supplies verifiedActivities from the same user's records. A report
 * naming a saved activity cannot override that activity's date or duration.
 * Outside sessions remain visibly self-reported and never create saved runs. */
export function reconcileNoviceTrainingEvidence(
  reports: readonly NoviceTrainingReport[],
  verifiedActivities: readonly VerifiedNoviceActivity[],
  today: string
): { accepted: NoviceTrainingReport[]; needsReview: string[] } {
  const validDate = (date: string) =>
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(parseLocalDate(date).getTime()) &&
    localDateString(parseLocalDate(date)) === date;
  const validDuration = (seconds: number | undefined) =>
    typeof seconds === "number" &&
    Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= 86400;
  const accepted: NoviceTrainingReport[] = [];
  const needsReview = new Set<string>();
  for (const report of reports) {
    const matches = verifiedActivities.filter(
      (activity) => activity.activityId === report.activityId
    );
    const verified = matches.length === 1 ? matches[0] : undefined;
    const sourceValid =
      (report.source === "outside_session" &&
        typeof report.activityId === "string" &&
        report.activityId.startsWith("outside:") &&
        matches.length === 0) ||
      (report.source === "saved_activity" &&
        verified &&
        !verified.invalid &&
        verified.date === report.date &&
        verified.durationSeconds === report.durationSeconds);
    const stageValid =
      report.completedStage === undefined ||
      (Number.isInteger(report.completedStage) &&
        report.completedStage >= 1 &&
        report.completedStage <= STARTER_STAGE_TEMPLATE_IDS.length);
    const claimedTemplate =
      report.completedStage === undefined
        ? undefined
        : RUN_TEMPLATES.find(
            (template) =>
              template.id ===
              STARTER_STAGE_TEMPLATE_IDS[report.completedStage! - 1]
          );
    // The factual duration includes the described warm-up, walking and cool-down.
    // A shorter recording may be legitimate training, but cannot prove this
    // entire session was completed; retain it for review rather than credit.
    const durationConsistent =
      report.sessionCompletedAsDescribed !== true ||
      (!!claimedTemplate &&
        (report.durationSeconds ?? 0) >=
          claimedTemplate.estimatedDuration * 60);
    const effortValid =
      report.relativeEffort === null ||
      ["easier", "matched", "harder"].includes(report.relativeEffort ?? "");
    if (
      typeof report.activityId !== "string" ||
      !report.activityId.trim() ||
      !sourceValid ||
      !validDate(today) ||
      !validDate(report.date) ||
      report.date > today ||
      !validDuration(report.durationSeconds) ||
      !stageValid ||
      !durationConsistent ||
      !effortValid
    ) {
      needsReview.add(report.activityId);
      continue;
    }
    accepted.push({ ...report });
  }
  // An invalid/conflicting version must not leave a valid-looking duplicate
  // earning credit. Corrections need an authoritative single version first.
  const groups = new Map<string, NoviceTrainingReport[]>();
  for (const report of accepted)
    groups.set(report.activityId, [
      ...(groups.get(report.activityId) ?? []),
      report,
    ]);
  for (const [id, group] of groups) {
    const first = group[0];
    if (
      group.some(
        (row) =>
          row.date !== first.date ||
          row.durationSeconds !== first.durationSeconds ||
          row.source !== first.source ||
          row.relativeEffort !== first.relativeEffort ||
          row.completedStage !== first.completedStage ||
          row.manageable !== first.manageable ||
          row.sessionCompletedAsDescribed !== first.sessionCompletedAsDescribed
      )
    )
      needsReview.add(id);
  }
  return {
    accepted: accepted.filter((report) => !needsReview.has(report.activityId)),
    needsReview: [...needsReview],
  };
}
