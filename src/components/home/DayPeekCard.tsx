import { liftDayNameIn } from "@/lib/liftDayLabel";
import { plannedIntervalPaceSPerKm, withPlannedRest } from "@/lib/intervalRest";
import RunAbout from "@/components/run/RunAbout";
import { liftUnitLabel, liftVolumeIn } from "@/lib/liftLoad";
import {
  formatDuration,
  formatShortWeekdayDayMonth,
  formatWeekday,
} from "@/utils/formatters";
import { useLiftUnit } from "@/hooks/useLiftUnit";
import RunPurpose from "@/components/run/RunPurpose";
import LiftPurpose from "@/components/program/LiftPurpose";
import { runSessionAbout, runSessionName } from "@/lib/runSessionAbout";
import { racePaceWorkFor } from "@/lib/racePace";
import {
  isRecoveryRunDay,
  runSessionPresentation,
  weekHoldsQuality,
} from "@/lib/runSessionExplainer";
import { Suspense, useState } from "react";
import { THEME } from "@/lib/theme";
import { m } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import {
  Dumbbell,
  ClipboardList,
  Footprints,
  X,
  Check,
  Settings2,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";
import { runModeWithPlan } from "@/features/program/programMaintenance";
import type { RollingSessionContext } from "@/features/program/rollingWeeksAhead";
import { resolveTrainingDayForDate } from "@/lib/trainingResolver";
import {
  manageLiftOn,
  planLiftOn,
  type LayoutDay,
  type LayoutLift,
  type SlidOut,
} from "@/lib/layOutWeek";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import {
  getCompletionKind,
  type ClaimState,
} from "@/lib/scheduledRunCompletion";
import type { SavedRunDoc } from "@/lib/runClaims";
import { localWeekKey, parseLocalDate } from "@/lib/dateHelpers";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import { workoutTitle } from "@/hooks/useWorkouts";
import { distanceIn, distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { runDoseLine, runMinutesLine } from "@/lib/runDose";
import { planningEasyPaceSPerKm } from "@/lib/runPaces";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { lazyRetry } from "@/lib/lazyRetry";
import { Skeleton } from "@/components/LoadingSkeleton";
import HeatPanel from "@/components/run/HeatPanel";
import {
  coolestHourLine,
  heatLine,
  HEAT_PREVIEW_LINE,
} from "@/lib/heatAdjustment";
import { deviceTemperatureUnit } from "@/lib/temperature";
import { useHotDay } from "@/hooks/useHotDay";
import { isScheduledRunStartable } from "@/lib/scheduledRunStatus";

/* Closed when Home first draws, and it brings the bottom sheet (vaul and
   Radix) with it: it loads once the card has drawn, as Home's
   DayActionSheet does. */
const ExtrasExpandSheet = lazyRetry(
  () => import("@/components/program/ExtrasExpandSheet")
);

/** Q5 P71 cap — DayPeekCard mirrors RunWeekStrip; up to 2 extras
 *  shown inline before an overflow "+N more" tap-through. */
const EXTRAS_VISIBLE_CAP = 2;

/**
 * The lift summary row — a button when it has somewhere to go, a plain row
 * when it doesn't.
 *
 * Both shapes are needed. A day can show this row for a PLANNED lift with
 * nothing saved yet (there's no record to open), and for several saved
 * sessions collapsed into one line (no single honest destination). Rendering
 * a button in those cases would be an affordance that does nothing, which is
 * worse than no affordance — so the element type follows the destination
 * rather than the row always being pressable.
 */
function LiftRowShell({
  workoutId,
  label,
  children,
}: {
  workoutId: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  if (!workoutId) {
    return <div className="flex items-center gap-1.5">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        // The whole card is itself a tap target (expand/collapse) — without
        // this the row's navigation and the card's toggle both fire.
        e.stopPropagation();
        navigate(`/workout/${workoutId}`);
      }}
      aria-label={`Open ${label ?? "workout"} details`}
      className="flex min-h-11 items-center gap-2 w-full text-sm text-left rounded-md -mx-1 px-1 py-2 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <ChevronRight
        className="ml-auto size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * The nutrition summary row, tappable through to that day's diary.
 *
 * `to` is null when the diary cannot show the date, and the row then
 * renders as the plain `<div>` it always was rather than a link that
 * silently lands somewhere else — `/food` clamps an out-of-range
 * `?date=` back to today, so an ungated link would look like a broken
 * jump.
 *
 * WHICH DATES REACH THIS ROW. WeekStrip renders the calendar week
 * containing today, starting on the week's first day, and every one of
 * its cells opens this
 * card — so the dates are that week, today included. Past days and today
 * carry meals and get a link; future ones do not.
 *
 * That bounds the window at six days either side of today, which is why
 * the guard checks only "not in the future" and not Food.tsx's 90-day
 * FOOD_TAP_BACK_DAYS floor: no date this card can be given is more than
 * six days old, so the floor cannot bind. It becomes real the moment
 * this surface can reach further back than a week — a month view, or a
 * strip that pages between weeks — and the guard has to grow it then.
 *
 * Today reaching the card is also what makes the `dateKey === todayKey`
 * branch below live. While today's cell scrolled to the session cards
 * instead of opening this one, that branch was unreachable, and the
 * first-day-of-week case was starker than it now is: on the week's first
 * day (a Monday, under `WEEK_STARTS_ON`) the week's only elapsed day IS
 * today, so the row appears where it previously could not.
 */
function DiaryRowShell({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  if (!to) {
    return <div className="flex items-center gap-1.5">{children}</div>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        // The whole card toggles open/closed on tap; without this the
        // row's navigation and the card's collapse both fire.
        e.stopPropagation();
        navigate(to);
      }}
      aria-label={label}
      className="flex min-h-11 items-center gap-1.5 w-full text-left rounded-md -mx-1 px-1 py-2 active:scale-[0.98] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {children}
      <ChevronRight
        className="ml-auto size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

export default function DayPeekCard({
  dateKey,
  todayKey,
  day = null,
  profile,
  programState,
  claimMap,
  extras,
  workouts,
  dailyTotals,
  sessionsLoading = false,
  rollingContexts = null,
  onClose,
  onManage,
}: {
  dateKey: string;
  /** Today, "yyyy-MM-dd": Home's day key, so the card and the strip agree
   *  on which day is today. */
  todayKey: string;
  /** The day as the week lays it out (`layOutWeek`), the layout the strip
   *  and today's card read: the lift it holds, and where a passed lift
   *  day's lift went. Absent reads as a day with no lift. */
  day?: LayoutDay | null;
  /** P1-4 / PR-0c: profile + programState replace the previous
   *  `schedule` + `runDays` props. The peek calls the shared
   *  training resolver which enforces date/weekKey-aware runDay
   *  matching — so tapping next Monday on the strip can no longer
   *  inherit this Monday's runDay status (the old
   *  `runDays.find(r => r.dayIndex === dow)` bug). */
  profile: UserProfile | null;
  programState: ProgramState | null;
  /** PR-J Q3 chunk B3c — derived completion source of truth.
   *  Forwarded to the resolver so the "Run completed" copy and
   *  Check icon track manual / saved-run-claim / legacy
   *  completions uniformly. Wired via `useClaimMapForProgram` in Home. */
  claimMap: Map<string, ClaimState>;
  /** PR-J Q5 chunk B3g — unclaimed saved runs for this date.
   *  Rendered as tap-through rows so a logged extra run shows on
   *  the Home day peek alongside the planned slot. Wired via
   *  `useClaimMapForProgram(programState).unclaimedByDate.get(dateKey)` in Home. */
  extras: SavedRunDoc[];
  /** The day's workouts or runs are still being read. A day with nothing
   *  found yet then shows a placeholder, not "No activity logged": on a
   *  cold start a returning person who tapped a day before the reads
   *  landed was told they had done nothing. */
  sessionsLoading?: boolean;
  /** A plan with no race date's weeks, by their Mondays
   *  (`useRollingSessionContexts`, Run24 (3)): a run's reason in the plan's
   *  terms. Home passes them; without them such a run has no reason. */
  rollingContexts?: ReadonlyMap<string, RollingSessionContext> | null;
  workouts: {
    /** Firestore doc id — the /workout/:id destination for the lift row.
     *  Optional because callers historically passed a projection; a row
     *  without one simply isn't tappable. */
    id?: string;
    /** Session identity, used to label a day's rows when it holds more than
     *  one saved workout. Titled through the shared `workoutTitle`. */
    notes?: string;
    exercises?: { sets?: { weightKg?: number; reps?: number }[] }[];
    durationMinutes?: number;
  }[];
  dailyTotals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealCount: number;
  };
  onClose: () => void;
  /** PR-1: opens DayActionSheet for this date. Only rendered as a
   *  secondary CTA when there's actionable training for the day
   *  (matched lift or runDay). Home remains glance-first — the
   *  inline rows above stay summary copy, not buttons. */
  onManage?: (dateKey: string) => void;
}) {
  const navigate = useNavigate();
  const unit = useDistanceUnit();
  const liftUnit = useLiftUnit();
  const motionSafe = useMotionSafe();
  // Q5 P71 — overflow expand-sheet state. Mirrors RunWeekStrip's
  // local handling (the parent doesn't need to know about overflow).
  const [extrasSheetOpen, setExtrasSheetOpen] = useState(false);
  const resolved = resolveTrainingDayForDate({
    dateKey,
    profile,
    programState,
    currentWeekKey: localWeekKey(parseLocalDate(todayKey)),
    claimMap,
    todayKey,
  });
  /* Today's run still to do, on a hot or extreme day: the heat line, and
     that the run can be adjusted for heat as it starts (heatAdjustment.ts).
     The weather is read only for that run, and only once location is
     allowed (`useHotDay`). */
  const todayRunAhead =
    dateKey === todayKey &&
    resolved.run.runDay !== null &&
    !resolved.run.isCompleted &&
    resolved.run.status !== "none" &&
    isScheduledRunStartable(resolved.run.status);
  const heat = useHotDay(todayRunAhead);
  const heatLineToday = heatLine(heat.weather);
  /* And today's coolest hour still ahead, where one is meaningfully
     cooler (Run26 (5)). */
  const coolestToday =
    heat.coolest && heat.weather
      ? coolestHourLine(
          heat.coolest,
          heat.weather.temperature,
          deviceTemperatureUnit()
        )
      : null;
  /* The lift is the one the week lays on the day (`layOutWeek`): today's
     is the one the today card offers, and a later day's the one the
     plan's order reaches there, so the strip, the peek and the card name
     one session. A passed lift day whose lift moved on says where it went
     (`slidOut`), and a lift day before a race says it rests. */
  const planLift = day ? planLiftOn(day) : null;
  const dayLift = {
    workout: planLift?.workout ?? null,
    index: planLift?.index ?? null,
    status: !planLift
      ? ("none" as const)
      : planLift.state === "done"
        ? ("completed" as const)
        : ("planned" as const),
    movedFrom: planLift?.movedFrom ?? null,
  };
  const slidOut = day && !planLift ? day.slidOut : [];
  const skippedHere = day?.skippedHere ?? [];
  const restsForRace = !!day && day.rest === "race";
  const dayLabel = formatShortWeekdayDayMonth(parseLocalDate(dateKey));
  /* The badge names what is actually on the day, not its weekday's type
     in the usual layout (`profile.weekSchedule`): a deload week can drop
     the run while Tuesday is still typed "both", and a lift moves to the
     next lift day when its own passes, so the type alone would promise
     sessions the card does not hold.
     RUNS come from the resolved plan, LIFTS from the week laid out:
     runs are date-pinned, so `runDays` is the only thing that knows
     whether this date has one, and a lift is on the day the week puts it
     (TrainWk1 call 1), or was, when it moved on from a lift day. */
  const scheduledRun = resolved.run.runDay !== null;
  const liftOnDay =
    !!day &&
    (day.sessions.some((s) => s.sport === "lift") ||
      skippedHere.length > 0 ||
      (day.liftDay && slidOut.length > 0));
  const shownType: "lift" | "run" | "both" | "rest" = scheduledRun
    ? liftOnDay
      ? "both"
      : "run"
    : liftOnDay
      ? "lift"
      : "rest";
  const typeLabel =
    shownType === "lift"
      ? "Lift day"
      : shownType === "run"
        ? "Run day"
        : shownType === "both"
          ? "Lift + Run day"
          : "Rest day";
  // typeColor stays inline (the sport branches are JS hexes), but the rest
  // branch is the theme-aware secondary token now. DS1b left it on the fixed
  // #8E8E93 because its "match to --muted-foreground isn't guaranteed" — the
  // 2026-08-22 owner-decided consolidation RESOLVED that by defining the
  // muted-text identity as --muted-foreground, so the equality is the
  // decision, not an assumption.
  const typeColor =
    shownType === "lift"
      ? THEME.lifting
      : shownType === "run"
        ? THEME.running
        : shownType === "both"
          ? THEME.lifting
          : "hsl(var(--muted-foreground))";
  const typeBg =
    shownType === "lift"
      ? THEME.lifting + "18"
      : shownType === "run"
        ? THEME.running + "18"
        : shownType === "both"
          ? THEME.teal + "18"
          : "hsl(var(--muted-foreground) / 0.09)";
  let tonnage = 0;
  let totalMinutes = 0;
  workouts.forEach(function (w) {
    totalMinutes += w.durationMinutes || 0;
    (w.exercises || []).forEach(function (ex) {
      (ex.sets || []).forEach(function (s) {
        tonnage += (s.weightKg || 0) * (s.reps || 0);
      });
    });
  });
  const hasW = workouts.length > 0;
  /** More than one saved session on this date — each gets its own named row
   *  instead of the ambiguous "N sessions" collapse. */
  const multiSession = workouts.length > 1;
  const hasM = dailyTotals.mealCount > 0;
  /* Today drops the ?date= param so the diary opens on its own default
     — matching how Food.tsx's own arrows write the URL (it deletes the
     param for today rather than pinning it). See DiaryRowShell for why
     a future date gets no link at all. */
  const diaryHref =
    dateKey > todayKey
      ? null
      : dateKey === todayKey
        ? "/food"
        : `/food?date=${dateKey}`;
  const hasRun = resolved.run.runDay !== null;
  // Cal-A: surface the PLANNED session by name so tapping a day tells
  // you WHICH lift / run it is (not a generic "Lift + Run day"). Lift
  // name from the scheduled WorkoutDay; run name from its template
  // (honouring a per-day override).
  const plannedLiftName = dayLift.workout
    ? liftDayNameIn(
        (programState?.workouts ?? []).map((w) => w.dayName),
        dayLift.index ?? -1,
        dayLift.workout.dayName
      )
    : null;
  const runTemplateId =
    resolved.run.runDay?.userOverride || resolved.run.runDay?.templateId;
  const runTemplate = RUN_TEMPLATES.find((t) => t.id === runTemplateId);
  // Run21 (2): a long run that finishes at race pace says so, by the
  // launch's own gate.
  const runRacePace = racePaceWorkFor(
    runTemplate,
    profile,
    programState?.runPlan
  );
  const runName = runSessionName(runTemplate, runRacePace, unit);
  const runAbout = runTemplate
    ? runSessionAbout(
        withPlannedRest(
          runTemplate,
          plannedIntervalPaceSPerKm(profile?.runFitness)
        ),
        { racePace: runRacePace }
      )
    : null;
  // Read through the programme as well as the profile: a plan with no
  // race date keeps the profile on free running (Run24 (3)).
  const runPurpose =
    runTemplate && runModeWithPlan(profile, programState) !== "freeform"
      ? runSessionPresentation({
          type: runTemplate.type,
          templateId: runTemplate.id,
          currentWeek: programState?.runPlan?.currentWeek,
          totalWeeks: programState?.runPlan?.totalWeeks,
          shortBase: programState?.runPlan?.shortBase,
          distance:
            programState?.runPlan?.raceGoal?.distance ??
            profile?.raceGoal?.distance,
          weekHasQuality: weekHoldsQuality(
            programState?.runDays,
            resolved.run.runDay?.weekKey
          ),
          racePace: runRacePace?.kind,
          inRecovery: isRecoveryRunDay(
            programState?.runPlan,
            resolved.run.runDay?.date
          ),
          rolling: resolved.run.runDay?.weekKey
            ? rollingContexts?.get(resolved.run.runDay.weekKey)
            : null,
        }).purpose
      : null;
  // Q5 P69 — extras on the Home peek surface. Cap-at-2 (P71)
  // mirrors the RunWeekStrip pattern; overflow taps through to
  // /history. Counts toward the activity-section gate so a
  // rest-day-with-extras doesn't fall through to "No activity
  // logged."
  const visibleExtras = extras.slice(0, EXTRAS_VISIBLE_CAP);
  const overflowCount = Math.max(0, extras.length - EXTRAS_VISIBLE_CAP);
  const hasExtras = extras.length > 0;
  return (
    <m.div
      initial={motionSafe({ opacity: 0, height: 0 })}
      animate={{ opacity: 1, height: "auto" }}
      exit={motionSafe({ opacity: 0, height: 0 })}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {/*
        Padding, hierarchy and a tie back to the strip.

        This card was `py-1.5` — 6px — where every other card in the app
        uses 12-16px, and its three tiers of information (the date, the
        day-type pill, the session rows) were all `text-xs`, so nothing
        told the eye what to read first. Reported simply as "it looks
        bad", which it did: squeezed against its own edges and flat.

        `py-3` matches the documented compact-card padding, and the date
        steps up to `text-sm` so there is one clear heading above the
        rows. The caret is the other half: the card appears below a week
        strip you just tapped, and nothing connected the two — it read as
        an unrelated box that showed up. Pointing at the row it came from
        makes the relationship obvious without a word of copy.

        The card is a flat plane (§14s rule 1): on light a hairline and no
        shadow. The caret takes the same hairline on its two upper edges
        and sits over the card's top edge, so the line opens under it and
        the two read as one shape. On dark both keep the lit edge, with
        the card over the caret as before.
      */}
      <div className="pt-1 pb-0.5 px-1">
        <div
          aria-hidden="true"
          className="relative z-[1] mx-auto size-2.5 rotate-45 rounded-[2px] border-t border-l border-border/60 bg-card -mb-1.5 dark:z-auto dark:border-transparent"
        />
        <div className="relative rounded-xl bg-card px-3 py-3 space-y-2 surface-flat">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {dayLabel}
              </span>
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                /* The bg comes from the pair, never `typeColor + "18"` —
                   the rest branch is a var() string and hex-alpha concat
                   onto it is invalid CSS (the pill silently loses its
                   tint). Caught in self-review before the frame did. */
                style={{ backgroundColor: typeBg, color: typeColor }}
              >
                {typeLabel}
              </span>
            </div>
            <IconButton
              onClick={onClose}
              aria-label="Close day details"
              size="md"
              className="-m-1 text-muted-foreground"
              icon={<X />}
            />
          </div>
          {hasW ||
          hasM ||
          hasRun ||
          hasExtras ||
          plannedLiftName ||
          slidOut.length > 0 ||
          skippedHere.length > 0 ||
          restsForRace ? (
            <div className="space-y-1 text-xs">
              {/* Several sessions on one day get one row EACH, mirroring how
                  the run extras below render per-run rather than collapsing.
                  The old "N sessions" line had no honest single destination,
                  so it wasn't tappable at all — but the answer to "which one?"
                  is to stop asking the question, not to leave both unreachable.
                  Each row is named and goes to its own workout. */}
              {multiSession
                ? workouts.map((w, i) => (
                    <LiftRowShell
                      key={w.id ?? i}
                      workoutId={w.id ?? null}
                      label={workoutTitle(w)}
                    >
                      <Dumbbell className="size-3.5 shrink-0 text-lifting" />
                      <span className="text-foreground truncate">
                        {workoutTitle(w)}
                        {(w.durationMinutes ?? 0) > 0 && (
                          <span className="text-muted-foreground font-mono tabular-nums">
                            {" · "}
                            {formatDuration((w.durationMinutes ?? 0) * 60)}
                          </span>
                        )}
                      </span>
                    </LiftRowShell>
                  ))
                : null}
              {(plannedLiftName || hasW) && !multiSession && (
                /* Tap-through to the saved session, matching the run rows
                   below (which have navigated to /run/:runId since Q5).
                   Lifts had no detail route until 2026-08-04, so this row
                   was informational-only — the asymmetry was the reason,
                   not a design choice.

                   Still not a button when the day is PLANNED with nothing
                   saved: there is no record to open yet, and an affordance
                   that does nothing is worse than none. */
                <LiftRowShell
                  workoutId={
                    workouts.length === 1 ? (workouts[0].id ?? null) : null
                  }
                  label={plannedLiftName ?? undefined}
                >
                  <Dumbbell className="size-3.5 shrink-0 text-lifting" />
                  <span className="text-foreground">
                    {/* Cal-A: the lift's actual name (e.g. "Push — Chest
                        Focus"), not a generic "N sessions". Logged
                        min/volume append in mono when the day is done. */}
                    {plannedLiftName ??
                      `${workouts.length} session${workouts.length !== 1 ? "s" : ""}`}
                    {dayLift.status === "completed" && (
                      <Check
                        className="inline size-3 ml-1 align-[-1px]"
                        style={{ color: THEME.success }}
                      />
                    )}
                    {dayLift.status === "planned" && dayLift.movedFrom && (
                      <span className="text-muted-foreground">
                        {" · moved from "}
                        {formatWeekday(parseLocalDate(dayLift.movedFrom))}
                      </span>
                    )}
                    {hasW && (totalMinutes > 0 || tonnage > 0) && (
                      <span className="text-muted-foreground font-mono tabular-nums">
                        {" · "}
                        {totalMinutes > 0
                          ? formatDuration(totalMinutes * 60)
                          : ""}
                        {totalMinutes > 0 && tonnage > 0 ? " · " : ""}
                        {/* The whole figure, grouped, as the diary row
                            below writes its calories. One session's
                            volume runs to a few thousand, and "6.7k kg"
                            asks the reader to expand the k before the
                            unit. */}
                        {tonnage > 0
                          ? `${Math.round(liftVolumeIn(tonnage, liftUnit)).toLocaleString()} ${liftUnitLabel(liftUnit)}`
                          : ""}
                      </span>
                    )}
                  </span>
                </LiftRowShell>
              )}
              {/* A passed lift day's lift that moved on: where it went,
                  so the day is never read as a lift missed (TrainWk1). */}
              {slidOut.map((gone) => (
                <LiftNoteRow
                  key={`gone-${gone.lift.index ?? gone.to}`}
                  name={liftName(programState, gone.lift)}
                  note={whereItWent(gone, todayKey)}
                />
              ))}
              {/* A lift skipped from this day, today or later: it stays
                  here, skipped, and the Manage sheet restores it. */}
              {skippedHere.map((lift) => (
                <LiftNoteRow
                  key={`skipped-${lift.index}`}
                  name={liftName(programState, lift)}
                  note="skipped"
                />
              ))}
              {restsForRace && <LiftNoteRow note="Rest before your race" />}
              {/* The planned lift's reason, as the run row below carries
                  "Why this run". Outside the row: it can be a button, and
                  a disclosure cannot sit inside one. */}
              {plannedLiftName && !multiSession && (
                <LiftPurpose
                  programme={programState}
                  day={dayLift.workout}
                  date={dateKey}
                  experience={profile?.experience}
                  className="pl-5"
                />
              )}
              {hasM && (
                <DiaryRowShell
                  to={diaryHref}
                  label={`Open the food diary for ${dayLabel}`}
                >
                  <ClipboardList
                    className="size-3.5 shrink-0"
                    style={{ color: THEME.success }}
                  />
                  {/* The food diary's row, so its grams are the food
                      surface's, unspaced ("140g"), as Home's Food card
                      writes them in the tiles beside its ring. */}
                  <span className="text-foreground font-mono tabular-nums">
                    {dailyTotals.calories.toLocaleString()} {CALORIE_UNIT} {"·"}{" "}
                    {Math.round(dailyTotals.protein)}g protein
                  </span>
                </DiaryRowShell>
              )}
              {/* PR-0c: run-day status row. Resolver delivers a
                  status-aware view — when no runDay matches this
                  date (freeform user, future strip day, etc.) we
                  skip the row entirely rather than render a fake
                  "Run scheduled" line for an inherited slot. */}
              {hasRun && (
                <div className="flex items-center gap-1.5">
                  <Footprints className="size-3.5 shrink-0 text-running" />
                  {/* Cal-A: lead with the run's actual name (e.g. "Easy
                      30", "5×1K Intervals") — the status is an adornment,
                      not the whole line. A scheduled future run is just
                      its name. */}
                  <span className="text-foreground">
                    {runName}
                    {resolved.run.isCompleted ? (
                      // Q2 P24 — distinguish real vs manual ✅. Manual keeps
                      // a "· manual" tag + dimmed check so the credit kind
                      // is still legible now that the name leads the line.
                      (() => {
                        const runDayId = resolved.run.runDay?.id;
                        const completionKind = runDayId
                          ? getCompletionKind(runDayId, claimMap)
                          : null;
                        const isManual = completionKind === "manual";
                        return (
                          <>
                            {isManual && (
                              <span className="text-muted-foreground">
                                {" "}
                                · manual
                              </span>
                            )}
                            <Check
                              className={cn(
                                "inline size-3 ml-1 align-[-1px]",
                                isManual && "opacity-50"
                              )}
                              style={{ color: THEME.success }}
                            />
                          </>
                        );
                      })()
                    ) : resolved.run.status === "skipped" ? (
                      <span className="text-muted-foreground"> · skipped</span>
                    ) : resolved.run.status === "race_no_show" ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · race day passed
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {runTemplate && (
                <div className="pl-5 space-y-1">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-mono tabular-nums">
                      {runTemplate.config.targetDistanceKm
                        ? runDoseLine(
                            runTemplate,
                            planningEasyPaceSPerKm(profile?.runFitness)
                          )
                        : `${
                            runMinutesLine(
                              runTemplate,
                              null,
                              plannedIntervalPaceSPerKm(profile?.runFitness)
                            ) ?? `${runTemplate.estimatedDuration} min`
                          } total`}
                    </span>
                    {/* Run21 (2): the session's one feel line. */}
                    {" · "}
                    {runAbout?.feel}
                  </p>
                  <RunPurpose>
                    <RunAbout about={runAbout} why={runPurpose} />
                  </RunPurpose>
                  {todayRunAhead && heat.level !== "none" && heatLineToday && (
                    <HeatPanel
                      level={heat.level}
                      line={heatLineToday}
                      coolest={coolestToday}
                      note={HEAT_PREVIEW_LINE}
                    />
                  )}
                </div>
              )}
              {/* Q5 P69/P70/P71 — extras rows. Mirrored from
                  RunWeekStrip: outlined Footprints icon + dimmed
                  text to differentiate from the planned-slot row
                  above. Tap → RunDetail. Overflow tap → /history. */}
              {visibleExtras.map((extra) => (
                <ExtraRunRow
                  key={extra.id}
                  extra={extra}
                  onTap={() => navigate(`/run/${extra.id}`)}
                />
              ))}
              {overflowCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExtrasSheetOpen(true)}
                  aria-label={`${overflowCount} more extra ${overflowCount === 1 ? "run" : "runs"} logged for this date, open all`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground hover:text-foreground -ml-1 px-1 rounded-md transition active:scale-[0.97]"
                >
                  <Footprints className="size-3.5 shrink-0 opacity-50 text-running" />
                  <span>
                    +{overflowCount} more extra{" "}
                    {overflowCount === 1 ? "run" : "runs"}
                  </span>
                </button>
              )}
            </div>
          ) : sessionsLoading ? (
            <Skeleton className="h-3 w-32" />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No activity logged
            </p>
          )}
          {/* PR-1: secondary "Manage" CTA. Only rendered when the
              day has a matched lift or runDay AND a parent supplied
              onManage. Home remains glance-first: this is the only
              affordance that exposes day-level actions; the summary
              rows above stay informational.

              Sits BELOW the sessions, not between them and the heading.
              Above, it put a verb where the eye expects the day's
              content — you read "Wed 12 Aug / Manage day / Legs — Squat
              Focus" — and it claimed a full 44px row while rendering as
              the smallest text on the card. Content first, action last
              is both the conventional card order and the one that stops
              a 44px touch target reading as an accident. */}
          {onManage &&
            (resolved.run.runDay !== null ||
              manageLiftOn(day).workout !== null) && (
              <div className="pt-1 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => onManage(dateKey)}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-foreground px-2 min-h-[44px] rounded-lg transition-transform active:scale-[0.97]"
                >
                  <Settings2 className="size-3.5" />
                  Manage day
                </button>
              </div>
            )}
        </div>
      </div>
      <Suspense fallback={null}>
        <ExtrasExpandSheet
          open={extrasSheetOpen}
          onClose={() => setExtrasSheetOpen(false)}
          dateKey={dateKey}
          extras={extras}
        />
      </Suspense>
    </m.div>
  );
}

/** A lift's name as Train names it in its week ("Pull B"). */
function liftName(programState: ProgramState | null, lift: LayoutLift): string {
  return lift.workout
    ? liftDayNameIn(
        (programState?.workouts ?? []).map((w) => w.dayName),
        lift.index ?? -1,
        lift.workout.dayName
      )
    : "Lift";
}

/** Where a passed lift day's lift went: to a later day, still to do this
 *  week, or skipped. */
function whereItWent(gone: SlidOut, todayKey: string): string {
  return gone.to === "skipped"
    ? "skipped"
    : gone.to === "still-to-do"
      ? "still to do"
      : gone.to === todayKey
        ? "moved to today"
        : `moved to ${formatWeekday(parseLocalDate(gone.to))}`;
}

/** A line about a lift the day does not hold to do: one that moved on,
 *  one skipped from it, or a day that rests before a race. */
function LiftNoteRow({ name, note }: { name?: string; note: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Dumbbell className="size-3.5 shrink-0 text-lifting opacity-50" />
      <span className="text-foreground">
        {name}
        <span className="text-muted-foreground">
          {name ? ` · ${note}` : note}
        </span>
      </span>
    </div>
  );
}

/**
 * Q5 P70 — extras row rendering inside DayPeekCard. Mirrors the
 * RunWeekStrip pill's visual language for cross-surface coherence:
 * outlined / dimmed Footprints (vs the solid coral on the planned-
 * slot row), muted-foreground text. Whole `<button type="button">` is the tap
 * target so the row meets the iOS HIG touch floor inside the card.
 *
 * Distance label format: "5 km" when whole-km, "5.4 km" otherwise
 * (spaced unit — the app's one unit treatment). Bucket text falls back
 * from `type` to "run" so the aria-label always has something to
 * announce.
 */
function ExtraRunRow({
  extra,
  onTap,
}: {
  extra: SavedRunDoc;
  onTap: () => void;
}) {
  const unit = useDistanceUnit();
  const dist =
    typeof extra.distance === "number" && extra.distance > 0
      ? distanceIn(extra.distance, unit)
      : null;
  const distanceText =
    dist === null
      ? "Run"
      : `${Number.isInteger(dist) ? dist : dist.toFixed(1)} ${distanceUnitLabel(unit)}`;
  const bucketText =
    typeof extra.type === "string" && extra.type.length > 0
      ? extra.type
      : "run";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Extra run: ${distanceText} ${bucketText}, tap to open`}
      className="flex min-h-11 w-full items-center gap-2 -ml-1 px-1 py-2 rounded-md text-sm text-left text-foreground transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Footprints className="size-3.5 shrink-0 opacity-50 text-running" />
      <span className="text-muted-foreground">
        Extra: {distanceText} {bucketText}
      </span>
      <ChevronRight
        className="ml-auto size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}
