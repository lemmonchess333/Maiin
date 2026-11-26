import { useNavigate } from "react-router-dom";
import WorkoutSession from "@/components/WorkoutSession";
import ExpressSessionSheet from "@/components/program/ExpressSessionSheet";
import {
  draftScopeForVariant,
  type SessionVariant,
} from "@/features/program/expressSession";
import { pickLighterDay } from "@/features/program/easierToday";
import { blockPrefersShorterSessions } from "@/features/program/represcribe";
import { sessionPlanFor } from "@/features/program/sessionDay";
import type { ProgramState } from "@/features/program/programTypes";
import type { LiftSession } from "@/features/program/useLiftSession";
import type { ProgramEngine } from "@/features/program/useProgramEngine";
import { liftDayNameIn } from "@/lib/liftDayLabel";
import { liftCompletionContext } from "@/lib/completionPlanContext";
import { workoutCompletionDayIdentity } from "@/lib/workoutCompletion";
import { recoveryFoodPath } from "@/lib/recoveryFood";

interface LiftSessionOverlaysProps {
  session: LiftSession;
  programState: ProgramState;
  completeWorkoutDay: ProgramEngine["completeWorkoutDay"];
  /** Whether the person has saved a workout before: the first one's
   *  finish says so. Unknown while the list loads. */
  firstWorkout: boolean;
}

/**
 * What a lift session opens over the screen (`useLiftSession`): the time
 * chooser ("Short on time?", Home's and the plan page's express links) and
 * the workout itself. Train draws them on both tabs, since Home's Start
 * opens the workout over whichever tab Train opens on, and a lift's own
 * page over itself.
 */
export default function LiftSessionOverlays({
  session,
  programState,
  completeWorkoutDay,
  firstWorkout,
}: LiftSessionOverlaysProps) {
  const navigate = useNavigate();
  const {
    sessionDayIndex,
    sessionVariant,
    sessionBudgetMinutes,
    expressChooserDay,
    easierRecommendation,
    hardRunBefore,
    sessionContext,
    usualBudget,
    planLifts,
    closeSession,
  } = session;
  const restContext = sessionContext.rest;

  return (
    <>
      {/* Pre-session chooser (PROGRAM-FLEX-01 + PROGRAM-ADAPT-01) */}
      <ExpressSessionSheet
        timeBudgetMinutes={usualBudget}
        rest={restContext}
        smallPlates={programState.settings?.smallPlates === true}
        loadUnit={programState.settings?.loadUnit}
        open={expressChooserDay !== null}
        day={
          expressChooserDay !== null
            ? (programState.workouts[expressChooserDay] ?? null)
            : null
        }
        easierRecommendation={easierRecommendation}
        weekDayNames={programState.workouts.map((w) => w.dayName)}
        lighterDay={
          expressChooserDay !== null
            ? pickLighterDay(
                programState.workouts,
                expressChooserDay,
                restContext
              )
            : null
        }
        blockPrefersShorter={blockPrefersShorterSessions(
          programState.trainingBlock
        )}
        onSwapToDay={session.swapToDay}
        onClose={session.closeChooser}
        onStart={session.startChosen}
      />

      {/* In-Session Workout Screen */}
      {sessionDayIndex !== null &&
        programState.workouts[sessionDayIndex] &&
        (() => {
          // Express variants run a deterministically trimmed COPY of
          // the day — the stored programme day is never mutated, and
          // the LIFT-01 draft identity derives from the trimmed layout
          // so a full-session draft can't restore into an express run
          // (or vice versa). The session logs and saves the TRIMMED
          // list; progression finds each exercise's row in the STORED
          // day by instanceId (`progressionBaseline` below, then
          // `applySessionProgression`), so a dropped accessory can't
          // shift progression onto the wrong lift.
          const storedDay = programState.workouts[sessionDayIndex];
          // Easier today (PROGRAM-ADAPT-01) is the same execution-clone
          // contract as Express: a reduced COPY runs; the stored day is
          // untouched, and nothing is dropped.
          // Built where the In progress strip's reader builds it
          // (`sessionDay.ts`), so a draft it offers back is this session's.
          const plan = sessionPlanFor(storedDay, sessionVariant, {
            ...sessionContext,
            budgetMinutes: sessionBudgetMinutes,
          });
          return (
            <WorkoutSession
              hardRunBefore={hardRunBefore}
              deloadWeek={programState.currentPhase === "deload"}
              sessionMinutes={programState.sessionMinutes}
              smallPlates={programState.settings?.smallPlates === true}
              day={
                plan ? { ...storedDay, exercises: plan.exercises } : storedDay
              }
              dayIndex={sessionDayIndex}
              dayLabel={liftDayNameIn(
                programState.workouts.map((w) => w.dayName),
                sessionDayIndex,
                storedDay.dayName
              )}
              planContext={liftCompletionContext(programState, sessionDayIndex)}
              draftEpoch={programState.weekNumber}
              // Variant-scoped draft namespace (PROGRAM-ADAPT-01
              // follow-up): the draft identity fingerprints the
              // exercise LAYOUT (ids × sets) but not loads, so an
              // easier clone whose set-floors all bind would share an
              // identity with the full session and a mid-session kill
              // could restore its logs into the other variant —
              // completing under the wrong sessionVariant label.
              // Scoping by variant makes restore deterministic: an
              // easier draft only ever resumes an easier session.
              draftScope={draftScopeForVariant(sessionVariant)}
              sessionVariant={
                plan
                  ? (plan.variant as Exclude<SessionVariant, "full">)
                  : undefined
              }
              progressionBaseline={storedDay.exercises}
              planLifts={planLifts}
              firstWorkout={firstWorkout}
              programmeContext={{
                weekNumber: programState.weekNumber,
                dayIndex: sessionDayIndex,
                dayIdentity: workoutCompletionDayIdentity(storedDay) ?? "",
                trainingBlockId: programState.trainingBlock?.id,
              }}
              onCompleteDay={completeWorkoutDay}
              onClose={closeSession}
              onViewWorkout={(id) => {
                closeSession();
                navigate(`/workout/${encodeURIComponent(id)}`);
              }}
              onLogFood={() => {
                closeSession();
                navigate(recoveryFoodPath("lift"));
              }}
              resumeDraft={session.resumeOnOpen}
            />
          );
        })()}
    </>
  );
}
