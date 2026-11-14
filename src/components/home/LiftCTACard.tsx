import { useMemo } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { formArtCutoutUrl, sessionLeadArt } from "@/lib/formArtCutouts";
import { heroMotionFor } from "@/lib/heroMotion";
import {
  cardSessionMinutes,
  type PricedExercise,
} from "@/features/program/expressSession";
import type { RestContext } from "@/features/program/restTime";
import type { ProgramExercise } from "@/features/program/programTypes";
import { liftCardTitle, liftDayLine, liftDayTitle } from "@/lib/liftDayLabel";
import { aboutMinutes, focusPhrase, liftHeroLine } from "@/lib/homeHero";
import type { LiftUnit } from "@/lib/liftLoad";
import InProgressStrip from "@/components/session/InProgressStrip";
import SessionHero from "@/components/home/SessionHero";
import ReadinessStrip from "@/components/home/ReadinessStrip";
import type { SessionInProgress } from "@/lib/sessionsInFlight";
import type { TodayReadiness } from "@/hooks/useTodayReadiness";

type LiftCardExercise = Partial<PricedExercise> &
  Partial<Pick<ProgramExercise, "weight" | "lastPerformance" | "repUnit">> & {
    name: string;
  };

/**
 * Today's lift, as Home's hero (DS4; `SessionHero` draws it).
 *
 * Two actions, two controls. Start begins the session: it deep-links to
 * the day with `start=1`, and Train starts it the way its own Start does.
 * Anywhere else on the hero opens the day in Train to look it over first.
 * A finished or skipped day has no Start; the hero says what happened and
 * still opens the day. A workout already under way offers Resume in
 * Start's place (`InProgressStrip`).
 *
 * The picture is the first exercise in the day that has released art,
 * cut out of its black backdrop (`formArtCutouts`), and the line under it
 * is that lift as the plan asks for it today against the last time it was
 * done (`liftHeroLine`). A day with no art shows no picture rather than a
 * stand-in. No rationale: the reasons stay behind "Why this session" on
 * Train (DS4 call 5).
 *
 * Readiness (whole-app grill Q41) sits above Start on the hero when Home
 * passes it: the morning question, or a word and its fact, and on a
 * Steady or Go easy day a link to the easier session (`easierTarget`,
 * Train's own "Go easier today", started the way its Start is).
 */
export default function LiftCTACard({
  nextWorkout,
  navigate,
  muscleGroups,
  dayTarget,
  startTarget,
  isStartable = true,
  status,
  rest,
  dayLabel,
  inProgress = null,
  unit = "kg",
  variant = "hero",
  readiness = null,
}: {
  nextWorkout: {
    completed?: boolean;
    skipped?: boolean;
    dayName: string;
    dayType: string;
    exercises: LiftCardExercise[];
  };
  navigate: (p: string) => void;
  muscleGroups?: string;
  /** HOME-ACTION-01: where the exact Programme day this card represents
   *  opens (`?day=N`), and where Start goes; `todaySession` decides both
   *  (`liftTargets`), as it does for the first-week card. */
  dayTarget: string;
  startTarget: string;
  /** HOME-ACTION-01: false when the lift slot is already completed/skipped
   *  (terminal). The card names its status and offers no Start. */
  isStartable?: boolean;
  status?: "none" | "planned" | "completed" | "skipped";
  /** How the session's timer will rest, so the minutes price it. */
  rest?: RestContext;
  /** The day as Train names it in its week ("Pull B", `liftDayNameIn`).
   *  Without it a generated day is named by its type alone. */
  dayLabel?: string;
  /** This workout is under way on this phone (`todaySession`). */
  inProgress?: SessionInProgress | null;
  /** The lifter's unit, for the line's loads. */
  unit?: LiftUnit;
  /** `compact`: the second session of a day with two, under the hero. */
  variant?: "hero" | "compact";
  /** Today's readiness, for the hero's planned day (`useTodayReadiness`),
   *  with where the easier session starts and what it changes. */
  readiness?: {
    today: TodayReadiness;
    /** Pro on the phone, before Health has been asked for sleep and
     *  heart: ask it. Null otherwise. */
    connectBody?: (() => Promise<void>) | null;
    easierTarget: string;
    easierSummary: string;
  } | null;
}) {
  const state =
    status ??
    (nextWorkout.completed
      ? "completed"
      : nextWorkout.skipped
        ? "skipped"
        : isStartable
          ? "planned"
          : "none");
  const statusLabel =
    state === "completed"
      ? "Completed"
      : state === "skipped"
        ? "Skipped"
        : "Needs review";

  const count = nextWorkout.exercises.length;
  const { category } = liftDayTitle(nextWorkout.dayName);
  /* A generated day is titled as Train names it in its week ("Pull B").
     A custom name with a dash keeps its first half above the title. No
     "Today" or "Planned for today" claim: Home resolves a lift by weekday
     and Train by rotation (ADR-0002), and the date beside the hero is
     the kicker's (liftCardRegister.test.tsx). */
  const title = liftCardTitle(nextWorkout.dayName, dayLabel);
  const minutes = useMemo(
    () => cardSessionMinutes(nextWorkout.exercises, rest),
    [nextWorkout.exercises, rest]
  );
  const art = useMemo(
    () => sessionLeadArt(nextWorkout.exercises)?.cutout ?? null,
    [nextWorkout.exercises]
  );
  /* The line is a prescription against last time, so only a day still to
     train has one, as on Train. Saving a session moves the day on (next
     time's load, and this session as "last time"), so a done day would
     read next session's target against the one just done. */
  const line = useMemo(
    () =>
      state === "planned" ? liftHeroLine(nextWorkout.exercises, unit) : null,
    [state, nextWorkout.exercises, unit]
  );
  const focus = muscleGroups ? focusPhrase(muscleGroups) : "";
  /* The day's muscles as words, then its minutes; with no muscles to
     name, the exercise count stands in. */
  const meta = [
    focus || `${count} ${count === 1 ? "exercise" : "exercises"}`,
    ...(minutes !== null ? [aboutMinutes(minutes)] : []),
  ];

  const openDay = function () {
    haptic();
    trackHomeEvent("home_card_tapped", {
      card: "today_workout",
      action: "details",
    });
    navigate(dayTarget);
  };
  const start = function () {
    haptic();
    trackHomeEvent("home_card_tapped", {
      card: "today_workout",
      action: "start",
    });
    navigate(startTarget);
  };

  const action =
    state === "planned" && inProgress ? (
      <InProgressStrip
        session={inProgress}
        onCard
        onResume={function () {
          trackHomeEvent("home_card_tapped", {
            card: "today_workout",
            action: "resume",
          });
          navigate(inProgress.resumeTarget);
        }}
      />
    ) : state === "planned" ? (
      variant === "hero" ? (
        <div className="space-y-3">
          {readiness && (
            <ReadinessStrip
              readiness={readiness.today.readiness}
              feel={readiness.today.feel}
              onFeel={readiness.today.setFeel}
              easierSummary={readiness.easierSummary}
              onConnectBody={readiness.connectBody ?? null}
              onEasier={function () {
                /* A plain "start": nothing variant- or reason-shaped
                   enters analytics (easierToday.ts, Privacy). */
                trackHomeEvent("home_card_tapped", {
                  card: "today_workout",
                  action: "start",
                });
                navigate(readiness.easierTarget);
              }}
            />
          )}
          {/* The screen's one full-width filled button is neutral (DS4,
              DESIGN_GUIDE §14i): the lifting colour stays on the data. */}
          <Button
            variant="neutral"
            className="pointer-events-auto w-full text-base"
            onClick={start}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Start workout
          </Button>
        </div>
      ) : (
        /* The compact card under the hero keeps the screen to one filled
           button (DESIGN_GUIDE §14m rule 21): purple, but tinted. */
        <Button
          variant="lifting-tinted"
          className="pointer-events-auto shrink-0"
          onClick={start}
        >
          <Play className="size-4 fill-current" aria-hidden="true" />
          Start workout
        </Button>
      )
    ) : (
      // HOME-ACTION-01: a completed/skipped lift is not launchable —
      // say what happened. The hero behind still opens the day.
      <p className="pointer-events-none inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground">
        {statusLabel}
      </p>
    );

  return (
    <SessionHero
      sport="lift"
      variant={variant}
      category={category}
      title={title}
      meta={meta}
      picture={
        art
          ? {
              src: formArtCutoutUrl(art),
              className: "exercise-drawing",
              motion: heroMotionFor(art.src),
            }
          : null
      }
      line={line}
      action={action}
      preview={{
        label: `Open ${dayLabel ?? liftDayLine(nextWorkout.dayName)} in Train`,
        onOpen: openDay,
      }}
    />
  );
}
