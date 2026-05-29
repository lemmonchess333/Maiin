/**
 * PR-4 + PR-B: Programme Run tab — operational hero + inline mode
 * picker, configuration wizard as escape hatch.
 *
 * PR-4 inverted the hierarchy so the operational content (Start
 * CTA, race progress, this-week's-runs) sits in hero position
 * and configuration moved to the footer. PR-B then restored the
 * three-segment mode chip row (Freeform / Structured / Race Prep)
 * — but wired safely to a composing handler that runs
 * `updateProfile` AND `refreshRunSchedule` atomically (PR-0d's
 * direct-write bug is not reintroduced). The chip row sits
 * directly under the section header and above per-mode hero
 * content. The footer "Change plan ›" link deep-links to the unified
 * Programme Settings editor at /settings/training (Pgm4).
 *
 * Mode-change semantics by target:
 *
 *   freeform   → updateProfile({ runMode }) + refreshRunSchedule
 *                (early-returns internally, idempotent)
 *   structured → updateProfile({ runMode, runTargetWriteFields })
 *                with default target=3 when current target is 0
 *                + refreshRunSchedule which regenerates runDays
 *                via scheduleStructuredWeekV2
 *   race_prep  → DEFERRED: chip tap reveals the inline race-goal
 *                form (PR-B3). Writes happen on form save via
 *                handleSaveRaceGoal — same composing pattern.
 *
 * raceGoal preservation on mode exit: silent preserve (Phase A R1
 * audit confirmed every read of `profile.raceGoal` / `runPlan.raceGoal`
 * is gated by `runMode === "race_prep"`, so a preserved goal cannot
 * leak into another mode's UI). On race_prep → structured → race_prep
 * the form prefills from the preserved goal.
 *
 * What stays from PR-0d / PR-1 / PR-4:
 *   - DayActionSheet preserves manual-complete / skip-run /
 *     skip-lift / template swap.
 *   - Race-elapsed + compressed-plan banners + race progress
 *     card + this-week's-runs per-day list — unchanged.
 *   - Footer "Change plan ›" deep-links to /settings/training
 *     (the unified Programme Settings editor).
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Footprints,
  Check,
  Play,
  ChevronRight,
  MoreVertical,
} from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import { paceLabel, durationLabel, distanceLabel } from "@/lib/runLabels";
import { DAY_LABELS, getWeeklyRunTarget } from "@/lib/scheduleUtils";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { isRunDayComplete } from "@/lib/scheduledRunCompletion";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { getRunHeroState, shouldShowHeroOverflow } from "@/lib/runHeroState";
import { getFreeformCadence } from "@/lib/freeformCadence";
import {
  getRacePhaseLabel,
  isCurrentWeekInTaper,
} from "@/features/program/runScheduler";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useClaimMap } from "@/hooks/useClaimMap";
import { haptic } from "@/lib/haptic";
import DayActionSheet from "./DayActionSheet";
import RunWeekStrip from "./RunWeekStrip";
import { Banner } from "@/components/ui/Banner";
import {
  localDateString,
  localWeekKey,
  addLocalDays,
  parseLocalDate,
} from "@/lib/dateHelpers";
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ScheduledRunDay,
} from "@/features/program/programTypes";

type RaceDistance = "5k" | "10k" | "half" | "marathon";

interface ProgrammeRunSectionProps {
  profile: UserProfile;
  programState: ProgramState | null;
  /** Weekly run-day target. 0 for freeform users with no run plan;
   *  non-zero for structured/race_prep. Surfaces the "Configure
   *  your runs" CTA when a non-freeform mode is selected but the
   *  target is 0 (malformed plan). Freeform users see the hero
   *  regardless. */
  runsTarget: number;
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  /** PR-J Q2 chunk B2: replaces completeRunDay. Writes the
   *  manualCompletions map; derivation surfaces ✅. */
  markManualComplete: (runDayId: string) => Promise<void>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<void>;
  skipWorkoutDay: (dayIndex: number) => Promise<void>;
  /** PR-C: atomic writer to exit the recovery phase early. Clears
   *  `runPlan.phase` + `runPlan.recoveryEndDate` AND flips
   *  `profile.runMode` to "structured" in a coordinated pair of
   *  writes. The post-race card's "Skip recovery early" link calls
   *  this when the user wants to bail out of the soft window. */
  skipRecoveryEarly: () => Promise<void>;
}

export default function ProgrammeRunSection({
  profile,
  programState,
  runsTarget,
  overrideRunDay,
  markManualComplete,
  skipRunDay,
  skipWorkoutDay,
  skipRecoveryEarly,
}: ProgrammeRunSectionProps) {
  const navigate = useNavigate();
  // PR-1: which row is opening DayActionSheet.
  const [manageDate, setManageDate] = useState<string | null>(null);
  // PR-4: recent-run context for the freeform hero. 30-day window
  // is bounded by the hook's `where('completedAt', '>=', ...)`
  // clause; returns a `loading` flag the hero shell consumes for
  // non-blocking paint.
  const { runs, weeklyData, loading: runsLoading } = useRunningStats(30);
  // PR-J Q3 chunk B3b — single source of truth for derived
  // completion. Subscribes to users/{uid}/runs + reads
  // programState.manualCompletions; forwarded to RunWeekStrip so
  // the strip's ✅ tracks manual/saved-run/legacy completions.
  // Q5 chunk B3e — also forwards unclaimedByDate for the extras
  // pills (saved runs that don't claim any planned slot).
  const { claimMap, unclaimedByDate } = useClaimMap();

  // Run8 PR1a — mode pills + race-goal form removed from this
  // surface. Mode + race goal now live on `/settings/training`
  // (rendered by `TrainingSection`). The Programme page no longer
  // owns those writers; tap the section subtitle or the "Manage
  // Run Plan ›" footer link to navigate.

  // Run7 Q10 — per-week dismissibility for action-prompting banners.
  // raceElapsed is the only banner that's both action-prompting AND
  // dismissible per the spec (state-derived recovery + compressed
  // stay visible; isNoShow + recoveryEnded host critical actions and
  // shouldn't be dismissed either). Dismissal is keyed by this week's
  // localWeekKey so each Monday rollover the banner re-surfaces if
  // the race is still elapsed.
  const thisWeekKeyForDismissal = useMemo(() => localWeekKey(new Date()), []);
  const raceElapsedDismissKey = `tropos.dismiss.raceElapsed.${thisWeekKeyForDismissal}`;
  const [raceElapsedDismissed, setRaceElapsedDismissed] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      try {
        return window.localStorage.getItem(raceElapsedDismissKey) === "1";
      } catch {
        return false;
      }
    }
  );
  function dismissRaceElapsedBanner() {
    setRaceElapsedDismissed(true);
    try {
      window.localStorage.setItem(raceElapsedDismissKey, "1");
    } catch {
      // localStorage unavailable / quota — swallow; the in-memory
      // state still hides the banner for this session.
    }
  }

  const currentMode = profile.runMode ?? "freeform";
  const raceGoal = programState?.runPlan?.raceGoal;
  const raceCompressed = !!programState?.runPlan?.compressed;
  // Memoised: `programState?.runDays ?? []` produces a fresh array
  // reference on every render when the field is undefined, which
  // would invalidate the downstream useMemo deps.
  const runDays = useMemo(
    () => programState?.runDays ?? [],
    [programState?.runDays]
  );

  // Race-elapsed is a cheap render-time derivation; not memoised
  // because the comparison against "now" is impure and useMemo
  // would be flagged. Sub-microsecond cost; ran every render is
  // fine. Uses `new Date()` (constructor, not Date.now()) to
  // match the existing codebase pattern accepted by the
  // react-hooks/purity rule.
  const raceElapsedTarget = raceGoal ? new Date(raceGoal.targetDate) : null;
  const raceElapsed = !!(
    raceElapsedTarget &&
    !Number.isNaN(raceElapsedTarget.getTime()) &&
    raceElapsedTarget.getTime() < new Date().getTime()
  );

  // PR-C: post-race card state derivation. Driven by:
  //   - the race-day runDay status (planned / completed_* / race_no_show)
  //   - runPlan.phase ("recovery" or undefined)
  //   - today vs runPlan.recoveryEndDate (in-recovery / ended-grace / past-grace)
  //
  // Variants:
  //   inRecovery       → "Recovering — N days left" + Skip-recovery link
  //   recoveryEnded    → "Recovery complete. What's next?" + Set next race / Switch to structured
  //   noShow           → "We marked this as no-show. Log it now if you ran." + Log race now / Set next race / Switch to structured
  //
  // Outside these three: fall back to the legacy "Race day has passed"
  // banner (covers e.g. an old elapsed race where recovery already
  // ran its course and the +7d grace cleared phase).
  const raceDayRunDay = raceGoal
    ? runDays.find((rd) => rd.date === raceGoal.targetDate)
    : null;
  const raceDayStatus = raceDayRunDay
    ? getScheduledRunStatus(raceDayRunDay)
    : null;
  const phase = programState?.runPlan?.phase;
  const recoveryEndDate = programState?.runPlan?.recoveryEndDate;
  const todayKeyDerivation = localDateString(new Date());
  const inRecovery =
    phase === "recovery" &&
    !!recoveryEndDate &&
    todayKeyDerivation < recoveryEndDate;
  const recoveryEnded =
    phase === "recovery" &&
    !!recoveryEndDate &&
    todayKeyDerivation >= recoveryEndDate;
  const isNoShow = raceDayStatus === "race_no_show";
  const recoveryDaysLeft = useMemo(() => {
    if (!inRecovery || !recoveryEndDate) return 0;
    const end = parseLocalDate(recoveryEndDate);
    const ms = end.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  }, [inRecovery, recoveryEndDate]);

  // PR-4: surface the first non-terminal runDay as a promoted
  // "Next planned run" Start card on structured + race_prep. The
  // same `/run?template=…&scheduledRunId=…` URL pattern Home's
  // RunCTACard and trainingResolver.startUrl emit.
  const nextStartable: ScheduledRunDay | null = useMemo(() => {
    if (currentMode === "freeform") return null;
    // Run9 (ENG e / item 4): startability has TWO completion truths — the
    // stored `status` AND the claim-map (a saved run that matched this slot by
    // date+bucket without ever flipping `status` off "planned"). A slot is
    // genuinely startable only when its status says so AND no claim/manual
    // completion covers it; otherwise "Next planned run" would promote an
    // already-run slot and "all runs done" would never fire after a claimed log.
    return (
      runDays.find(
        (rd) =>
          isScheduledRunStartable(getScheduledRunStatus(rd)) &&
          !(rd.id && isRunDayComplete(rd.id, claimMap))
      ) ?? null
    );
  }, [currentMode, runDays, claimMap]);

  const nextStartableTemplate = useMemo(() => {
    if (!nextStartable) return null;
    const tmplId = nextStartable.userOverride || nextStartable.templateId;
    return RUN_TEMPLATES.find((t) => t.id === tmplId) ?? null;
  }, [nextStartable]);

  const nextStartUrl = useMemo(() => {
    if (!nextStartable) return null;
    const params: string[] = [];
    if (nextStartableTemplate)
      params.push("template=" + nextStartableTemplate.id);
    if (nextStartable.id)
      params.push("scheduledRunId=" + encodeURIComponent(nextStartable.id));
    return "/run" + (params.length ? "?" + params.join("&") : "");
  }, [nextStartable, nextStartableTemplate]);

  const allRunsDone =
    currentMode !== "freeform" && runDays.length > 0 && !nextStartable;

  // Run8 PR1c — hero state machine. Single discriminator replaces
  // the scattered `currentMode === X && raceGoal && ...` conjunctions
  // for hero-adjacent decisions. Initially used to gate the L12
  // overflow `...` button so it only renders on the four states the
  // locked plan calls for (planned-today / catch-up / race-today /
  // race-prep-week). Future renders can switch on the state name
  // directly instead of re-deriving the conditions.
  const tomorrowKeyDerivation = localDateString(addLocalDays(new Date(), 1));
  const heroState = getRunHeroState({
    mode: currentMode,
    raceGoal: raceGoal ?? null,
    phase: phase ?? null,
    recoveryEndDate: recoveryEndDate ?? null,
    nextStartable,
    todayKey: todayKeyDerivation,
    tomorrowKey: tomorrowKeyDerivation,
    hasRunDays: runDays.length > 0,
  });
  const showHeroOverflow = shouldShowHeroOverflow(heroState);

  // PR-F: temporal-anchored label for the "Next planned run" card.
  // Pre-PR-F this was just `Next · {DAY_LABELS[dayIndex]}`, which
  // forces the user to compute proximity ("is today Tuesday? then
  // Wed = tomorrow"). Today / Tomorrow / Pending makes the common
  // cases explicit; Pending flags past-planned runDays still
  // sitting startable in the current week (e.g. yesterday's
  // unstarted easy run) so the user doesn't think it's "next".
  const nextStartableLabel = useMemo<string>(() => {
    if (!nextStartable) return "";
    if (!nextStartable.date) return DAY_LABELS[nextStartable.dayIndex];
    const today = new Date();
    const todayKey = localDateString(today);
    const tomorrowKey = localDateString(addLocalDays(today, 1));
    if (nextStartable.date === todayKey) return "Today";
    if (nextStartable.date === tomorrowKey) return "Tomorrow";
    if (nextStartable.date < todayKey) return "Pending";
    return DAY_LABELS[nextStartable.dayIndex];
  }, [nextStartable]);

  // Freeform hero data — last run from the recent-30-day window
  // + this week's bucket.
  //
  // PR-F: "This week" must match the actual current calendar
  // week, not "the most recent week with any runs." Previously
  // `weeklyData[weeklyData.length - 1]` returned whichever week
  // last had a run logged — so for users who hadn't run in 10
  // days, it labelled last week's data as "This week." Filter by
  // explicit weekKey match instead.
  const lastRun = runs[0] ?? null;
  const thisWeekKey = localWeekKey(new Date());
  const thisWeek = weeklyData.find((w) => w.week === thisWeekKey) ?? null;

  // Run9 R2-1: freeform's hero leads with a DESCRIPTIVE cadence line — not a
  // target or progress bar (that's the structure the model deliberately
  // drops). getFreeformCadence owns the copy rules: cold-start (no count),
  // lapsed (re-invite, never "0×"), or an N× cadence over the rolling window.
  // The window is bounded by useRunningStats(30) above, so "lapsed" only
  // surfaces for runs 4–~4.3 weeks old; older history reads as cold-start,
  // which shares the same invitational copy.
  const freeformCadence = useMemo(
    () => getFreeformCadence(runs.map((r) => r.completedAt), new Date()),
    [runs]
  );

  const modeLabel =
    currentMode === "race_prep"
      ? "Race prep"
      : currentMode === "structured"
        ? "Structured"
        : "Freeform";

  // Run8 PR1a — handleModeChange + handleSaveRaceGoal removed.
  // Mode + race goal writers live on TrainingSection (rendered at
  // /settings/training). See `/root/.claude/plans/gentle-giggling-creek.md`.

  // PR-C: skip-recovery-early handler. Calls the dedicated
  // useProgram writer (`skipRecoveryEarly`) which atomically
  // clears `runPlan.phase` + `runPlan.recoveryEndDate` AND flips
  // `runMode` to "structured" so the user immediately gets their
  // normal training shape back. Race is past, recovery is done by
  // user's choice — the cleanest next direction is structured
  // training, which the user can then change via the chip row.
  async function handleSkipRecoveryEarly(): Promise<void> {
    try {
      await skipRecoveryEarly();
    } catch (e) {
      logger.error("[handleSkipRecoveryEarly] failed", e);
    }
  }

  // Run8 PR1a — `selectedMode` collapsed into `currentMode`. The
  // visual-intent + showRaceForm layers existed only because the
  // mode pills + race-goal form lived on this surface. With both
  // removed, `currentMode` (the last-saved profile.runMode) is the
  // only source of truth for reads on this page.

  return (
    /* Run7 Q1: outer "Run training" coral container dropped — sections
       separated by vertical spacing alone. Run sub-tab is the contextual
       anchor; no need for a second container chrome around it. */
    <section aria-label="Run training" className="space-y-4">
      {/* Run7 Q6 + Q10: banners stack ABOVE the section label, in
          severity-urgency order (warnings before info). Each uses the
          shared <Banner> primitive — info = coral 6%, warning = amber 8%,
          no error variant (errors are toasts). State-derived banners
          (inRecovery, raceCompressed) stay non-dismissible; raceElapsed
          is action-prompting and dismissible per-week via localStorage. */}

      {/* Warning: race day has passed (legacy elapsed fallback).
          Dismissible per-week — once the user acknowledges, it stays
          hidden until Monday rollover when the dismissal key resets. */}
      {currentMode === "race_prep" &&
        raceGoal &&
        raceElapsed &&
        !inRecovery &&
        !recoveryEnded &&
        !isNoShow &&
        !raceElapsedDismissed && (
          <Banner
            variant="warning"
            title="Race day has passed"
            description={
              <>
                {raceGoal.distance.toUpperCase()} on {raceGoal.targetDate}.
                Switch to structured or set a new race goal via the chip row.
              </>
            }
            onDismiss={dismissRaceElapsedBanner}
            dismissLabel="Dismiss race elapsed banner"
          />
        )}

      {/* Warning: plan compressed (state-derived — visibility tracks
          runPlan.compressed; user can't dismiss). */}
      {currentMode === "race_prep" &&
        raceGoal &&
        !raceElapsed &&
        raceCompressed && (
          <Banner
            variant="warning"
            title="Plan is compressed"
            description="Your target date is sooner than the ideal build for this distance, so we've trimmed interval work and shortened the long-run progression to keep the plan safe."
          />
        )}

      {/* Warning: race-day no-show. Hosts critical actions (Log race
          now / Set next race / Switch to structured) so the banner
          itself is the affordance — not dismissible. */}
      {currentMode === "race_prep" && raceGoal && isNoShow && (
        <Banner
          variant="warning"
          title={`${raceGoal.distance.toUpperCase()} — ${raceGoal.targetDate}`}
          description="We marked this as no-show after 3 days with no log. Log it now if you actually ran."
          action={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  if (raceDayRunDay?.id) {
                    haptic();
                    navigate(
                      `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                    );
                  }
                }}
                className="w-full py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: THEME.running }}
              >
                Log race now
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    navigate("/settings/training");
                  }}
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Set next race
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    navigate("/settings/training");
                  }}
                  className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
                >
                  Switch to structured
                </button>
              </div>
            </div>
          }
        />
      )}

      {/* Warning: malformed plan (non-freeform mode with no scheduled
          runs and no race goal). Action-prompting but critical —
          dismissing would hide the only Configure plan entry point. */}
      {currentMode !== "freeform" && runsTarget === 0 && !raceGoal && (
        <Banner
          variant="warning"
          title="Configure your runs"
          description={`You're on ${modeLabel.toLowerCase()} mode but no run days are scheduled. Open Configure plan to add them.`}
          action={
            <button
              type="button"
              onClick={() => {
                haptic();
                navigate("/settings/training");
              }}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Configure plan
            </button>
          }
        />
      )}

      {/* Info: recovery complete. Hosts critical "Set next race" /
          "Switch to structured" prompts — non-dismissible. */}
      {currentMode === "race_prep" && raceGoal && recoveryEnded && (
        <Banner
          variant="info"
          title="Recovery complete"
          description="What's next?"
          action={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  haptic();
                  navigate("/settings/training");
                }}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                Set next race
              </button>
              <button
                type="button"
                onClick={handleSkipRecoveryEarly}
                className="flex-1 py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
              >
                Switch to structured
              </button>
            </div>
          }
        />
      )}

      {/* Info: in recovery (state-derived — visibility tracks
          runPlan.phase === "recovery"; user can't dismiss). */}
      {currentMode === "race_prep" && raceGoal && inRecovery && (
        <Banner
          variant="info"
          title={`Recovering — ${recoveryDaysLeft} day${recoveryDaysLeft === 1 ? "" : "s"} left`}
          description="Easy runs this week. Templates auto-set to easy_30 until recovery ends."
          action={
            <button
              type="button"
              onClick={handleSkipRecoveryEarly}
              className="inline-flex items-center gap-0.5 text-xs font-semibold motion-safe:active:scale-95"
              style={{ color: THEME.running }}
            >
              Skip recovery early &rsaquo;
            </button>
          }
        />
      )}

      {/* Run7 Q6: section label as 10px uppercase a11y h2, RunningNavIcon
          inline left, coral icon + muted-foreground label. */}
      <header className="flex items-center gap-1.5">
        <Footprints
          aria-hidden="true"
          className="size-3.5"
          style={{ color: THEME.running }}
        />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Run training
        </h2>
      </header>

      {/* Run8 PR1a — section subtitle replaces the mode-pill row
          for Structured / Race Prep. Carries mode + at-a-glance
          context (run frequency for Structured, week-of-N + days-
          to-race for Race Prep). Tap navigates to /settings/training
          where the mode picker + race goal editor live. Freeform
          shows no subtitle — the hero below IS the mode reveal. */}
      {currentMode !== "freeform" && (
        <button
          type="button"
          onClick={() => {
            haptic();
            navigate("/settings/training");
          }}
          aria-label="Run plan summary — tap to manage"
          className="w-full text-left px-1 -mx-1 py-1 rounded-md motion-safe:active:scale-[0.99]"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {currentMode === "race_prep" && raceGoal ? (
              <>
                Race Prep
                {programState?.runPlan?.totalWeeks &&
                  programState?.runPlan?.currentWeek != null && (
                    <>
                      {" · "}
                      Week {programState.runPlan.currentWeek + 1} of{" "}
                      {programState.runPlan.totalWeeks}
                    </>
                  )}
                {(() => {
                  const ms =
                    new Date(raceGoal.targetDate).getTime() -
                    new Date().getTime();
                  const days = Math.max(
                    0,
                    Math.round(ms / (24 * 60 * 60 * 1000))
                  );
                  return (
                    <>
                      {" · "}
                      {days} {days === 1 ? "day" : "days"} to race
                    </>
                  );
                })()}
              </>
            ) : currentMode === "race_prep" ? (
              <>Race Prep · Set your race goal</>
            ) : (
              <>Structured · {getWeeklyRunTarget(profile)} runs/week</>
            )}
          </p>
        </button>
      )}

      {/* ── Hero: freeform ──────────────────────────────────────────
          Start CTA + last-run + this-week summary lines. Empty
          state when the user has no recent runs.
          Run7 Q7: subtle coral 6% tint (was gradient 18%→8%), icon
          container coral ~10% (was 13%). Same treatment applied to
          the Next · Pending card below for visual coherence. */}
      {currentMode === "freeform" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate("/run");
            }}
            className="w-full rounded-xl p-4 text-left flex items-center gap-3"
            style={{
              background: `${THEME.running}0F`,
              border: `1px solid ${THEME.running}30`,
            }}
          >
            <div
              className="size-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${THEME.running}1A` }}
            >
              <Footprints className="size-5" style={{ color: THEME.running }} />
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-semibold mb-0.5"
                style={{ color: THEME.running }}
              >
                Start a run
              </p>
              <p className="text-sm font-bold text-foreground">
                Pick your pace today
              </p>
              <p className="text-micro text-muted-foreground">
                Easy, tempo, intervals or just go
              </p>
            </div>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm shrink-0"
              style={{
                background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})`,
                color: "white",
              }}
            >
              <Play className="size-3" fill="white" />
              Go
            </div>
          </button>

          {/* Recent-run context. Hero shell paints immediately;
              these two lines fade in once useRunningStats resolves.
              No spinner is shown over the Start CTA above. */}
          {runsLoading ? (
            <div className="space-y-1.5">
              <div
                className="h-3.5 rounded bg-muted/60 animate-pulse"
                style={{ width: "70%" }}
              />
              <div
                className="h-3.5 rounded bg-muted/60 animate-pulse"
                style={{ width: "55%" }}
              />
            </div>
          ) : freeformCadence.kind === "cold-start" ? (
            <p className="text-xs text-muted-foreground">
              Track your first run to see weekly distance and pace trends here.
            </p>
          ) : freeformCadence.kind === "lapsed" ? (
            <p className="text-xs text-muted-foreground">
              Your last run was {freeformCadence.lastRunDaysAgo} day
              {freeformCadence.lastRunDaysAgo === 1 ? "" : "s"} ago — pick it
              back up whenever you're ready.
            </p>
          ) : (
            <div className="space-y-1 text-xs">
              {/* R2-1 descriptive cadence headline (not a target). */}
              <p className="text-foreground font-semibold">
                You've run {freeformCadence.count}× in the last{" "}
                {freeformCadence.weeks} weeks
              </p>
              <div className="space-y-1 font-mono tabular-nums">
              {lastRun && (
                <p className="text-muted-foreground">
                  <span className="text-foreground">Last run</span>
                  {" · "}
                  {distanceLabel(lastRun.distance)}
                  {" · "}
                  {durationLabel(lastRun.duration)}
                  {lastRun.avgPace > 0 && (
                    <>
                      {" · "}
                      {paceLabel(lastRun.avgPace)}
                    </>
                  )}
                  {" · "}
                  {formatDistanceToNowStrict(lastRun.completedAt, {
                    addSuffix: true,
                  })}
                </p>
              )}
              {thisWeek && (
                <p className="text-muted-foreground">
                  <span className="text-foreground">This week</span>
                  {" · "}
                  {thisWeek.totalDistance.toFixed(1)} km
                  {" · "}
                  {thisWeek.runCount} run{thisWeek.runCount === 1 ? "" : "s"}
                  {thisWeek.avgPace > 0 && (
                    <>
                      {" · "}
                      {paceLabel(thisWeek.avgPace)} avg
                    </>
                  )}
                </p>
              )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Run8 PR1a — the "Race prep not set up yet → Set race goal"
          inline form lives on /settings/training now. The section
          subtitle above ("Race Prep · Set your race goal") deeplinks
          users there when their race_prep mode is missing a goal. */}

      {/* ── Hero: race_prep progress card (promoted) ──────────────
          Run7 Q5: the race-goal form collapses to a one-line summary
          when a goal is already saved. Pre-Q5 the form was either
          fully open or replaced by a two-row "Race" label card with
          a coral Edit button. New shape: "Race goal: 10K · 16 Jul 2026
          · Edit ›" — single text run, muted-gray Edit link with
          chevron (Q2 navigation discipline: no coral on Edit). Week
          progress row stays as separate content underneath. */}
      {/* PR-K Q9d — TAPER WEEK section label. Surfaces the taper
          context on the race_prep operational hero when the current
          plan week falls in the taper phase. 10px uppercase tracking
          matches Run7's section-label convention; pairs with a "race
          in N days" countdown so the user reads the label as a
          calendar anchor, not a generic phase tag. The Week N/M row
          inside the operational card below still shows "Taper" as the
          phase label — this header acts as the prominent surface
          callout, the row stays as the at-a-glance week marker. */}
      {currentMode === "race_prep" &&
        raceGoal &&
        !raceElapsed &&
        isCurrentWeekInTaper(
          programState?.runPlan?.currentWeek,
          programState?.runPlan?.totalWeeks,
          raceGoal.distance as RaceDistance
        ) &&
        (() => {
          const daysToRace = (() => {
            try {
              const target = parseLocalDate(raceGoal.targetDate);
              const today = parseLocalDate(todayKeyDerivation);
              return Math.max(
                0,
                Math.round(
                  (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
                )
              );
            } catch {
              return null;
            }
          })();
          return (
            <p
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: THEME.running }}
              aria-label={
                daysToRace != null
                  ? `Taper week, race in ${daysToRace} day${daysToRace === 1 ? "" : "s"}`
                  : "Taper week"
              }
            >
              Taper week
              {daysToRace != null && (
                <>
                  {" · "}
                  race in {daysToRace} day{daysToRace === 1 ? "" : "s"}
                </>
              )}
            </p>
          );
        })()}

      {currentMode === "race_prep" && raceGoal && !raceElapsed && (
        <div className="p-3 rounded-xl bg-card space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">Race goal: </span>
              <span className="font-medium">
                {raceGoal.distance.toUpperCase()}
                {" · "}
                {(() => {
                  try {
                    return format(
                      parseLocalDate(raceGoal.targetDate),
                      "d MMM yyyy"
                    );
                  } catch {
                    return raceGoal.targetDate;
                  }
                })()}
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                haptic();
                navigate("/settings/training");
              }}
              className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
              aria-label="Edit race goal"
            >
              Edit
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          {programState?.runPlan?.totalWeeks &&
            programState.runPlan.currentWeek != null && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    Week
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {programState.runPlan.currentWeek + 1} /{" "}
                    {programState.runPlan.totalWeeks}
                    {" · "}
                    {getRacePhaseLabel(
                      programState.runPlan.currentWeek,
                      programState.runPlan.totalWeeks,
                      programState.runPlan.raceGoal!.distance as RaceDistance
                    )}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width:
                        ((programState.runPlan.currentWeek + 1) /
                          programState.runPlan.totalWeeks) *
                          100 +
                        "%",
                    }}
                  />
                </div>
              </>
            )}
        </div>
      )}

      {/* ── Next planned run (structured + race_prep with goal) ──
          Same URL pattern as RunCTACard / trainingResolver.startUrl.
          Skipped when every runDay in the week is already terminal
          (we render a "done this week" affirmation instead).
          Run7 Q7: subtle coral 6% tint, icon container coral ~10%,
          Start button flat coral solid, description line-clamp-2.

          Run8 PR1b — adds a `...` overflow button in the top-right.
          Tapping the card body navigates to /run (Start). Tapping
          `...` opens DayActionSheet for that runDay's date for
          mark-complete / skip / template-swap. Restructured from
          single <button type="button"> to <div role="button"> so the overflow
          button can live as a child without nested-button HTML. */}
      {currentMode !== "freeform" && nextStartable && nextStartUrl && (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Start ${nextStartableTemplate?.name ?? "run"}`}
          onClick={() => {
            haptic();
            navigate(nextStartUrl);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              haptic();
              navigate(nextStartUrl);
            }
          }}
          className="w-full rounded-xl p-3 text-left flex items-center gap-3 cursor-pointer motion-safe:active:scale-[0.99] motion-safe:transition-transform"
          style={{
            background: `${THEME.running}0F`,
            border: `1px solid ${THEME.running}30`,
          }}
        >
          <div
            className="size-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${THEME.running}1A` }}
          >
            <Footprints className="size-4" style={{ color: THEME.running }} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold mb-0.5"
              style={{ color: THEME.running }}
            >
              Next · {nextStartableLabel}
            </p>
            <p className="text-sm font-bold text-foreground truncate">
              {nextStartableTemplate?.name ?? "Run"}
            </p>
            {nextStartableTemplate?.description && (
              <p className="text-micro text-muted-foreground line-clamp-2">
                {nextStartableTemplate.description}
              </p>
            )}
          </div>
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
            style={{
              background: THEME.running,
              color: "white",
            }}
            aria-hidden="true"
          >
            <Play className="size-3" fill="white" />
            Start
          </div>
          {/* Run8 PR1c — overflow visible only on the four hero
              states locked by L12 (planned-today / catch-up /
              race-today / race-prep-week). Pre-PR1c the button
              rendered on every nextStartable card including
              tomorrow / future; that visibility is now driven by
              the single hero discriminator. */}
          {showHeroOverflow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptic();
                setManageDate(nextStartable.date ?? null);
              }}
              aria-label="More options for this run"
              className="shrink-0 size-9 -my-1 -mr-1 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 motion-safe:active:scale-95"
            >
              <MoreVertical className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {currentMode !== "freeform" && allRunsDone && (
        <div
          className="p-3 rounded-xl text-center text-xs flex items-center justify-center gap-1.5"
          style={{
            background: `${THEME.success}10`,
            border: `1px solid ${THEME.success}30`,
            color: THEME.success,
          }}
        >
          <Check className="size-3.5" />
          <span className="font-medium">All runs done this week</span>
        </div>
      )}

      {/* Run7 Q3 + Q8: compact 7-column week strip replaces the legacy
          7-row dropdown stack (~340pt saved). Tap any column → opens
          DayActionSheet for that date (canonical edit path per Pgm3).
          The inline template-swap dropdown was a duplicate of
          DayActionSheet's same picker. */}
      {currentMode !== "freeform" && runDays.length > 0 && (
        <RunWeekStrip
          runDays={runDays}
          claimMap={claimMap}
          unclaimedByDate={unclaimedByDate}
          onDayTap={(dateKey) => setManageDate(dateKey)}
        />
      )}

      {/* Run8 PR1a — footer link renamed "Change plan" → "Manage Run
          Plan ›". Points at /settings/training which now owns mode +
          race goal + run-days / lift-days / lift split + weekly
          layout (see TrainingSection). The section subtitle above
          targets the same destination — both are entry points to
          the consolidated programme-settings page. */}
      <div className="flex justify-end pt-2 border-t border-border/30">
        <button
          type="button"
          onClick={() => {
            haptic();
            navigate("/settings/training");
          }}
          className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
        >
          Manage Run Plan
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* PR-1: per-day action sheet. */}
      <DayActionSheet
        open={manageDate !== null}
        onClose={() => setManageDate(null)}
        dateKey={manageDate}
        profile={profile}
        programState={programState}
        claimMap={claimMap}
        unclaimedByDate={unclaimedByDate}
        overrideRunDay={overrideRunDay}
        markManualComplete={markManualComplete}
        skipRunDay={skipRunDay}
        skipWorkoutDay={skipWorkoutDay}
      />
    </section>
  );
}
