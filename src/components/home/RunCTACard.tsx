import { Button } from "@/components/ui/Button";
import { localDateString } from "@/lib/dateHelpers";
import { Play } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { unlockSpeech } from "@/lib/speechUnlock";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { runPoseFor, runPoseUrl } from "@/lib/runPoses";
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
  freeLine = null,
  variant = "hero",
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
  /** A free run's line (`freeRunHeroLine`): this week's distance against
   *  last week's. Drawn only where no planned run is named. */
  freeLine?: HeroLine | null;
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
  const line = tmpl ? runHeroLine(tmpl, easyPaceSPerKm, unit) : freeLine;

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
      picture={{ src: runPoseUrl(pose) }}
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
