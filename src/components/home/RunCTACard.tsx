import InlineNumerals from "@/components/ui/InlineNumerals";
import MetaLine from "@/components/ui/MetaLine";
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
import type { DistanceUnit } from "@/lib/distanceUnits";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import {
  getScheduledRunStatus,
  isScheduledRunCompleted,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { cardClasses } from "@/components/ui/cardClasses";
import InProgressStrip from "@/components/session/InProgressStrip";
import type { SessionInProgress } from "@/lib/sessionsInFlight";

/**
 * Today's run, as Home's lead card (DS3). Twin of LiftCTACard: Start
 * begins the run, straight into finding the GPS (`startOnArrival`),
 * anywhere else on the card opens it in Train, and a finished or skipped
 * run says so instead of offering Start, and a run under way offers
 * Resume in its place. The card
 * shows the session and its dose; why this run matters lives in Train's
 * day details ("Why this run"), per the 2026-09-09 daily-logging note.
 * A runner stands at the right, as the lift card draws its lead lift:
 * the fast stride for a tempo, intervals or a race (`runPoseFor`).
 */
export default function RunCTACard({
  todayRun,
  racePace = null,
  navigate,
  isFirst = false,
  eyebrowLabel,
  completed,
  dose,
  unit,
  inProgress = null,
  startTarget,
}: {
  todayRun: ScheduledRunDay | null;
  /** A long run that finishes at race pace says so in its name
   *  (Run21 (2)). */
  racePace?: RacePaceWork | null;
  navigate: (p: string) => void;
  /** #972 cold-start framing: frame this as the user's first run. */
  isFirst?: boolean;
  /** Replaces the label above the title, for a run that is not today's
   *  planned session (free running plans none). */
  eyebrowLabel?: string;
  completed?: boolean;
  /** The session's dose, as `todaySession` decided it (Run21 (5)). */
  dose?: string | null;
  /** The reader's unit: a long run is named in it. */
  unit: DistanceUnit;
  /** A run is under way on this phone (`todaySession`). */
  inProgress?: SessionInProgress | null;
  /** Where Start goes, as `todaySession` decided it (`runStartTarget`). */
  startTarget: string;
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

  // The card opens today's run in Train's Run tab to look it over; Start
  // begins the run. A finished or skipped run has no Start.
  const dayTarget = "/program?tab=run&rday=" + localDateString(new Date());
  /* No plan position ("Base · week 3 of 16") and no rationale: Home
     shows the session and its dose, and both live in the day's details
     (owner direction, 2026-09-09; pinned in SessionPurpose.test.tsx). */
  const eyebrow =
    eyebrowLabel ?? (isFirst ? "Your first run" : "Today · Run day");

  return (
    <div
      className={cardClasses({
        tone: "tinted",
        padded: false,
        className: "@container relative overflow-hidden bg-running/12",
      })}
    >
      {/* The card-wide preview, beneath the content (see LiftCTACard). */}
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", {
            card: "today_run",
            action: "details",
          });
          navigate(dayTarget);
        }}
        aria-label={tmpl ? `Open ${runLabel} in Train` : "Open today in Train"}
        className="absolute inset-0 z-0 rounded-[inherit] motion-safe:active:bg-running/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      />
      {/* The runner gives the text the card's width under 14em, as the
          lift card's drawing does. */}
      <img
        src={runPoseUrl(pose)}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className="pointer-events-none absolute right-2 top-3 z-0 h-[136px] w-[42%] object-contain object-right-top @max-[14em]:hidden"
      />
      <div className="pointer-events-none relative z-10 px-5 pt-5 pr-[46%] @max-[14em]:pr-5">
        <p className="text-sm font-bold text-running-strong">
          <InlineNumerals>{eyebrow}</InlineNumerals>
        </p>
        <p className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground text-balance">
          <InlineNumerals>{runLabel}</InlineNumerals>
        </p>
        {/* Foreground on the running wash, where the grey misses AA. A
            fact line, as the lift card's dose is: "15 km · about 100 min"
            wraps between its facts, never inside one. */}
        {tmpl && dose && (
          <MetaLine
            className="mt-2 font-medium text-foreground"
            items={dose.split(" · ")}
          />
        )}
      </div>
      {/* Taps pass through the action row to the preview; only Start takes
          its own (see LiftCTACard). */}
      <div className="pointer-events-none relative z-10 px-5 pb-5 pt-4">
        {startable && inProgress ? (
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
          <Button
            variant="sport"
            size="lg"
            className="pointer-events-auto w-full"
            onClick={function () {
              // The run starts as the Run page opens, so the voice cues
              // are unlocked here, inside the tap.
              unlockSpeech();
              haptic();
              trackHomeEvent("home_card_tapped", {
                card: "today_run",
                action: "start",
              });
              navigate(startTarget);
            }}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Start run
          </Button>
        ) : (
          <p className="pointer-events-none inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground">
            {statusLabel}
          </p>
        )}
      </div>
    </div>
  );
}
