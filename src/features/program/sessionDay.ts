import type { ProgramState, WorkoutDay } from "./programTypes";
import type { RestContext } from "./restTime";
import type { LiftUnit } from "@/lib/liftLoad";
import {
  buildExpressSession,
  draftScopeForVariant,
  type ExpressPlan,
  type SessionVariant,
} from "./expressSession";
import { buildEasierSession, type EasierPlan } from "./easierToday";
import { buildTimeBudgetSession, isLiftTimeBudget } from "./liftTimeBudget";
import { computeDraftIdentity, draftLayout } from "@/hooks/useWorkoutDraft";

/**
 * The session a programme day runs as, for each way it can be started.
 *
 * Train builds the session from here when one starts, and the screens that
 * offer an unfinished workout back read the same answer to find which one a
 * draft belongs to. A draft is named by its layout (`computeDraftIdentity`),
 * so a second copy of these rules could recognise a day Train would build
 * differently, and offer a Resume that opens a fresh session.
 */
export interface SessionDayContext {
  rest: RestContext;
  /** The minutes a time-budget start trims to: the person's usual time,
   *  60 when they have none. */
  budgetMinutes: number;
  smallPlates: boolean;
  loadUnit?: LiftUnit;
}

/**
 * The person's usual session time, which Start trims to, or null. Only a
 * plan from before plans were built to fit the time still trims at Start.
 */
export function usualLiftBudget(
  programState: Pick<ProgramState, "sessionMinutes"> | null | undefined,
  liftTimeBudgetMinutes: unknown
): number | null {
  return programState?.sessionMinutes === undefined &&
    isLiftTimeBudget(liftTimeBudgetMinutes)
    ? liftTimeBudgetMinutes
    : null;
}

export function sessionDayContext(
  programState: Pick<ProgramState, "sessionMinutes" | "settings"> | null,
  profile: {
    defaultRestSeconds?: number;
    liftTimeBudgetMinutes?: number | null;
  } | null
): SessionDayContext {
  const loadUnit = programState?.settings?.loadUnit;
  return {
    rest: {
      fixedRest: profile?.defaultRestSeconds,
      sessionMinutes: programState?.sessionMinutes,
    },
    budgetMinutes:
      usualLiftBudget(programState, profile?.liftTimeBudgetMinutes) ?? 60,
    smallPlates: programState?.settings?.smallPlates === true,
    ...(loadUnit ? { loadUnit } : {}),
  };
}

/** The reduced copy a variant runs, or null for the full day. The stored
 *  day is never changed. */
export function sessionPlanFor(
  storedDay: WorkoutDay,
  variant: SessionVariant,
  context: SessionDayContext
): ExpressPlan | EasierPlan | null {
  switch (variant) {
    case "full":
      return null;
    case "easier_today":
      return buildEasierSession(storedDay, context.rest, {
        smallPlates: context.smallPlates,
        loadUnit: context.loadUnit,
      });
    case "time_budget":
      return buildTimeBudgetSession(
        storedDay,
        context.budgetMinutes,
        context.rest
      );
    default:
      return buildExpressSession(storedDay, variant, context.rest);
  }
}

/** The day as the workout screen receives it for a variant. */
export function sessionDayFor(
  storedDay: WorkoutDay,
  variant: SessionVariant,
  context: SessionDayContext
): WorkoutDay {
  const plan = sessionPlanFor(storedDay, variant, context);
  return plan ? { ...storedDay, exercises: plan.exercises } : storedDay;
}

/** The identity the workout screen gives the draft of a programme day
 *  started as `variant` in `weekNumber`. */
export function programmeDraftIdentity(
  storedDay: WorkoutDay,
  dayIndex: number,
  weekNumber: number,
  variant: SessionVariant,
  context: SessionDayContext
): string {
  const day = sessionDayFor(storedDay, variant, context);
  return computeDraftIdentity({
    scope: draftScopeForVariant(variant),
    epoch: weekNumber,
    dayIndex,
    dayName: day.dayName,
    layout: draftLayout(day.exercises),
  });
}
