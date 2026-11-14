import { Button } from "@/components/ui/Button";
import { withPlannedRest } from "@/lib/intervalRest";
import { localDateString } from "@/lib/dateHelpers";
import { Lock, Play } from "lucide-react";
import { track as trackPaywall } from "@/lib/paywallAnalytics";
import {
  RACE_PLAN_UPGRADE_PATH,
  lockedPlanRunStarts,
} from "@/lib/racePlanAccess";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { unlockSpeech } from "@/lib/speechUnlock";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { runPoseFor, runPoseUrl } from "@/lib/runPoses";
import { RUN_POSE_CUTOUTS } from "@/lib/runPoses.data";
import { heroMotionFor } from "@/lib/heroMotion";
import type { RacePaceWork } from "@/lib/racePace";
import { runSessionName } from "@/lib/runSessionAbout";
import { runHeroLine, type HeroLine } from "@/lib/homeHero";
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import {
  getScheduledRunStatus,
  isScheduledRunCompleted,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import InProgressStrip from "@/components/session/InProgressStrip";
import SessionHero from "@/components/home/SessionHero";
import type { SessionInProgress } from "@/lib/sessionsInFlight";
import { useEffect } from "react";
import { getCurrentWeather } from "@/lib/weather";
import { isHeatAdjustable } from "@/lib/heatAdjustment";

/**
 * Today's run, as Home's hero (DS4; `SessionHero` draws it). Twin of
 * LiftCTACard: Start begins the run, straight into finding the GPS
 * (`startOnArrival`), anywhere else on the hero opens it in Train, a
 * finished or skipped run says so instead of offering Start, and a run
 * under way offers Resume in its place. The hero names the run and its
 * dose, and its line is the run in its own numbers (`runHeroLine`); why
 * this run matters lives in Train's day details ("Why this run"). A
 * runner is its picture, as the lift hero draws its lead lift: the fast
 * stride for a tempo, intervals or a race (`runPoseFor`). A free run has
 * no plan to put in numbers, so its line is the week's distance, which
 * Home reads and words (`freeRunHeroLine`).
 */
export default function RunCTACard({
  todayRun,
  racePace = null,
  navigate,
  completed,
  dose,
  unit,
  inProgress = null,
  startTarget,
  easyPaceSPerKm = null,
  intervalPaceSPerKm = null,
  freeLine = null,
  variant = "hero",
  planLocked = null,
}: {
  todayRun: ScheduledRunDay | null;
  /** A long run that finishes at race pace says so in its name
   *  (Run21 (2)). */
  racePace?: RacePaceWork | null;
  navigate: (p: string) => void;
  completed?: boolean;
  /** The session's dose, as `todaySession` decided it (Run21 (5)). */
  dose?: string | null;
  /** The reader's unit: a long run is named in it. */
  unit: DistanceUnit;
  /** A run is under way on this phone (`todaySession`). */
  inProgress?: SessionInProgress | null;
  /** Where Start goes, as `todaySession` decided it (`runStartTarget`). */
  startTarget: string;
  /** The confirmed easy pace, s/km (`planningEasyPaceSPerKm`), for the
   *  line of an easy or long run. */
  easyPaceSPerKm?: number | null;
  /** The confirmed interval pace, s/km (`plannedIntervalPaceSPerKm`): the
   *  rest an interval session's line states (deep dive D15). */
  intervalPaceSPerKm?: number | null;
  /** A free run's line (`freeRunHeroLine`): this week's distance against
   *  last week's. Drawn only where no planned run is named. */
  freeLine?: HeroLine | null;
  /** The half or full marathon plan has passed its free first week
   *  (whole-app grill Q85): the button offers Pro instead of Start, with
   *  its words. The race itself still starts. */
  planLocked?: { cta: string; raceName: string } | null;
  /** `compact`: the second session of a day with two, under the hero. */
  variant?: "hero" | "compact";
}) {
  const tmpl = todayRun
    ? RUN_TEMPLATES.find(function (t) {
        return t.id === (todayRun.userOverride || todayRun.templateId);
      })
    : null;
  /* A run day with no planned run yet (a new plan, or a legacy schedule)
     is a free run, the name Train's Run tab gives the same choice. */
  const runLabel = runSessionName(tmpl, racePace, unit, "Free run");
  const pose = runPoseFor(tmpl?.type);

  // HOME-ACTION-01: a terminal/reconciliation run must not relaunch the run
  // flow, so it gets no Start. No todayRun (cold-start) is startable.
  const status = todayRun ? getScheduledRunStatus(todayRun) : "planned";
  const isCompleted = completed ?? isScheduledRunCompleted(status);
  const startable = !isCompleted && isScheduledRunStartable(status);
  const statusLabel = isCompleted
    ? "Completed"
    : status === "skipped"
      ? "Skipped"
      : "Needs review";

  // The hero opens today's run in Train's Run tab to look it over; Start
  // begins the run. A finished or skipped run has no Start.
  const dayTarget = "/program?tab=run&rday=" + localDateString(new Date());
  /* No rationale and no plan week on the hero: the plan's position is the
     kicker's beside the date, and the reasons are Train's ("Why this
     run"). */
  const meta = tmpl && dose ? dose.split(" · ") : [];
  /* Q85: past the plan's free first week a planned session offers Pro;
     the race itself still starts, and so does a free run. */
  const locked = !!planLocked && !!tmpl && !lockedPlanRunStarts(tmpl.type);
  const line: HeroLine | null = locked
    ? {
        title: `Your ${planLocked?.raceName ?? "race"} plan continues with Pro`,
        detail: "Week 2 on is part of Pro. Runs you record stay free.",
        mark: "run",
      }
    : tmpl
      ? runHeroLine(
          withPlannedRest(tmpl, intervalPaceSPerKm),
          easyPaceSPerKm,
          unit
        )
      : freeLine;

  /* A planned run to start today reads the weather now, so the run page
     finds it known and, on a hot day, shows the run's card with its heat
     offer instead of starting (startOnArrival) without a wait. The hero
     itself says nothing of it. */
  const readsWeather =
    startable && !inProgress && !locked && isHeatAdjustable(tmpl?.type);
  useEffect(
    function () {
      if (readsWeather) void getCurrentWeather();
    },
    [readsWeather]
  );

  const offerPro = function () {
    haptic();
    trackPaywall("paywall_cta_clicked", { source: "race_plan" });
    navigate(RACE_PLAN_UPGRADE_PATH);
  };

  const start = function () {
    // The run starts as the Run page opens, so the voice cues are
    // unlocked here, inside the tap.
    unlockSpeech();
    haptic();
    trackHomeEvent("home_card_tapped", {
      card: "today_run",
      action: "start",
    });
    navigate(startTarget);
  };

  const action =
    startable && inProgress ? (
      <InProgressStrip
        session={inProgress}
        onCard
        onResume={function () {
          trackHomeEvent("home_card_tapped", {
            card: "today_run",
            action: inProgress.reviewPending ? "review" : "resume",
          });
          navigate(inProgress.resumeTarget);
        }}
      />
    ) : startable && locked ? (
      <Button
        variant={variant === "hero" ? "neutral" : "sport-tinted"}
        className={
          variant === "hero"
            ? "pointer-events-auto w-full text-base"
            : "pointer-events-auto shrink-0"
        }
        onClick={offerPro}
      >
        <Lock className="size-4" aria-hidden="true" />
        {planLocked?.cta}
      </Button>
    ) : startable ? (
      variant === "hero" ? (
        /* The screen's one full-width filled button is neutral (DS4,
           DESIGN_GUIDE §14i): the running colour stays on the data. */
        <Button
          variant="neutral"
          className="pointer-events-auto w-full text-base"
          onClick={start}
        >
          <Play className="size-4 fill-current" aria-hidden="true" />
          Start run
        </Button>
      ) : (
        /* The compact card under the hero keeps the screen to one filled
           button (DESIGN_GUIDE §14m rule 21): coral, but tinted. */
        <Button
          variant="sport-tinted"
          className="pointer-events-auto shrink-0"
          onClick={start}
        >
          <Play className="size-4 fill-current" aria-hidden="true" />
          Start run
        </Button>
      )
    ) : (
      <p className="pointer-events-none inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground">
        {statusLabel}
      </p>
    );

  return (
    <SessionHero
      sport="run"
      variant={variant}
      title={runLabel}
      meta={meta}
      picture={{
        src: runPoseUrl(pose),
        motion: heroMotionFor(RUN_POSE_CUTOUTS[pose].src),
      }}
      line={line}
      action={action}
      preview={{
        label: tmpl ? `Open ${runLabel} in Train` : "Open today in Train",
        onOpen: function () {
          haptic();
          trackHomeEvent("home_card_tapped", {
            card: "today_run",
            action: "details",
          });
          navigate(dayTarget);
        },
      }}
    />
  );
}
