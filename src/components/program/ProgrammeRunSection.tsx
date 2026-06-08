/**
 * Programme Run tab — hybrid training cockpit.
 *
 * Navigation cleanup (2026-05-31): the Run tab is now driven by a single
 * date-pinned ProgrammeWeekSelector (shared with the Lift tab) that controls
 * a selected-day command card — Start run / Start race for a planned day
 * (+ secondary Start free run), or a calm date-led "No run scheduled" + Start
 * free run. This replaced the global "next planned run" SessionCommandCard
 * (which ignored the selected day) and the in-tab HybridWeekRail. The
 * RaceCockpitCard (race progress) renders BELOW the command card. Freeform
 * keeps its "Start a run" hero with no selector ("start whenever" — no
 * scheduled runs). Locked model (Run9a): freeform substrate + optional
 * race-goal overlay — no structured mode, no mode chips. The banner stack +
 * race-today / race-recent / recovery / fell-behind hero states stay as
 * top overlays, unchanged. Active plan editing deep-links to
 * /settings/training ("Edit run plan" footer). See ADR-0002 (dual scheduling
 * ontology), CLAUDE.md → "Training plan primitives", and
 * src/lib/runProgrammeViewModel.ts.
 *
 * Historical context (pre-cockpit) follows.
 *
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
import SectionLabel from "@/components/ui/SectionLabel";
import { useNavigate } from "react-router-dom";
import {
  Footprints,
  Check,
  Play,
  ChevronRight,
  MoreVertical,
  Trophy,
  X,
} from "lucide-react";
import { formatDistanceToNowStrict, format } from "date-fns";
import { toast } from "sonner";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import { paceLabel, durationLabel, distanceLabel } from "@/lib/runLabels";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { isRunDayComplete } from "@/lib/scheduledRunCompletion";
import { getRunHeroState } from "@/lib/runHeroState";
import { getFreeformCadence } from "@/lib/freeformCadence";
import { resolveRunContextualPrompt } from "@/lib/runContextualPrompt";
import { realignResultMessage } from "@/lib/realignCopy";
import type { RaceTiming } from "@/features/program/runScheduler";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useClaimMap } from "@/hooks/useClaimMap";
import { haptic } from "@/lib/haptic";
import DayActionSheet from "./DayActionSheet";
import RaceCockpitCard from "./RaceCockpitCard";
import SessionCommandCard from "./SessionCommandCard";
import ProgrammeWeekSelector from "./ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "./ProgrammeWeekSelector";
import {
  buildRaceCockpitViewModel,
  compactRunLabel,
} from "@/lib/runProgrammeViewModel";
import { resolveTrainingWindow } from "@/lib/trainingResolver";
import { Banner } from "@/components/ui/Banner";
import { IconButton } from "@/components/ui/IconButton";
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
  /** Run9 phase-3 (Slice DE) — re-anchor the race plan to today (keep the
   *  race date). Returns the timing so the in-tab Realign banner can toast the
   *  finish-safely / compressed / healthy copy. */
  realignRacePlan: () => Promise<{ timing: RaceTiming; totalWeeks: number }>;
  /** Clears `pendingFellBehindPrompt` without a plan change — used by the
   *  in-tab "My race moved →" path before routing to the date editor. */
  dismissFellBehindPrompt: () => Promise<void>;
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
  realignRacePlan,
  dismissFellBehindPrompt,
}: ProgrammeRunSectionProps) {
  const navigate = useNavigate();
  // PR-1: which row is opening DayActionSheet.
  const [manageDate, setManageDate] = useState<string | null>(null);
  // The run-week selector's selected calendar day (date-pinned — ADR-0002).
  // Defaults to today; today is always index 0 of the rolling 7-day window
  // below, so the default selection is always visible. Drives the selected-
  // day command card so the selector actually controls the content beneath it.
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() =>
    localDateString(new Date())
  );
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

  // Run9 (l): race-recent ("did you race?") dismissal. When the user taps
  // "I didn't race", hide the prompt for the rest of the T+1..T+3 window
  // (keyed by the race date so a new race resets it) and let the server's
  // dailyRaceReconciliationSweep flip race_no_show at T+3 — the client NEVER
  // writes that status (PR-L: race-day transitions are server-owned; the hook
  // is a pure reader). Same once-only localStorage pattern as
  // raceElapsedDismissed; safe because race-recent only fires 1–3 days after a
  // past race, by which point a newly-set future race has remounted the page.
  const raceRecentDismissKey = `tropos.dismiss.raceRecent.${raceGoal?.targetDate ?? "none"}`;
  const [raceRecentDismissed, setRaceRecentDismissed] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      try {
        return window.localStorage.getItem(raceRecentDismissKey) === "1";
      } catch {
        return false;
      }
    }
  );
  function dismissRaceRecent() {
    setRaceRecentDismissed(true);
    try {
      window.localStorage.setItem(raceRecentDismissKey, "1");
    } catch {
      // localStorage unavailable / quota — swallow; the in-memory state still
      // hides the prompt for this session.
    }
    toast("No worries — we'll wrap up your plan.");
  }

  // #975: one-time "Set a race goal" nudge for freeform runners — the skip
  // path from onboarding (race_prep with no date now lands on the freeform
  // substrate, Run9a) and anyone else on freeform who hasn't set a goal.
  // Routes to the Race Goal Planner on /settings/training (where runway
  // feedback lives — the bare onboarding date field gave none). Dismissible
  // via the same localStorage pattern as raceRecent; and it disappears
  // naturally once a goal IS set, because the mode flips to race_prep and
  // this whole freeform block stops rendering ("dismisses after use").
  const SET_RACE_GOAL_DISMISS_KEY = "tropos.dismiss.setRaceGoal";
  const [setRaceGoalDismissed, setSetRaceGoalDismissed] = useState<boolean>(
    () => {
      if (typeof window === "undefined") return false;
      try {
        return window.localStorage.getItem(SET_RACE_GOAL_DISMISS_KEY) === "1";
      } catch {
        return false;
      }
    }
  );
  function dismissSetRaceGoal() {
    setSetRaceGoalDismissed(true);
    try {
      window.localStorage.setItem(SET_RACE_GOAL_DISMISS_KEY, "1");
    } catch {
      // localStorage unavailable / quota — swallow; in-memory state still
      // hides it for this session.
    }
  }

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
  // Run9 (k)/(f): the ONE-AT-A-TIME actionable prompt slot. The resolver
  // picks a single prompt by locked precedence (no-show > recovery-complete >
  // fell-behind) so two of these can never stack. Persistent attributes
  // (compressed / taper / week N-of-M) are deliberately NOT routed here — they
  // stay as their own always-visible notes (and migrate to a RaceHeader in a
  // later slice). Run9 phase-3 (Slice DE): fell-behind now feeds the real
  // server flag — the in-tab Realign action lands below so the prompt is
  // actionable.
  const pendingFellBehind = !!programState?.pendingFellBehindPrompt;
  const contextualPrompt =
    currentMode === "race_prep" && raceGoal
      ? resolveRunContextualPrompt({
          isNoShow,
          recoveryEnded,
          pendingFellBehind,
        })
      : null;
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

  // `nextStartable` is still derived above — it feeds the hero state machine
  // and the "all runs done" affirmation. The old "next planned run" command
  // card (which promoted nextStartable regardless of the selected day) was
  // replaced by the date-driven selected-day card; per the locked UX the card
  // must reflect the SELECTED date, never a global next-run.
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

  // ── Cockpit view models (pure derivations in runProgrammeViewModel) ──
  // Race cockpit identity card data (null when no race goal — the card
  // simply doesn't render). todayKey is passed in so the helper stays
  // deterministic and unit-testable.
  const raceCockpitVM = useMemo(
    () =>
      buildRaceCockpitViewModel({
        raceGoal,
        currentWeek: programState?.runPlan?.currentWeek,
        totalWeeks: programState?.runPlan?.totalWeeks,
        compressed: raceCompressed,
        todayKey: todayKeyDerivation,
      }),
    [
      raceGoal,
      programState?.runPlan?.currentWeek,
      programState?.runPlan?.totalWeeks,
      raceCompressed,
      todayKeyDerivation,
    ]
  );

  // ── Run-week selector (date-pinned, ADR-0002) ──────────────────────
  // A rolling 7-day window anchored on today, resolved through the same
  // shared resolver Home/WeekStrip/DayActionSheet use. Run-scope only — no
  // lift lanes (the Lift tab owns lifting). The selector drives
  // `selectedDateKey`; the selected-day command card below reads from it.
  const runWindow = useMemo(
    () =>
      resolveTrainingWindow({
        startDate: new Date(),
        days: 7,
        profile,
        programState,
        claimMap,
      }),
    [profile, programState, claimMap]
  );
  const runSelectorCells: ProgrammeWeekSelectorCell[] = useMemo(
    () =>
      runWindow.map((d) => {
        const run = d.run;
        const hasRun = !!run.runDay;
        const status: ProgrammeWeekSelectorCell["status"] = !hasRun
          ? "rest"
          : run.isCompleted
            ? "completed"
            : run.status === "skipped"
              ? "skipped"
              : "upcoming";
        const date = parseLocalDate(d.dateKey);
        return {
          key: d.dateKey,
          topLabel: format(date, "EEE").charAt(0),
          center: String(date.getDate()),
          bottomLabel: hasRun ? compactRunLabel(run.template) : "",
          status,
          isToday: d.dateKey === todayKeyDerivation,
        };
      }),
    [runWindow, todayKeyDerivation]
  );

  // The SELECTED day for the command card — taken straight from the already-
  // resolved 7-day window (the selector only ever selects a day in it; the
  // default is today = window[0]). Avoids a second resolver pass over the same
  // window. `startUrl` already carries ?template=&scheduledRunId= when
  // startable. Falls back to today if a stale key isn't in the window.
  const selectedDay =
    runWindow.find((d) => d.dateKey === selectedDateKey) ?? runWindow[0];
  const selectedRun = selectedDay.run;
  const selectedTemplate = selectedRun.template;
  const selectedIsRace = selectedTemplate?.type === "race";
  const selectedDateLabel = format(
    parseLocalDate(selectedDateKey),
    "EEE d MMM"
  );
  // Meta line for the selected run (distance/duration + type).
  const selectedRunMeta: string[] = (() => {
    if (!selectedTemplate) return [];
    const meta: string[] = [];
    if (selectedTemplate.config.targetDistance) {
      meta.push(`${selectedTemplate.config.targetDistance}km`);
    } else if (selectedTemplate.estimatedDuration) {
      meta.push(`${selectedTemplate.estimatedDuration} min`);
    }
    meta.push(
      selectedTemplate.type.charAt(0).toUpperCase() +
        selectedTemplate.type.slice(1)
    );
    return meta;
  })();
  // Free-run fallback URL (Run.tsx parses ?type=freerun on mount).
  const FREE_RUN_URL = "/run?type=freerun";
  // Suppress the selected-day card when a race state-overlay hero already
  // owns today's slot AND today is what's selected — avoids a double CTA.
  const heroOwnsSelectedToday =
    selectedDateKey === todayKeyDerivation &&
    (heroState === "race-today" || heroState === "race-recent");

  // Selected-day card eyebrow — temporal status relative to the SELECTED
  // date (Today / Tomorrow / Pending for a past-but-startable slot / weekday).
  // The card always leads with the calendar date too (selectedDateLabel), so
  // the user never loses their place after tapping around the selector.
  const selectedEyebrow = (() => {
    const tomorrowKey = localDateString(addLocalDays(new Date(), 1));
    if (selectedDateKey === todayKeyDerivation) return "Due today";
    if (selectedDateKey === tomorrowKey) return "Tomorrow";
    if (selectedDateKey < todayKeyDerivation) return "Pending";
    return "Up next";
  })();

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
    () =>
      getFreeformCadence(
        runs.map((r) => r.completedAt),
        new Date()
      ),
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

  // Run9 phase-3 (Slice DE): in-tab Realign. Re-anchors the race plan to today
  // (keeping the race date) and toasts the timing result — compressed, or the
  // honest finish-safely line below the taper floor.
  async function handleRealign(): Promise<void> {
    try {
      const { timing, totalWeeks } = await realignRacePlan();
      if (raceGoal) {
        toast.success(
          realignResultMessage({
            timing,
            distance: raceGoal.distance as "5k" | "10k" | "half" | "marathon",
            totalWeeks,
          })
        );
      }
    } catch (e) {
      logger.error("[handleRealign] failed", e);
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
        heroState !== "race-recent" &&
        heroState !== "race-today" &&
        !inRecovery &&
        !recoveryEnded &&
        !isNoShow &&
        !raceElapsedDismissed && (
          <Banner
            variant="warning"
            title="Race day has passed"
            description={
              <>
                {raceGoal.distance.toUpperCase()} on {raceGoal.targetDate}. Set
                a new race goal or switch modes in Manage Run Plan.
              </>
            }
            onDismiss={dismissRaceElapsedBanner}
            dismissLabel="Dismiss race elapsed banner"
          />
        )}

      {/* Run9 (k): the compressed-plan note moved OFF the banner stack into
          the persistent RaceHeader below (a calm note, not an amber banner),
          so it never competes with the actionable contextual-prompt slot. */}

      {/* Warning: race-day no-show. Hosts critical actions (Log race
          now / Set next race / Switch to structured) so the banner
          itself is the affordance — not dismissible. Run9: gated by the
          single contextual-prompt slot (precedence over recovery-complete). */}
      {contextualPrompt === "no-show" && raceGoal && (
        <Banner
          variant="warning"
          title={`${raceGoal.distance.toUpperCase()} — ${raceGoal.targetDate}`}
          description="We marked this as no-show after 3 days with no log. Log it now if you ran it."
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
                className="w-full min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg text-xs font-bold text-white bg-running"
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
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Set next race
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    navigate("/settings/training");
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
                >
                  Manage plan
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
              className="w-full min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Configure plan
            </button>
          }
        />
      )}

      {/* Info: recovery complete. Hosts critical "Set next race" /
          "Switch to structured" prompts — non-dismissible. Run9: gated by
          the single contextual-prompt slot (yields to no-show). */}
      {contextualPrompt === "recovery-complete" && (
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
                className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
              >
                Set next race
              </button>
              <button
                type="button"
                onClick={handleSkipRecoveryEarly}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
              >
                Switch to structured
              </button>
            </div>
          }
        />
      )}

      {/* Info: fell-behind (Run9 phase-3 Slice DE). Server flag set after a
          week under 50% of target. One calm prompt + one-tap Realign (keep the
          race date, re-plan from today) + a "my race moved" route to the date
          editor. Gated by the single contextual-prompt slot (yields to no-show
          + recovery-complete). */}
      {contextualPrompt === "fell-behind" && raceGoal && (
        <Banner
          variant="info"
          title="Last week didn't go to plan"
          description="Realign keeps your race date and re-plans the remaining weeks from today."
          action={
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleRealign}
                className="w-full min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg text-xs font-bold text-white bg-running"
              >
                Realign my plan
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic();
                  void dismissFellBehindPrompt();
                  navigate("/settings/training");
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
              >
                My race moved →
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
              className="inline-flex items-center gap-0.5 text-xs font-semibold motion-safe:active:scale-95 text-running"
            >
              Skip recovery early &rsaquo;
            </button>
          }
        />
      )}

      {/* The visible "Run training" coral section label (Run7 Q6) was removed
          to align the Run tab's vertical rhythm with the Lift tab: the Lift tab
          has no "Lift training" header above its content, so this label pushed
          the Run content ~one row out of step and made the page jump when
          toggling tabs. The active "Run" segment already names the section, and
          the `aria-label="Run training"` on the <section> above still provides
          the screen-reader landmark name — so no sr-only heading is needed here
          (an sr-only h2 as the first child of this `space-y-4` flow would also
          re-introduce a 16px top margin on the first visible row). */}

      {/* Run8 PR1a's section subtitle (mode + week-of-N + days-to-race, tap →
          /settings/training) was REMOVED here. It was fully redundant: the
          tab-aware page header (`programRunHeaderLine` in Program.tsx) now
          carries the same mode + week context ("Race prep · Marathon · Week
          2/20" / "Structured · N runs/week"), and the RaceCockpitCard below
          shows days-to-race. Worse, as a row directly above the day-selector it
          forced the Run selector's day circles ~33px lower than the Lift tab's
          (the selector also has a weekday-letter row the Lift one lacks), so
          the stepper visibly jumped when toggling tabs. The manage affordance
          is preserved by the "Edit run plan ›" footer link and the overflow
          menu. */}

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
            className="w-full rounded-xl p-4 text-left flex items-center gap-3 bg-running/6 border border-running/19"
          >
            <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
              <Footprints className="size-5 text-running" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5 text-running">
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
              {/* Stat lines: prose labels (Last run / This week / run / avg)
                  use the body font; only the numeric segments are mono +
                  tabular-nums, per the typography rule. */}
              <div className="space-y-1">
                {lastRun && (
                  <p className="text-muted-foreground">
                    <span className="text-foreground">Last run</span>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {distanceLabel(lastRun.distance)}
                    </span>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {durationLabel(lastRun.duration)}
                    </span>
                    {lastRun.avgPace > 0 && (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">
                          {paceLabel(lastRun.avgPace)}
                        </span>
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
                    <span className="font-mono tabular-nums">
                      {thisWeek.totalDistance.toFixed(1)}
                    </span>{" "}
                    km
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {thisWeek.runCount}
                    </span>{" "}
                    run{thisWeek.runCount === 1 ? "" : "s"}
                    {thisWeek.avgPace > 0 && (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">
                          {paceLabel(thisWeek.avgPace)}
                        </span>{" "}
                        avg
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* #975: one-time "Set a race goal" entry. Routes to the Race Goal
              Planner (/settings/training). Dismissible; once a goal is set the
              mode flips to race_prep and this freeform block stops rendering. */}
          {!setRaceGoalDismissed && (
            <div className="w-full rounded-xl p-4 flex items-center gap-3 bg-running/4 border border-running/15">
              <button
                type="button"
                onClick={() => {
                  haptic();
                  navigate("/settings/training");
                }}
                className="flex-1 flex items-center gap-3 text-left min-w-0"
                style={{ minHeight: 44 }}
              >
                <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
                  <Trophy className="size-5 text-running" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold mb-0.5 text-running">
                    Set a race goal
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    Training for a race?
                  </p>
                  <p className="text-micro text-muted-foreground">
                    Pick a distance and date — we'll build the plan.
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic();
                  dismissSetRaceGoal();
                }}
                aria-label="Dismiss set a race goal"
                className="size-11 -my-2 -mr-2 flex items-center justify-center shrink-0 text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Run8 PR1a — the "Race prep not set up yet → Set race goal"
          inline form lives on /settings/training now. The section
          subtitle above ("Race Prep · Set your race goal") deeplinks
          users there when their race_prep mode is missing a goal. */}

      {/* RaceCockpitCard (race progress identity) moved BELOW the selector +
          selected-day command card — see the "race progress" block further
          down. The actionable race-day / race-recent heroes stay on top. */}

      {/* ── Hero: race-today (T+0 — the race itself) ────────────────
          Run8 PR1c L14 + Run9 follow-on: race day is the culmination of the
          whole plan, not "just another Next run", so it gets its own
          celebratory hero instead of falling through to the generic Next card
          (which is suppressed for this state below). A Trophy eyebrow + "Start
          race" CTA (logs against the race-day slot — onRunCreated writes the
          recovery entry server-side, exactly as the no-show / race-recent
          paths do) + an overflow that opens DayActionSheet's race-day variant
          for the DNF / DNS edge cases. */}
      {heroState === "race-today" && raceGoal && (
        <div className="w-full rounded-xl p-4 space-y-3 bg-running/8 border border-running/25">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
              <Trophy className="size-5 text-running" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5 text-running">
                Race day
              </p>
              <p className="text-sm font-bold text-foreground">
                {raceGoal.distance.toUpperCase()} · Today
              </p>
              <p className="text-micro text-muted-foreground">
                This is the one you've been training for. Good luck out there.
              </p>
            </div>
            {/* Overflow → race-day DayActionSheet variant (DNF / DNS, PR1d). */}
            <IconButton
              onClick={() => {
                haptic();
                setManageDate(raceDayRunDay?.date ?? null);
              }}
              aria-label="More options for race day"
              icon={<MoreVertical aria-hidden="true" />}
              className="shrink-0 -mr-1"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate(
                raceDayRunDay?.id
                  ? `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                  : "/run"
              );
            }}
            className="w-full min-h-[44px] py-2.5 rounded-lg text-sm font-bold text-white inline-flex items-center justify-center gap-1.5 bg-running"
          >
            <Play className="size-3.5" fill="white" />
            Start race
          </button>
        </div>
      )}

      {/* ── Hero: race-recent ("did you race?") ─────────────────────
          Run9 (l): T+1..T+3 after the race date, before the server's
          dailyRaceReconciliationSweep flips the slot to race_no_show.
          A finisher who hasn't logged yet must NOT be nagged with a
          "catch-up" Start card on the elapsed race slot — so this calm
          prompt OCCUPIES the operational slot (the Next card below is
          suppressed for this state) and offers the two honest answers:
            • Log it → log the race against the race-day slot; onRunCreated
              writes the recovery entry server-side and the recovery hero
              takes over.
            • I didn't race → dismiss for the rest of the window; the
              server owns the race_no_show flip at T+3 (PR-L — the client
              never writes that status). */}
      {heroState === "race-recent" && raceGoal && !raceRecentDismissed && (
        <div className="w-full rounded-xl p-4 space-y-3 bg-running/6 border border-running/19">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg flex items-center justify-center shrink-0 bg-running/10">
              <Footprints className="size-5 text-running" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5 text-running">
                Did you race?
              </p>
              <p className="text-sm font-bold text-foreground">
                {raceGoal.distance.toUpperCase()}
                {" · "}
                {formatDistanceToNowStrict(
                  parseLocalDate(raceGoal.targetDate),
                  {
                    addSuffix: true,
                  }
                )}
              </p>
              <p className="text-micro text-muted-foreground">
                Log it to start your recovery week, or let us know if you sat
                this one out.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                haptic();
                navigate(
                  raceDayRunDay?.id
                    ? `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                    : "/run"
                );
              }}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg text-xs font-bold text-white bg-running"
            >
              Log it
            </button>
            <button
              type="button"
              onClick={() => {
                haptic();
                dismissRaceRecent();
              }}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center py-2 rounded-lg bg-muted text-foreground text-xs font-medium"
            >
              I didn't race
            </button>
          </div>
        </div>
      )}

      {/* ── Run-week selector + selected-day command card ───────────────
          The single Run day-navigator (date-pinned, ADR-0002), sharing the
          Lift tab's visual language and vertical position. It DRIVES the
          card below: tap a day → that day's command card. Non-freeform only —
          freeform has no scheduled runs ("start whenever"); its hero above
          owns the Start CTA. */}
      {currentMode !== "freeform" && (
        <div className="space-y-3">
          <ProgrammeWeekSelector
            sport="run"
            ariaLabel="Run week"
            cells={runSelectorCells}
            selectedKey={selectedDateKey}
            onSelect={setSelectedDateKey}
          />

          {/* The selected-day command card. Suppressed only when a race
              state-overlay hero (race-today / race-recent) already owns
              today's slot AND today is selected — the selector still lets
              the user browse other days. */}
          {!heroOwnsSelectedToday &&
            (selectedRun.isStartable ? (
              <div className="space-y-2">
                <SessionCommandCard
                  sport="run"
                  eyebrow={`${selectedEyebrow} · ${selectedDateLabel}`}
                  title={selectedTemplate?.name ?? "Run"}
                  description={selectedTemplate?.description}
                  meta={selectedRunMeta}
                  primaryActionLabel={
                    selectedIsRace ? "Start race" : "Start run"
                  }
                  onPrimaryAction={() => {
                    haptic();
                    // startUrl carries ?template=&scheduledRunId= so the run
                    // fulfils this exact planned slot (claim-map binding).
                    navigate(selectedRun.startUrl ?? FREE_RUN_URL);
                  }}
                  onManage={() => {
                    haptic();
                    setManageDate(selectedDateKey);
                  }}
                />
                {/* Secondary: an ad-hoc run that does NOT fulfil the plan slot. */}
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    navigate(FREE_RUN_URL);
                  }}
                  className="w-full min-h-[44px] text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.99]"
                >
                  Start free run instead
                </button>
              </div>
            ) : (
              // No startable run on the selected day: completed, skipped, or
              // nothing scheduled. Calm, date-led, always offers a free run.
              <div className="rounded-2xl border p-4 card-shadow bg-running/4 border-running/14">
                <SectionLabel tier="section">{selectedDateLabel}</SectionLabel>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {selectedRun.isCompleted
                    ? `${selectedTemplate?.name ?? "Run"} — done`
                    : selectedRun.status === "skipped"
                      ? `${selectedTemplate?.name ?? "Run"} — skipped`
                      : "No run scheduled"}
                </p>
                <p className="text-micro text-muted-foreground mt-0.5">
                  {selectedRun.isCompleted
                    ? "Nice work — add another if you want."
                    : selectedRun.status === "skipped"
                      ? "Marked as skipped — you can still head out."
                      : "Rest day. Head out whenever you like."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    navigate(FREE_RUN_URL);
                  }}
                  className="mt-3 w-full min-h-[44px] py-2.5 rounded-lg text-sm font-bold text-white inline-flex items-center justify-center gap-1.5 bg-running"
                >
                  <Play className="size-3.5" fill="white" />
                  Start free run
                </button>
              </div>
            ))}

          {/* Race progress identity card — moved BELOW the selected-day card
              (cockpit reorder). Race-prep only; the actionable race-day /
              race-recent heroes stay on top. */}
          {currentMode === "race_prep" &&
            raceGoal &&
            !raceElapsed &&
            raceCockpitVM && (
              <RaceCockpitCard
                distanceLabel={raceCockpitVM.distanceLabel}
                targetDate={raceCockpitVM.targetDate}
                daysToRace={raceCockpitVM.daysToRace}
                currentWeek={raceCockpitVM.currentWeek}
                totalWeeks={raceCockpitVM.totalWeeks}
                phaseLabel={raceCockpitVM.phaseLabel}
                inTaper={raceCockpitVM.inTaper}
                compressed={raceCockpitVM.compressed}
                onEdit={() => {
                  haptic();
                  navigate("/settings/training");
                }}
              />
            )}

          {allRunsDone && (
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
        </div>
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
          Edit run plan
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {/* PR-1: per-day action sheet. scope="run" — the Run tab is sport-
          partitioned by the Lift|Run control, so this manager shows only the
          run block. The full whole-day (run + lift) view lives on Home, where
          there's no sport partition. */}
      <DayActionSheet
        open={manageDate !== null}
        onClose={() => setManageDate(null)}
        dateKey={manageDate}
        scope="run"
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
