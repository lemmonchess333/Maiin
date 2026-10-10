/**
 * A journey's runs, where the journey only needs them to have happened:
 * each planned run saved as the Run page saves it (`journeyRunDoc.ts`), at
 * its planned size, on its own day. The planned run on the screen, from
 * Home's card to the summary, is `planned-run-treadmill.auth.spec.ts`'s.
 */
import { RUN_TEMPLATES } from "../../src/lib/workoutTemplates";
import { stripUndefined } from "../../src/lib/firestoreGuards";
import type { PlanMode } from "../../src/lib/runPlanMetadata";
import type {
  ProgramState,
  ScheduledRunDay,
} from "../../src/features/program/programTypes";
import type { JourneyAccount } from "./journey";
import { journeyRunFields } from "./journeyRunDoc";
import { emulatorAdmin } from "./realCallables";

/** The journey runner's pace, every run: six minutes a kilometre. */
const MINUTES_PER_KM = 6;

/** A planned run's size: its distance where the plan sets one, else its
 *  time, the other at the runner's pace. */
export function plannedSize(run: ScheduledRunDay): {
  km: number;
  minutes: number;
} {
  const template = RUN_TEMPLATES.find(
    (t) => t.id === (run.userOverride ?? run.templateId)
  );
  if (!template) throw new Error(`no run template "${run.templateId}"`);
  const km = template.config.targetDistanceKm;
  if (km) return { km, minutes: km * MINUTES_PER_KM };
  const minutes = template.estimatedDuration;
  return { km: Math.round((minutes / MINUTES_PER_KM) * 10) / 10, minutes };
}

/** `run`, done as planned on its day and saved under an id of its own, so
 *  a run saved twice is still one run. Returns that id. */
export async function fastForwardRun(
  account: JourneyAccount,
  run: ScheduledRunDay,
  plan: Pick<ProgramState, "runPlan" | "runDays">,
  runMode: PlanMode
): Promise<string> {
  if (!run.id || !run.date)
    throw new Error("a planned run has an id and a day");
  const { km, minutes } = plannedSize(run);
  const fields = journeyRunFields({
    run,
    plan,
    runMode,
    finishedAt: new Date(`${run.date}T08:00:00`),
    distance: km * 1000,
    duration: minutes * 60,
  });
  const { db, Timestamp } = emulatorAdmin();
  const runId = `journey-${run.id}`;
  await db.doc(`users/${account.uid}/runs/${runId}`).set(
    stripUndefined({
      ...fields,
      startedAt: Timestamp.fromDate(fields.startedAt),
      completedAt: Timestamp.fromDate(fields.completedAt),
    })
  );
  return runId;
}
