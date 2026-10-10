import InlineNumerals from "@/components/ui/InlineNumerals";
import { Button } from "@/components/ui/Button";
import { localDateString } from "@/lib/dateHelpers";
import { Play } from "lucide-react";
import RunTemplateIcon from "@/components/run/RunTemplateIcon";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { RacePaceWork } from "@/lib/racePace";
import { runSessionName } from "@/lib/runSessionAbout";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import {
  getScheduledRunStatus,
  isScheduledRunCompleted,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { cardClasses } from "@/components/ui/cardClasses";

/**
 * Today's run, as Home's lead card (DS3). Twin of LiftCTACard: Start
 * begins the run, anywhere else on the card opens it in Train, and a
 * finished or skipped run says so instead of offering Start. The card
 * shows the session and its dose; why this run matters lives in Train's
 * day details ("Why this run"), per the 2026-09-09 daily-logging note.
 */
export default function RunCTACard({
  todayRun,
  racePace = null,
  navigate,
  isFirst = false,
  eyebrowLabel,
  completed,
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
}) {
  const tmpl = todayRun
    ? RUN_TEMPLATES.find(function (t) {
        return t.id === (todayRun.userOverride || todayRun.templateId);
      })
    : null;
  /* A run day with no planned run yet (a new plan, or a legacy schedule)
     is a free run, the name Train's Run tab gives the same choice. */
  const runLabel = runSessionName(tmpl, racePace, "Free run");
  const runIcon = tmpl?.icon;
  // P0-6: pass scheduledRunId so Run.tsx can pin the exact runDay
  // being fulfilled. Falls back to ?template= alone for legacy
  // runDays without v2 ids (no id field on the schedule object).
  const params: string[] = [];
  if (tmpl) params.push("template=" + tmpl.id);
  if (todayRun?.id)
    params.push("scheduledRunId=" + encodeURIComponent(todayRun.id));
  const queryString = params.length ? "?" + params.join("&") : "";

  // Key metric = the planned distance, read from the template config (the
  // source of truth) rather than regex-parsed out of the prose description.
  // Descriptions are coaching-led now ("Steady, controlled effort"), so the
  // distance no longer lives in the text; reading config also makes the metric
  // work for race templates whose descriptions carry no distance.
  const runKeyMetric = tmpl?.config.targetDistanceKm
    ? `${tmpl.config.targetDistanceKm} km`
    : null;

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
        className: "relative overflow-hidden bg-running/12",
      })}
    >
      {/* The card-wide preview, beneath the content (see LiftCTACard). */}
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "today_run" });
          navigate(dayTarget);
        }}
        aria-label={tmpl ? `Open ${runLabel} in Train` : "Open today in Train"}
        className="absolute inset-0 z-0 rounded-[inherit] motion-safe:active:bg-running/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      />
      <div className="pointer-events-none relative z-10 flex items-start gap-4 px-5 pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-running-strong">
            <InlineNumerals>{eyebrow}</InlineNumerals>
          </p>
          <p className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground text-balance">
            <InlineNumerals>{runLabel}</InlineNumerals>
          </p>
          {tmpl && (
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              <InlineNumerals>
                {runKeyMetric
                  ? `${runKeyMetric} · about ${tmpl.estimatedDuration} min`
                  : `About ${tmpl.estimatedDuration} min`}
              </InlineNumerals>
            </p>
          )}
        </div>
        <div className="size-12 shrink-0 rounded-2xl flex items-center justify-center bg-running/12">
          <RunTemplateIcon
            icon={runIcon}
            className="size-6 text-running"
            aria-hidden="true"
          />
        </div>
      </div>
      {/* Taps pass through the action row to the preview; only Start takes
          its own (see LiftCTACard). */}
      <div className="pointer-events-none relative z-10 px-5 pb-5 pt-4">
        {startable ? (
          <Button
            variant="sport"
            size="lg"
            className="pointer-events-auto w-full"
            onClick={function () {
              haptic();
              trackHomeEvent("home_card_tapped", { card: "today_run" });
              navigate("/run" + queryString);
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
