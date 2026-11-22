import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageSearchParams } from "@/hooks/usePageSearchParams";
import type { SessionsInFlight } from "@/hooks/useSessionsInFlight";
import { useAuth } from "@/lib/auth";
import { useBackDismiss } from "@/lib/backDismiss";
import { RESUME_PARAM } from "@/lib/resumeParam";
import {
  resumableLift,
  resumableWorkout,
  type ResumableLift,
  type ResumableWorkout,
} from "@/lib/sessionsInFlight";
import type { EasierTodayRecommendation } from "./easierToday";
import type { SessionVariant } from "./expressSession";
import { nextUpIndex } from "./nextUpCursor";
import { openLiftSession } from "./openLiftSession";
import type { ProgramExercise, ProgramState } from "./programTypes";
import {
  sessionDayContext,
  usualLiftBudget,
  type SessionDayContext,
} from "./sessionDay";
import {
  useEasierTodayRecommendation,
  useHardRunBefore,
} from "./useEasierTodayRecommendation";

/**
 * Starting a lift session, for Train and for a lift's own page (TrainWk1
 * call 2): which day's workout is open over the screen and as which
 * variant, the time chooser, Resume, and the links that start one
 * (`?start=1`, `easier=1`, `express=1`, `resume=1`, each with the day).
 *
 * One hook so the two screens start a session one way. Train mounts it on
 * both tabs: Home's Start opens the workout over whichever tab Train
 * opens on. `LiftSessionView` offers the starts and `LiftSessionOverlays`
 * draws the chooser and the workout.
 */
export interface LiftSession {
  /** The plan's next lift (the cursor), or -1 on a past week or before
   *  the plan has loaded. */
  todayIndex: number;
  /** The day whose workout is open, or null. */
  sessionDayIndex: number | null;
  sessionOpen: boolean;
  sessionVariant: SessionVariant;
  sessionBudgetMinutes: number;
  /** Opened from Resume: the workout carries on without asking again. */
  resumeOnOpen: boolean;
  /** The day the time chooser is open for, or null. */
  expressChooserDay: number | null;
  /** "Go easier today", for the chooser's day or else the cursor's. */
  easierRecommendation: EasierTodayRecommendation | null;
  hardRunBefore: (startedAt: number) => boolean;
  /** How the plan's days run (rests, the usual time, the plates). */
  sessionContext: SessionDayContext;
  /** The person's usual session time, which Start trims to, or null. */
  usualBudget: number | null;
  /** Every lift of the plan, in its day. */
  planLifts: ProgramExercise[];
  /** The workout under way on this phone that Resume would open: a
   *  programme day's, a saved routine's or an empty workout's. */
  workoutInFlight: ResumableWorkout | null;
  /** The programme day's, when that is what is under way. */
  resumable: ResumableLift | null;
  /** The run under way on this phone, and a way to read both again. */
  inFlight: SessionsInFlight & { refresh: () => void };
  /** Start, as Train's own Start does. */
  start: (dayIndex: number) => void;
  /** "Go easier today": one set less per lift, lighter loads. */
  startEasier: (dayIndex: number) => void;
  resume: (lift: ResumableLift) => void;
  /** "Short on time?": the chooser for `dayIndex`. */
  openChooser: (dayIndex: number) => void;
  closeChooser: () => void;
  /** The chooser's start: its day, as `variant`. */
  startChosen: (variant: SessionVariant) => void;
  /** The chooser's lighter day instead, in full. */
  swapToDay: (dayIndex: number) => void;
  closeSession: () => void;
}

export function useLiftSession({
  programState,
  inFlight,
  linkedDay,
  viewingHistory,
}: {
  programState: ProgramState | null;
  /** The sessions under way on this phone (`useSessionsInFlight`), read
   *  again as a workout closes. */
  inFlight: SessionsInFlight & { refresh: () => void };
  /** The day the address names: Train's `?day=N`, or the page's own. A
   *  `start`, `easier`, `express` or `resume` link opens this day. */
  linkedDay: number | null;
  /** A past week is on screen. */
  viewingHistory: boolean;
}): LiftSession {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = usePageSearchParams();

  // Today index: the next-up cursor, the session Home offers too.
  const todayIndex = useMemo(() => {
    if (!programState || viewingHistory) return -1;
    return nextUpIndex(programState);
  }, [programState, viewingHistory]);

  const [sessionDayIndex, setSessionDayIndex] = useState<number | null>(null);
  // The week rollover waits while a session is open, so its finish lands on
  // the week it started in (`openLiftSession`).
  const sessionOpen = sessionDayIndex !== null;
  useEffect(() => (sessionOpen ? openLiftSession() : undefined), [sessionOpen]);
  // PROGRAM-FLEX-01: Express Session chooser target + chosen variant.
  // The chooser only opens when a budget would actually change the day
  // (expressChoices > 1); otherwise Start workout stays one tap.
  const [expressChooserDay, setExpressChooserDay] = useState<number | null>(
    null
  );
  const [sessionBudgetMinutes, setSessionBudgetMinutes] = useState<number>(60);
  const [sessionVariant, setSessionVariant] = useState<SessionVariant>("full");
  // Opened from Resume: the workout carries on without asking again.
  const [resumeOnOpen, setResumeOnOpen] = useState(false);

  /* Back during a lift does what the session's own Close does: the
     session closes to Train, its draft waits to be resumed, and the
     session says it was kept as it goes. Without it, Back would leave the
     page. A sheet in the session registers after this one, so Back closes
     that first. */
  const refreshInFlight = inFlight.refresh;
  const closeSession = useCallback(() => {
    setSessionDayIndex(null);
    setSessionVariant("full");
    setResumeOnOpen(false);
    // What was kept (or finished) is read again for the day card's strip.
    refreshInFlight();
  }, [refreshInFlight]);
  useBackDismiss(sessionOpen, closeSession);

  const hardRunBefore = useHardRunBefore();
  const easierRecommendation = useEasierTodayRecommendation(
    programState?.workouts[expressChooserDay ?? todayIndex]
  );

  const planLifts = useMemo(
    () => programState?.workouts.flatMap((day) => day.exercises) ?? [],
    [programState?.workouts]
  );

  // The trim at Start retires with plans built to fit the time (Lift4 (5)):
  // only a plan from before then still trims to the person's usual time.
  const liftBudget = profile?.liftTimeBudgetMinutes;
  const usualBudget = usualLiftBudget(programState, liftBudget);
  const sessionContext = sessionDayContext(programState, profile);

  // A plan built to fit the person's time (Lift4 (5)) starts in full;
  // one built before that still trims to their usual time at Start.
  const start = useCallback(
    (day: number) => {
      setSessionBudgetMinutes(usualBudget ?? 60);
      setSessionVariant(usualBudget === null ? "full" : "time_budget");
      setSessionDayIndex(day);
    },
    [usualBudget]
  );
  const startEasier = useCallback((day: number) => {
    setSessionVariant("easier_today");
    setSessionDayIndex(day);
  }, []);

  /* Resume, from the In progress strip, opens the workout as it was
     started (its variant) and carries on without asking "Resume workout?"
     again. */
  const openResumedLift = useCallback(
    (lift: ResumableLift) => {
      setSessionBudgetMinutes(usualLiftBudget(programState, liftBudget) ?? 60);
      setSessionVariant(lift.variant);
      setResumeOnOpen(true);
      setSessionDayIndex(lift.dayIndex);
    },
    [programState, liftBudget]
  );

  const startChosen = useCallback(
    (variant: SessionVariant) => {
      const idx = expressChooserDay;
      setExpressChooserDay(null);
      if (idx === null) return;
      setSessionBudgetMinutes(usualBudget ?? 60);
      setSessionVariant(variant);
      setSessionDayIndex(idx);
    },
    [expressChooserDay, usualBudget]
  );
  const swapToDay = useCallback((index: number) => {
    setExpressChooserDay(null);
    setSessionVariant("full");
    setSessionDayIndex(index);
  }, []);

  // The plan page's week reset opens a day's Express session (XB1 call 2).
  const expressRequested = searchParams.get("express") === "1";
  useEffect(() => {
    if (!expressRequested || !programState) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("express");
        return next;
      },
      { replace: true }
    );
    const day = linkedDay === null ? null : programState.workouts[linkedDay];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-shot deep link, consumed above
    if (day && !day.completed && !day.skipped) setExpressChooserDay(linkedDay);
  }, [expressRequested, programState, linkedDay, setSearchParams]);

  // Home's Today card links here with `?day=N&start=1` (DS3): Start on Home
  // begins the session. Begin it the way the day's own Start does, once,
  // then drop `start` from the URL so a refresh or a back navigation lands
  // on the day instead of starting it again. A finished or skipped day just
  // opens. N is the day Home showed, which can differ from the rotation
  // cursor; starting a day off the cursor is already supported, it is what
  // the lighter-day swap does.
  const startRequested = searchParams.get("start") === "1";
  /* Home's readiness link adds `easier=1` (whole-app grill Q40): the same
     start, as Train's own "Go easier today" (one set less per lift,
     lighter loads). It is offered there, never chosen for the person. */
  const easierRequested = searchParams.get("easier") === "1";
  useEffect(() => {
    if (!startRequested || !programState) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("start");
        next.delete("easier");
        return next;
      },
      { replace: true }
    );
    if (viewingHistory || linkedDay === null) return;
    const day = programState.workouts[linkedDay];
    if (!day || day.completed || day.skipped) return;
    /* eslint-disable react-hooks/set-state-in-effect -- a one-shot reaction
       to the deep link, consumed above so it cannot repeat */
    if (easierRequested) {
      // Train's own Easier today, as its row starts it.
      setSessionVariant("easier_today");
    } else {
      const budget = usualLiftBudget(programState, liftBudget);
      setSessionBudgetMinutes(budget ?? 60);
      setSessionVariant(budget === null ? "full" : "time_budget");
    }
    setSessionDayIndex(linkedDay);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    startRequested,
    easierRequested,
    programState,
    viewingHistory,
    linkedDay,
    liftBudget,
    setSearchParams,
  ]);

  /* Home links here with `?day=N&resume=1`, dropped once read like
     `start`; a workout that can no longer be resumed (finished on another
     phone, the week moved on) just opens its day. */
  const resumeRequested = searchParams.get(RESUME_PARAM) === "1";
  const draftsInFlight = inFlight.drafts;
  useEffect(() => {
    if (!resumeRequested || !programState) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(RESUME_PARAM);
        return next;
      },
      { replace: true }
    );
    if (viewingHistory || linkedDay === null) return;
    const lift = resumableLift(
      draftsInFlight,
      programState,
      sessionDayContext(programState, profile)
    );
    // A one-shot reaction to the deep link, consumed above so it cannot
    // repeat.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (lift?.dayIndex === linkedDay) openResumedLift(lift);
  }, [
    resumeRequested,
    programState,
    viewingHistory,
    linkedDay,
    profile,
    draftsInFlight,
    openResumedLift,
    setSearchParams,
  ]);

  // The workout under way on this phone that Resume would open as it was,
  // a programme day's or a saved routine's.
  const workoutInFlight = programState
    ? resumableWorkout(
        inFlight.drafts,
        programState,
        sessionContext,
        inFlight.routines
      )
    : null;
  const resumable =
    workoutInFlight?.kind === "programme" ? workoutInFlight : null;

  return {
    todayIndex,
    sessionDayIndex,
    sessionOpen,
    sessionVariant,
    sessionBudgetMinutes,
    resumeOnOpen,
    expressChooserDay,
    easierRecommendation,
    hardRunBefore,
    sessionContext,
    usualBudget,
    planLifts,
    workoutInFlight,
    resumable,
    inFlight,
    start,
    startEasier,
    resume: openResumedLift,
    openChooser: setExpressChooserDay,
    closeChooser: () => setExpressChooserDay(null),
    startChosen,
    swapToDay,
    closeSession,
  };
}
