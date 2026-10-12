/**
 * A journey's lift sessions: through the workout screen where the journey
 * looks at it, and through the app's own engine where the session only has
 * to have happened.
 */
import { expect, type Page } from "@playwright/test";
import { nextUpIndex } from "../../src/features/program/nextUpCursor";
import type { ProgramState } from "../../src/features/program/programTypes";
import {
  applySessionProgression,
  sessionPrescription,
  toSessionProgression,
} from "../../src/features/program/sessionCompletion";
import type { LoggedSet } from "../../src/features/program/workoutSetRecord";
import { stripUndefined } from "../../src/lib/firestoreGuards";
import {
  markDayDone,
  storeSessionProgression,
  workoutCompletionDayIdentity,
} from "../../src/lib/workoutCompletion";
import type { WorkoutDay } from "../../src/features/program/programTypes";
import type { WorkoutExercise } from "../../src/lib/savedWorkouts";
import { openTab, programme, type JourneyAccount } from "./journey";
import { journeyLiftTotals, journeyWorkoutExercises } from "./journeyLiftDoc";
import { TABS, WORKOUT, trainRowText } from "../../src/test/journeyScreens";
import { emulatorAdmin } from "./realCallables";

/** Train shows `day`'s session as the plan holds it: each exercise's name,
 *  and its sets, reps and weight (`trainRowText`). */
export async function expectTrainShowsSession(
  page: Page,
  day: WorkoutDay
): Promise<void> {
  await openTab(page, TABS.train);
  for (const exercise of day.exercises) {
    await expect(
      page.getByText(exercise.name, { exact: true }).first(),
      `Train shows ${exercise.name}`
    ).toBeVisible();
    await expect(
      page.getByText(trainRowText(exercise), { exact: true }).first(),
      `Train shows ${exercise.name} as the plan holds it`
    ).toBeVisible();
  }
}

/** The workout saved on `day` from the workout screen. */
export async function savedWorkout(
  account: JourneyAccount,
  day: string
): Promise<{ exercises: WorkoutExercise[] }> {
  const snapshot = await emulatorAdmin()
    .db.collection(`users/${account.uid}/workouts`)
    .where("date", "==", day)
    .get();
  const fromScreen = snapshot.docs.filter(
    (doc) => !doc.id.startsWith("programme-journey-")
  );
  expect(fromScreen.length, `one workout saved on ${day}`).toBe(1);
  return fromScreen[0].data() as { exercises: WorkoutExercise[] };
}

/**
 * Today's session on the workout screen, every set as planned: Start
 * workout on Train (the session up next), each set marked complete as it
 * comes, warm-ups included, then Save workout and Done. Returns once the
 * plan has the session done.
 */
export async function finishLiftViaUi(
  page: Page,
  account: JourneyAccount
): Promise<number> {
  const dayIndex = nextUpIndex(await programme(account.uid));
  expect(dayIndex, "no session left to do this week").toBeGreaterThanOrEqual(0);
  await openTab(page, TABS.train);
  await page
    .getByRole("button", { name: WORKOUT.start, exact: true })
    .first()
    .click();
  // A session longer than the person's chosen length asks which to run.
  const close = page.getByRole("button", { name: WORKOUT.close });
  const full = page.getByRole("button", { name: WORKOUT.fullSession });
  await expect(close.or(full).first()).toBeVisible({ timeout: 20_000 });
  if (await full.isVisible()) await full.click();
  await expect(close).toBeVisible();

  const mark = page.getByRole("button", {
    name: WORKOUT.markSet,
    exact: true,
  });
  const save = page.getByRole("button", { name: WORKOUT.save, exact: true });
  // The exercise on screen: the workout screen moves to the next one by
  // itself after an exercise's last set.
  const exercise = page.getByRole("heading", { level: 2 }).last();
  for (let taps = 0; taps < 200 && !(await save.isVisible()); taps++) {
    const remaining = await mark.count();
    if (remaining === 0) {
      await expect(save.or(mark.first())).toBeVisible();
      continue;
    }
    const on = await exercise.textContent();
    await mark.first().click();
    await expect
      .poll(
        async () =>
          (await save.isVisible()) ||
          (await mark.count()) !== remaining ||
          (await exercise.textContent()) !== on
      )
      .toBe(true);
  }
  await save.click();
  const done = page.getByRole("button", { name: WORKOUT.done, exact: true });
  await expect(done).toBeVisible({ timeout: 20_000 });
  await done.click();
  await expect
    .poll(
      async () => (await programme(account.uid)).workouts[dayIndex]?.completed,
      {
        message: "the saved session never marked its day done",
      }
    )
    .toBe(true);
  return dayIndex;
}

/** Each set of a session as planned, done. */
function asPlanned(
  exercises: readonly { sets: number; reps: number; weight: number }[]
): LoggedSet[][] {
  return exercises.map((ex) =>
    Array.from({ length: ex.sets }, () => ({
      weight: ex.weight,
      reps: ex.reps,
      completed: true,
      type: "working",
    }))
  );
}

/**
 * The session up next, done on `day` with every set as planned, saved the
 * way the workout screen's Finish saves it: the app's prescription and
 * progression steps (`sessionPrescription`, `applySessionProgression`,
 * `markDayDone`), the workout and the plan in one transaction, and the
 * record a later correction reads. It skips the screen and the client's
 * transaction (ADR-0008), so a journey still finishes a session on the
 * screen every week (`finishLiftViaUi`).
 *
 * Run it with the page settled: the app writes the plan on load, and a
 * write of its own in flight would race this one.
 */
export async function fastForwardLift(
  account: JourneyAccount,
  day: string
): Promise<number> {
  const { db, Timestamp } = emulatorAdmin();
  const profile = (await db.doc(`users/${account.uid}`).get()).data() ?? {};
  const planRef = db.doc(`users/${account.uid}/programState/current`);
  return db.runTransaction(async (transaction) => {
    const state = (await transaction.get(planRef)).data() as ProgramState;
    const dayIndex = nextUpIndex(state);
    if (dayIndex < 0) throw new Error("no session left to do this week");
    const planned = state.workouts[dayIndex];
    const completionId = `journey-${day}-w${state.weekNumber}-${dayIndex}`;
    const workoutId = `programme-${completionId}`;
    // Train hands the workout screen the stored day as its baseline.
    const prescription = sessionPrescription(
      planned,
      completionId,
      planned.exercises
    );
    const setLogs = asPlanned(prescription.exercises);
    const progression = toSessionProgression({
      completionId,
      date: day,
      prescription,
      setLogs,
    })!;
    const progressed = applySessionProgression(state, dayIndex, progression);
    const exercises = journeyWorkoutExercises(prescription.exercises, setLogs);
    const totals = journeyLiftTotals(exercises, {
      durationMinutes: 0,
      bodyweightKg: profile.weightKg ?? 0,
    });
    transaction.set(
      planRef,
      stripUndefined({
        ...markDayDone(progressed, dayIndex, workoutId),
        updatedAt: Date.now(),
      })
    );
    transaction.set(
      db.doc(`users/${account.uid}/workouts/${workoutId}`),
      stripUndefined({
        date: day,
        exercises,
        totalCalories: totals.totalCalories,
        burnContext: { bodyweightKg: profile.weightKg ?? 0 },
        durationMinutes: totals.durationMinutes,
        totalVolume: totals.tonnageKg,
        notes: `${prescription.dayName ?? planned.dayName} — Programme Week ${state.weekNumber}`,
        createdAt: Timestamp.now(),
        source: "programme",
        completionId,
        programmeCompletion: {
          context: {
            weekNumber: state.weekNumber,
            dayIndex,
            dayIdentity: workoutCompletionDayIdentity(planned) ?? "",
            trainingBlockId: state.trainingBlock?.id,
            progression: storeSessionProgression(progression),
          },
          policy: {
            goal: state.goal,
            settings: state.settings,
            trainingBlock: state.trainingBlock,
          },
          committedExercises: progressed.workouts[dayIndex].exercises.filter(
            (exercise, index) => exercise !== planned.exercises[index]
          ),
        },
      })
    );
    return dayIndex;
  });
}
