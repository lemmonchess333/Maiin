import NonRaceGoalProgress from "@/components/run/NonRaceGoalProgress";
import {
  isRunCoachingEligible,
  runEvidenceDate,
} from "@/lib/runExecutionEvidence";
import { useLocalDateKey } from "@/hooks/useLocalDateKey";
import {
  isRunningBaseline,
  runningBaselineNeedsReview,
} from "@/features/program/runningBaseline";
import RunPlanPurpose from "@/components/run/RunPlanPurpose";
/**
 * Programme Run tab — hybrid training cockpit.
 *
 * Navigation cleanup (2026-05-31): the Run tab is now driven by a single
 * date-pinned ProgrammeWeekSelector (shared with the Lift tab) that controls
 * a selected-day command card: Start run for today's planned run, View run
 * for another day's (+ secondary Start free run), or "Rest day" / "Lift
 * day" + Start free run, all on the same SessionCommandCard. This replaced the global "next planned run" SessionCommandCard
 * (which ignored the selected day) and the in-tab HybridWeekRail. The
 * RaceCockpitCard (race progress) renders BELOW the command card. Freeform
 * keeps its "Start a run" hero with no selector ("start whenever" — no
 * scheduled runs). Locked model (Run9a): freeform substrate + optional
 * race-goal overlay — no structured mode, no mode chips. The banner stack +
 * race-today / race-recent / recovery / fell-behind hero states stay as
 * top overlays, unchanged. Active plan editing deep-links to
 * /settings/run-plan (the focused run-plan editor; originally
 * /settings/training per Run8 PR1a, superseded by the Set1.2 nested
 * Settings IA). See ADR-0002 (dual scheduling
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
 * content. The footer "Change plan ›" link deep-links to the focused
 * run-plan editor at /settings/run-plan (Pgm4 → Set1.2).
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
 *   - Footer "Change plan ›" deep-links to /settings/run-plan
 *     (the focused run-plan editor).
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import SectionLabel from "@/components/ui/SectionLabel";
import StatFigure from "@/components/ui/StatFigure";
import { Card } from "@/components/ui/Card";
import { runPoseFor, runPoseUrl } from "@/lib/runPoses";
import RunFormSheet from "@/components/run/RunFormSheet";
import { readString, writeString } from "@/lib/localStore";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Footprints,
  Check,
  Play,
  ChevronRight,
  MoreVertical,
  Trophy,
  X,
} from "lucide-react";
import {
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  format,
} from "date-fns";
import { toast } from "@/lib/toast";
import { THEME } from "@/lib/theme";
import { logger } from "@/lib/logger";
import {
  paceLabel,
  paceMinSec,
  durationLabel,
  distanceLabel,
  sessionPaceDisplay,
  storedKmLabel,
} from "@/lib/runLabels";
import { distanceUnitLabel, paceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import {
  getScheduledRunStatus,
  isScheduledRunStartable,
} from "@/lib/scheduledRunStatus";
import { isRunDayComplete } from "@/lib/scheduledRunCompletion";
import { resolveRunPlan } from "@/lib/runPlanResolver";
import { getRunHeroState } from "@/lib/runHeroState";
import { getFreeformCadence } from "@/lib/freeformCadence";
import { resolveRunContextualPrompt } from "@/lib/runContextualPrompt";
import { realignResultMessage } from "@/lib/realignCopy";
import type {
  ProgramOutcome,
  RealignOutcome,
} from "@/features/program/programOutcome";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useClaimMapForProgram } from "@/hooks/useClaimMapForProgram";
import { haptic } from "@/lib/haptic";
import { resolveDayPagerDelta } from "@/lib/dayPagerSwipe";
import {
  planningEasyPaceSPerKm,
  prescriptivePaceTableFromFitness,
  resolveSessionPaces,
  raceDistanceKeyFromKm,
} from "@/lib/runPaces";
import { runDoseLine } from "@/lib/runDose";
import { targetZoneForRun, maxHrFromAge, zoneShortLabel } from "@/lib/hrZones";
import DayActionSheet from "./DayActionSheet";
import AdjustWeekSheet from "./AdjustWeekSheet";
import EaseWeekNudgeCard from "./EaseWeekNudgeCard";
import {
  evaluateEaseWeekNudge,
  evaluatePostEaseBounce,
} from "@/lib/easeWeekNudge";
import {
  getLastShownAt,
  setLastShownAt,
  getDismissedWeekKey,
  setDismissedWeekKey,
  getEasedWeekKey,
} from "@/lib/easeWeekNudgeMarkers";
import { planEasierWeek } from "@/lib/adjustWeek";
import { profileNewRunnerUntil } from "@/features/program/newRunner";
import { track as trackProgram } from "@/lib/programAnalytics";
import RaceCockpitCard from "./RaceCockpitCard";
import RaceDayPlanCard from "./RaceDayPlanCard";
import RaceWeeksAhead from "./RaceWeeksAhead";
import type { LayoffClass } from "@/features/program/layoffDetection";
import type { RaceDistance } from "@/lib/raceDayPlan";
import {
  runSessionPresentation,
  weekHoldsQuality,
} from "@/lib/runSessionExplainer";
import { runSessionAbout, runSessionName } from "@/lib/runSessionAbout";
import { racePaceWorkFor } from "@/lib/racePace";
import { isRunWalkTemplateId } from "@/lib/workoutTemplates";
import SessionCommandCard from "./SessionCommandCard";
import ProgrammeWeekSelector from "./ProgrammeWeekSelector";
import type { ProgrammeWeekSelectorCell } from "./ProgrammeWeekSelector";
import {
  buildRaceCockpitViewModel,
  defaultRunDayKey,
  runCardStatus,
  runStripLabel,
} from "@/lib/runProgrammeViewModel";
import { withStartOnArrival } from "@/features/run/startOnArrival";
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
import { useUidForStorageKey } from "@/lib/auth";
import {
  goalDayName,
  goalDayQuestion,
  raceGoalEntry,
} from "@/lib/raceGoalEntry";
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
  /** Async and outcome-reporting — see AdjustWeekSheet's note on why the
   *  old `=> void` shape is what let a missing await through. */
  overrideRunDay: (
    idOrDayIndex: string | number,
    templateId: string
  ) => Promise<boolean>;
  /** RUN-EASE-01: the whole easier week as one command (resolves to the
   *  number of runs the server actually changed), and its undo. */
  applyEaseWeek: (
    swaps: ReadonlyArray<{ key: string | number; toTemplateId: string }>
  ) => Promise<number | null>;
  revertEaseWeek: () => Promise<{ ok: boolean; message?: string }>;
  /** PR-J Q2 chunk B2: replaces completeRunDay. Writes the
   *  manualCompletions map; derivation surfaces ✅. */
  markManualComplete: (runDayId: string) => Promise<ProgramOutcome>;
  skipRunDay: (idOrDayIndex: string | number) => Promise<ProgramOutcome>;
  skipWorkoutDay: (dayIndex: number) => Promise<ProgramOutcome>;
  restoreRunDay: (idOrDayIndex: string | number) => Promise<ProgramOutcome>;
  restoreWorkoutDay: (dayIndex: number) => Promise<ProgramOutcome>;
  moveRunDay: (
    idOrDayIndex: string | number,
    targetDayIndex: number
  ) => Promise<ProgramOutcome>;
  /** PR-C + Run9 ENG(j): atomic writer to exit the recovery phase
   *  early. Resolves the exit via `resolveRecoveryExit` — the race is
   *  done, so the user returns to FREEFORM (plan + raceGoal cleared),
   *  UNLESS a newer future race was set during the recovery window,
   *  in which case race_prep is preserved and only the recovery phase
   *  clears. Called from the in-recovery "Skip recovery early" action
   *  and the recovery-complete banner's "Back to freeform" action. */
  skipRecoveryEarly: () => Promise<ProgramOutcome>;
  /** Run9 phase-3 (Slice DE) — re-anchor the race plan to today (keep the
   *  race date). When it lands, the timing, so the in-tab Realign banner can
   *  toast the finish-safely / compressed / healthy copy; a refusal is
   *  said by the writer. */
  realignRacePlan: () => Promise<RealignOutcome>;
  /** Clears `pendingFellBehindPrompt` without a plan change — used by the
   *  in-tab "My race moved →" path before routing to the date editor. */
  dismissFellBehindPrompt: () => Promise<ProgramOutcome>;
  /** Today's layoff reading (`useProgram`'s): the race plan's weeks ahead
   *  are built with it, as the rollover builds next week (R23). Required,
   *  as on every regen site: left out, a returning runner's outline would
   *  show the quality sessions their plan holds back. */
  recentLayoff: LayoffClass;
}

/** Two actions in a wrapping row: side by side while both labels fit on
 *  one line, each the row's width once they do not (a small phone, or
 *  larger text), rather than a label broken over two lines in a pill. */
const ACTION_PAIR = "flex-auto";

export default function ProgrammeRunSection({
  profile,
  programState,
  runsTarget,
  overrideRunDay,
  applyEaseWeek,
  revertEaseWeek,
  markManualComplete,
  skipRunDay,
  skipWorkoutDay,
  restoreRunDay,
  restoreWorkoutDay,
  moveRunDay,
  skipRecoveryEarly,
  realignRacePlan,
  dismissFellBehindPrompt,
  recentLayoff,
}: ProgrammeRunSectionProps) {
  const navigate = useNavigate();
  const todayKeyDerivation = useLocalDateKey();
  // PR-1: which row is opening DayActionSheet.
  const [manageDate, setManageDate] = useState<string | null>(null);
  // The day the person picked on the run-week selector (date-pinned,
  // ADR-0002), or null until they pick one; the tab then opens on
  // `defaultRunDayKey` (today's run, else the week's next one). It drives
  // the selected-day command card so the selector controls the content
  // beneath it. Mirror the selected run day into the URL (?rday=YYYY-MM-DD),
  // the sibling of the Lift day selector's ?day, so opening a run/plan
  // detail and pressing back restores the day instead of snapping to today.
  // An out-of-window value degrades gracefully (the runWindow lookup below
  // falls back to today).
  const [searchParams, setSearchParams] = useSearchParams();
  const [chosenDateKey, setChosenDateKey] = useState<string | null>(() => {
    const raw = searchParams.get("rday");
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  });
  const selectRunDay = useCallback(
    (key: string) => {
      setChosenDateKey(key);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("rday", key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  // PR-4: recent-run context for the freeform hero. 30-day window
  // is bounded by the hook's `where('completedAt', '>=', ...)`
  // clause; returns a `loading` flag the hero shell consumes for
  // non-blocking paint.
  // localStorage is per-DEVICE; every dismissal below records a decision by
  // one ACCOUNT, so each key carries the uid. Unscoped, the constant
  // "set a race goal" key meant the second account on a shared phone never
  // saw that prompt at all.
  const storageUid = useUidForStorageKey();
  const unit = useDistanceUnit();
  const {
    runs,
    weeklyData,
    loading: runsLoading,
    failed: runsFailed,
    evidenceReady: runsEvidenceReady,
  } = useRunningStats(30);
  // PR-J Q3 chunk B3b — single source of truth for derived
  // completion. Subscribes to users/{uid}/runs + reads
  // programState.manualCompletions; forwarded to RunWeekStrip so
  // the strip's ✅ tracks manual/saved-run/legacy completions.
  // Q5 chunk B3e — also forwards unclaimedByDate for the extras
  // pills (saved runs that don't claim any planned slot). Read from the
  // plan Train already holds: the old wrapper called useProgram() again,
  // which started a second engine, empty, beside Train's.
  const { claimMap, unclaimedByDate } = useClaimMapForProgram(programState);

  // Run8 PR1a — mode pills + race-goal form removed from this
  // surface. Mode + race goal now live on `/settings/run-plan`
  // (the focused RunPlanSettings editor). The Programme page no longer
  // owns those writers; tap the section subtitle or the "Manage
  // Run Plan ›" footer link to navigate.

  // Run7 Q10 — per-week dismissibility for action-prompting banners.
  // raceElapsed is the only banner that's both action-prompting AND
  // dismissible per the spec (state-derived recovery + compressed
  // stay visible; isNoShow + recoveryEnded host critical actions and
  // shouldn't be dismissed either). Dismissal is keyed by this week's
  // localWeekKey so each Monday rollover the banner re-surfaces if
  // the race is still elapsed.
  const thisWeekKeyForDismissal = localWeekKey(
    parseLocalDate(todayKeyDerivation)
  );
  const raceElapsedDismissKey = `${storageUid}:tropos.dismiss.raceElapsed.${thisWeekKeyForDismissal}`;
  // Run13 (RUN-02): the proactive Adjust-this-week sheet.
  const [adjustOpen, setAdjustOpen] = useState(false);
  // The running form guide, opened from the runner on the run cards.
  const [runFormOpen, setRunFormOpen] = useState(false);
  const openRunForm = () => {
    haptic();
    setRunFormOpen(true);
  };
  // Run14: when the sheet is opened from the ease-week nudge it lands
  // straight on the easier preview; the normal "Adjust this week" entry
  // clears this so it still opens on the intent chooser.
  const [adjustInitialIntent, setAdjustInitialIntent] = useState<
    "easier" | undefined
  >(undefined);
  // Run14: the ease-week nudge, dismissed for the rest of this week.
  const [easeNudgeDismissed, setEaseNudgeDismissed] = useState<string | null>(
    null
  );
  const [raceElapsedDismissed, setRaceElapsedDismissed] = useState<boolean>(
    () => readString(raceElapsedDismissKey) === "1"
  );
  function dismissRaceElapsedBanner() {
    setRaceElapsedDismissed(true);
    // Storage unavailable / quota — the in-memory state still hides the
    // banner for this session.
    writeString(raceElapsedDismissKey, "1");
  }

  const currentMode = profile.runMode ?? "freeform";
  /* R4 — read the run plan through the resolver, not the mirror.
   *
   * `profile.raceGoal` is canonical; `programState.runPlan.raceGoal` is a
   * mirror written by a later regeneration. Reading the mirror alone meant
   * that between the two writes — profile saved, regen not yet run — a
   * race-prep user's entire race surface vanished. `resolveRunPlan`
   * reconciles them (profile wins, mirror backfills) and owns the single
   * definition of the recovery window, which was hand-derived here. */
  const resolvedRunPlan = useMemo(
    () => resolveRunPlan(profile, programState, todayKeyDerivation),
    [profile, programState, todayKeyDerivation]
  );
  const raceGoal = resolvedRunPlan.raceGoal ?? undefined;
  // Run9 STATUS 2026-11-01: a goal run on your own names its day for the
  // distance ("Your 10K") rather than "Race day".
  const ownGoal = raceGoalEntry(raceGoal) === "own";
  const goalDay = goalDayName(raceGoal);
  const raceCompressed = !!programState?.runPlan?.compressed;
  /* `belowFloor` is persisted on runPlan (programTypes.ts). This read was
     added to carry it to the cockpit — but the JSX prop was never passed, so
     until 2026-08-13 the value stopped here and every below-floor plan still
     rendered the COMPRESSED copy, which describes interval work and a
     long-run build that a finish-safely plan does not have. */
  const raceBelowFloor = !!programState?.runPlan?.belowFloor;
  // Memoised: `programState?.runDays ?? []` produces a fresh array
  // reference on every render when the field is undefined, which
  // would invalidate the downstream useMemo deps.
  const runDays = useMemo(
    () => programState?.runDays ?? [],
    [programState?.runDays]
  );
  // The run days from this week on. Past race week a race plan keeps race
  // week's days for the race's own ending (`raceAwaitsItsEnding`): the
  // no-show banner reads the race day among them, but none is this week's
  // run to start, nor one of this week's runs done.
  const runDaysFromThisWeek = useMemo(() => {
    const monday = localWeekKey(parseLocalDate(todayKeyDerivation));
    return runDays.filter((rd) => !rd.date || rd.date >= monday);
  }, [runDays, todayKeyDerivation]);

  // Race-elapsed is a cheap render-time derivation; not memoised
  // because the comparison against "now" is impure and useMemo
  // would be flagged. Sub-microsecond cost; ran every render is
  // Local date-string compare — elapsed only AFTER race day, not during it.
  // Parsing the target as UTC midnight and comparing to now marked the race
  // elapsed partway through race day for non-UTC users, dropping the race
  // template to freeform on race day. Matches isRacePlanElapsed
  // (runPlanMetadata.ts) and Run.tsx's copy.
  const raceElapsed = !!(
    raceGoal?.targetDate && localDateString() > raceGoal.targetDate
  );

  // Run9 (l): race-recent ("did you race?") dismissal. When the user taps
  // "I didn't race", hide the prompt for the rest of the T+1..T+3 window
  // (keyed by the race date so a new race resets it) and let the server's
  // dailyRaceReconciliationSweep flip race_no_show at T+3 — the client NEVER
  // writes that status (PR-L: race-day transitions are server-owned; the hook
  // is a pure reader). Same once-only localStorage pattern as
  // raceElapsedDismissed; safe because race-recent only fires 1–3 days after a
  // past race, by which point a newly-set future race has remounted the page.
  const raceRecentDismissKey = `${storageUid}:tropos.dismiss.raceRecent.${raceGoal?.targetDate ?? "none"}`;
  const [raceRecentDismissed, setRaceRecentDismissed] = useState<boolean>(
    () => readString(raceRecentDismissKey) === "1"
  );
  function dismissRaceRecent() {
    setRaceRecentDismissed(true);
    // Storage unavailable / quota — the in-memory state still hides the
    // prompt for this session.
    writeString(raceRecentDismissKey, "1");
    toast("Noted. You can set your next race in Run plan.");
  }

  // #975: one-time "Set a race goal" nudge for freeform runners — the skip
  // path from onboarding (race_prep with no date now lands on the freeform
  // substrate, Run9a) and anyone else on freeform who hasn't set a goal.
  // Routes to the Race Goal Planner on /settings/run-plan (where runway
  // feedback lives — the bare onboarding date field gave none). Dismissible
  // via the same localStorage pattern as raceRecent; and it disappears
  // naturally once a goal IS set, because the mode flips to race_prep and
  // this whole freeform block stops rendering ("dismisses after use").
  const SET_RACE_GOAL_DISMISS_KEY = `${storageUid}:tropos.dismiss.setRaceGoal`;
  const [setRaceGoalDismissed, setSetRaceGoalDismissed] = useState<boolean>(
    () => readString(SET_RACE_GOAL_DISMISS_KEY) === "1"
  );
  function dismissSetRaceGoal() {
    setSetRaceGoalDismissed(true);
    // Storage unavailable / quota — in-memory state still hides it for this
    // session.
    writeString(SET_RACE_GOAL_DISMISS_KEY, "1");
  }

  // PR-C: post-race card state derivation. Driven by:
  //   - the race-day runDay status (planned / completed_* / race_no_show)
  //   - runPlan.phase ("recovery" or undefined)
  //   - today vs runPlan.recoveryEndDate (in-recovery / ended-grace / past-grace)
  //
  // Variants:
  //   inRecovery       → "Recovering — N days left" + Skip-recovery link
  //   recoveryEnded    → "Recovery complete. What's next?" + Set next race / Back to freeform
  //   noShow           → "We marked this as no-show. Log it now if you ran." + Log race now / Set next race / Manage plan
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
  /* Was hand-derived here from phase + recoveryEndDate + a locally-computed
   * today. That derivation existed in ~6 places with slightly different
   * notions of "today", which is the drift runPlanResolver was built to end;
   * this reads its single definition instead. `phase` / `recoveryEndDate`
   * stay because getRunHeroState takes the RAW fields and does its own
   * thing with them — narrowing that is a separate job. */
  const { inRecovery, recoveryEnded } = resolvedRunPlan;
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
    // Recovery ends on a local date; DST days need not last 24 hours.
    // The date key also refreshes this count when the app crosses midnight.
    return Math.max(
      0,
      differenceInCalendarDays(
        parseLocalDate(recoveryEndDate),
        parseLocalDate(todayKeyDerivation)
      )
    );
  }, [inRecovery, recoveryEndDate, todayKeyDerivation]);

  // PR-4: surface the first non-terminal runDay as a promoted
  // "Next planned run" Start card on non-freeform modes. The
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
      runDaysFromThisWeek.find(
        (rd) =>
          isScheduledRunStartable(getScheduledRunStatus(rd)) &&
          !(rd.id && isRunDayComplete(rd.id, claimMap))
      ) ?? null
    );
  }, [currentMode, runDaysFromThisWeek, claimMap]);

  // `nextStartable` is still derived above — it feeds the hero state machine
  // and the "all runs done" affirmation. The old "next planned run" command
  // card (which promoted nextStartable regardless of the selected day) was
  // replaced by the date-driven selected-day card; per the locked UX the card
  // must reflect the SELECTED date, never a global next-run.
  const allRunsDone =
    currentMode !== "freeform" &&
    runDaysFromThisWeek.length > 0 &&
    !nextStartable;

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
        belowFloor: raceBelowFloor,
        todayKey: todayKeyDerivation,
      }),
    [
      raceGoal,
      programState?.runPlan?.currentWeek,
      programState?.runPlan?.totalWeeks,
      raceCompressed,
      raceBelowFloor,
      todayKeyDerivation,
    ]
  );
  // The race card is on screen: a race plan with its race still ahead.
  // It carries the tab's ways into the run plan editor and Adjust this
  // week, so nothing else on the tab offers them while it shows.
  const showRaceCard =
    currentMode === "race_prep" &&
    !!raceGoal &&
    !raceElapsed &&
    raceCockpitVM !== null;

  // ── Run14: ease-week nudge (RUN-05) ────────────────────────────────
  // Suggest+approve: evaluate the harder-streak trigger + every
  // suppression rule (all in the pure module), and render a quiet
  // evidence-first card that opens AdjustWeekSheet preselected. The
  // engine never changes anything — the user applies in the sheet.
  const coachingRuns = useMemo(
    () =>
      runs.filter(isRunCoachingEligible).map((r) => ({
        ...r,
        date: runEvidenceDate(r),
        completedAtMs: r.completedAt.getTime(),
      })),
    [runs]
  );
  const coachingReady =
    !runsLoading && !runsFailed && runsEvidenceReady !== false;
  // Run20 (5): the day a new runner's first weeks end, for easing a week.
  const newRunnerUntil = profileNewRunnerUntil(profile);
  const easeNudge = useMemo(
    () =>
      evaluateEaseWeekNudge({
        isRacePrep: currentMode === "race_prep" && !!raceGoal && !raceElapsed,
        runs: coachingReady ? coachingRuns : [],
        today: todayKeyDerivation,
        // Never tell a tapering / racing / recovering runner to ease more.
        phaseSuppressed:
          inRecovery ||
          recoveryEnded ||
          raceCockpitVM?.phaseLabel === "Taper" ||
          raceCockpitVM?.phaseLabel === "Race",
        // Nothing left to ease this week ⇒ already eased (or no quality
        // runs remain) — no persisted flag needed.
        weekAlreadyEased:
          planEasierWeek(runDays, todayKeyDerivation, newRunnerUntil).length ===
          0,
        fellBehindPending: contextualPrompt === "fell-behind",
        dismissedWeekKey: getDismissedWeekKey(profile.uid),
        lastShownAt: getLastShownAt(profile.uid),
      }),
    [
      currentMode,
      raceGoal,
      raceElapsed,
      coachingRuns,
      coachingReady,
      todayKeyDerivation,
      inRecovery,
      recoveryEnded,
      raceCockpitVM?.phaseLabel,
      runDays,
      newRunnerUntil,
      contextualPrompt,
      profile.uid,
    ]
  );
  const dismissalScope = `${profile.uid}:${localWeekKey(parseLocalDate(todayKeyDerivation))}`;
  const easeNudgeVisible =
    easeNudge.show && easeNudgeDismissed !== dismissalScope;
  // A6: trigger-aware counts — the card copy branches on which signal
  // fired (user-authored ratings vs measured pace misses).
  const easeNudgeTrigger = easeNudge.show ? easeNudge.trigger : null;
  const easeNudgeCount = !easeNudge.show
    ? 0
    : easeNudge.trigger === "harder_ratings"
      ? easeNudge.harderCount
      : easeNudge.trigger === "short_sessions"
        ? easeNudge.shortCount
        : easeNudge.slowCount;
  const easeNudgeTotal = !easeNudge.show
    ? 0
    : easeNudge.trigger === "harder_ratings"
      ? easeNudge.ratedCount
      : easeNudge.trigger === "short_sessions"
        ? easeNudge.comparedCount
        : easeNudge.judgedCount;
  // Record the 14-day cooldown + fire analytics the first render the card
  // is visible. The pure module treats "shown today" as still-showable
  // (sinceShown === 0), so writing the marker here never self-suppresses.
  useEffect(() => {
    if (!easeNudgeVisible) return;
    setLastShownAt(profile.uid, todayKeyDerivation);
    trackProgram("ease_week_nudge_shown", {
      trigger: easeNudgeTrigger,
      count: easeNudgeCount,
      total: easeNudgeTotal,
    });
  }, [
    easeNudgeVisible,
    profile.uid,
    todayKeyDerivation,
    easeNudgeTrigger,
    easeNudgeCount,
    easeNudgeTotal,
  ]);

  // A6: the post-ease bounce read — the week AFTER an applied easier
  // week, one factual line on whether the quality came back. Pure,
  // informational only; renders nothing in every other week.
  const postEaseBounce = useMemo(
    () =>
      evaluatePostEaseBounce({
        easedWeekKey: getEasedWeekKey(profile.uid),
        today: todayKeyDerivation,
        runs: coachingReady ? coachingRuns : [],
      }),
    [profile.uid, todayKeyDerivation, coachingReady, coachingRuns]
  );

  // ── Run-week selector (date-pinned, ADR-0002) ──────────────────────
  /* The CALENDAR week — anchored on `WEEK_STARTS_ON` (Monday), the same
     window Home's WeekStrip renders — resolved through the same shared resolver Home/WeekStrip/
     DayActionSheet use. Run-scope only: no lift lanes, the Lift tab owns
     lifting. The selector drives `selectedDateKey`; the selected-day
     command card below reads from it.

     Three reasons it is not a rolling today-first window:

     1. This selector is deliberately drawn in Home's WeekStrip visual
        language, so two near-identical strips windowing differently gives
        the same control two meanings with nothing on screen to tell them
        apart.
     2. A race block is structured in WEEKS ("Week 1/26" above). Any
        7-day window that does not begin on the week's first day spans two
        plan weeks, so the mileage on screen belongs to a different week
        than the header — true by construction, not an edge case.
     3. `resolveTrainingWindow` derives its `currentWeekKey` gate from
        `startDate`, and that gate gives `resolveRunDayForDate` its
        priority-3 legacy fallback. Anchoring on the week's first day makes
        `localWeekKey(weekStart) === localWeekKey(today)` hold for all
        seven days, so a legacy-shaped runDay (no `date`, no `weekKey`)
        resolves across the whole strip instead of going null the moment
        the window crossed into next week. Narrow — post-migration docs
        carry `date` and match on priority 1 — but it is the same guard
        Home's strip is anchored to keep. */
  const weekStartKey = localWeekKey(parseLocalDate(todayKeyDerivation));
  const runWindow = useMemo(
    () =>
      resolveTrainingWindow({
        startDate: parseLocalDate(weekStartKey),
        days: 7,
        profile,
        programState,
        claimMap,
      }),
    [weekStartKey, profile, programState, claimMap]
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
          // The narrow token, not the first letter of the short one — same
          // result, but it says "one-letter weekday" rather than leaving a
          // slice to be re-derived. Matches Home's strip: the letter row is
          // a fixed frame on both, so position disambiguates S/S and T/T.
          topLabel: format(date, "EEEEE"),
          center: String(date.getDate()),
          bottomLabel: hasRun ? runStripLabel(run.template, unit) : "",
          status,
          isToday: d.dateKey === todayKeyDerivation,
        };
      }),
    [runWindow, todayKeyDerivation, unit]
  );

  /* The SELECTED day for the command card — taken straight from the
     already-resolved week (the selector only ever selects a day in it), so
     there is no second resolver pass over the same window. `startUrl`
     already carries ?template=&scheduledRunId= when startable.

     The fallback for a stale `?rday` is TODAY, found by key rather than by
     index. On a calendar week index 0 is the week's first day (Monday), so
     an index-based fallback answers a stale link with the start of the week
     instead of the day the user is on. */
  const todayIdx = Math.max(
    0,
    runWindow.findIndex((d) => d.dateKey === todayKeyDerivation)
  );
  // Until the person picks a day, the tab opens on today's run, or on the
  // week's next one when today has none to start, as the Lift tab opens on
  // its next session. Derived on every render, so it follows the plan as it
  // loads rather than freezing on the first, empty, paint.
  const selectedDateKey =
    chosenDateKey ?? defaultRunDayKey(runWindow, todayKeyDerivation);
  const selectedDay =
    runWindow.find((d) => d.dateKey === selectedDateKey) ?? runWindow[todayIdx];
  const selectedRun = selectedDay.run;
  const selectedSavedRunId = selectedRun.runDay?.id
    ? claimMap.get(selectedRun.runDay.id)?.claimedSavedRunId
    : undefined;

  // Run day-pager — swipe left/right across the run week to change the
  // selected day, mirroring the Lift tab's session swiper (shared
  // resolveDayPagerDelta thresholds). At the window boundary it does nothing
  // and the outer tab-swipe takes over via the data-swipe-pager contract on
  // the wrapper below.
  const runTouchStartRef = useRef({ x: 0, y: 0 });
  // Same reasoning as `selectedDay`: an unfound key resolves to today's
  // index, not to the start of the week, so a swipe after a stale link
  // continues from the day the card is actually showing.
  const selectedRunIdxRaw = runWindow.findIndex(
    (d) => d.dateKey === selectedDateKey
  );
  const selectedRunIdx = selectedRunIdxRaw >= 0 ? selectedRunIdxRaw : todayIdx;
  const handleRunTouchStart = (e: React.TouchEvent) => {
    runTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };
  const handleRunTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - runTouchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - runTouchStartRef.current.y;
    const delta = resolveDayPagerDelta(
      dx,
      dy,
      selectedRunIdx,
      runWindow.length
    );
    if (delta !== 0) {
      haptic("light");
      selectRunDay(runWindow[selectedRunIdx + delta].dateKey);
    }
  };
  const selectedTemplate = selectedRun.template;
  const selectedIsRace = selectedTemplate?.type === "race";
  // Run21 (2): a long run that finishes at race pace says so, by the
  // launch's own gate.
  const selectedRacePace = racePaceWorkFor(
    selectedTemplate,
    profile,
    programState?.runPlan
  );
  const selectedName = runSessionName(selectedTemplate, selectedRacePace, unit);
  const selectedPurpose =
    selectedTemplate && selectedRun.runDay
      ? runSessionPresentation({
          type: selectedTemplate.type,
          templateId: selectedTemplate.id,
          currentWeek: programState?.runPlan?.currentWeek,
          totalWeeks: programState?.runPlan?.totalWeeks,
          distance:
            programState?.runPlan?.raceGoal?.distance ??
            profile.raceGoal?.distance,
          weekHasQuality: weekHoldsQuality(runDays, selectedRun.runDay.weekKey),
          racePace: selectedRacePace?.kind,
        })
      : { purpose: null, weekLabel: null };
  // Non-breaking spaces: on a narrow card the eyebrow breaks before the
  // date, never inside it ("Up next · Tue 27" over "Oct").
  const selectedDateLabel = format(
    parseLocalDate(selectedDateKey),
    "EEE d MMM"
  ).replace(/ /g, " ");
  // Adaptive Paces: the user's personalised pace for the selected session,
  // surfaced on the command card so the "made for you" pace is visible where
  // the run is started — not just in Settings. Band-first via the shared
  // sessionPaceDisplay rule (mirrors DayActionSheet). Null when there's no
  // benchmark (the run then shows distance/type only, as before), and for
  // run-walk, which is run by feel (Run20 (5)).
  const selectedPaceLabel: string | null = (() => {
    if (!selectedTemplate || isRunWalkTemplateId(selectedTemplate.id))
      return null;
    // A2: a tempo at the goal pace shows that pace, the one the run will
    // set, with or without a benchmark.
    if (selectedRacePace?.kind === "tempo") {
      return sessionPaceDisplay(
        { targetPace: Math.round(selectedRacePace.goalPaceS) },
        unit
      );
    }
    const table = prescriptivePaceTableFromFitness(profile.runFitness ?? null);
    if (!table) return null;
    return sessionPaceDisplay(
      resolveSessionPaces(selectedTemplate.type, table, {
        raceDistanceKey: raceDistanceKeyFromKm(
          selectedTemplate.config.targetDistanceKm
        ),
      }),
      unit
    );
  })();
  // Target HR zone for the selected session — the HR companion to the pace
  // (mirrors DayActionSheet). Measured max, else the age estimate; null when
  // neither, so the card just shows pace/type as before.
  const selectedHrItems: string[] = (() => {
    if (!selectedTemplate) return [];
    const maxHr = profile.maxHeartRate ?? maxHrFromAge(profile.age ?? 0);
    const band = targetZoneForRun(
      selectedTemplate.type,
      maxHr,
      selectedTemplate.config.targetDistanceKm
    );
    return band ? [zoneShortLabel(band)] : [];
  })();

  // Meta line for the selected run: the dose, the pace when there is one,
  // and the zone ("30 min · Z2 112–130 bpm"). The title names the session
  // and the feel line above gives its effort in words, so neither the type
  // nor the zone's name is said again here; the day's sheet keeps them.
  const selectedRunMeta: string[] = (() => {
    if (!selectedTemplate) return [];
    const meta: string[] = [];
    // Run21 (5): a long run's minutes at the runner's own pace.
    meta.push(
      runDoseLine(selectedTemplate, planningEasyPaceSPerKm(profile.runFitness))
    );
    if (selectedPaceLabel) meta.push(selectedPaceLabel);
    meta.push(...selectedHrItems);
    return meta;
  })();
  // Free-run fallback URL (Run.tsx parses ?type=freerun on mount).
  const FREE_RUN_URL = "/run?type=freerun";
  // Suppress the selected-day card when a race state-overlay hero already
  // owns today's slot AND today is what's selected — avoids a double CTA.
  const selectedIsToday = selectedDateKey === todayKeyDerivation;
  const heroOwnsSelectedToday =
    selectedIsToday &&
    (heroState === "race-today" || heroState === "race-recent");

  // Selected-day card eyebrow — temporal status relative to the SELECTED
  // date (Due today / Tomorrow / Pending for a past-but-startable slot / Up
  // next for the first run still to do / Upcoming after it). The card
  // always leads with the calendar date too (selectedDateLabel), so the
  // user never loses their place after tapping around the selector.
  const selectedEyebrow = runCardStatus(
    selectedDateKey,
    { today: todayKeyDerivation, tomorrow: tomorrowKeyDerivation },
    runWindow
  );

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
  // Mode + race goal writers moved to Settings (then /settings/training;
  // today the focused /settings/run-plan editor). See
  // `/root/.claude/plans/gentle-giggling-creek.md`.

  // PR-C + Run9 ENG(j): skip-recovery-early handler. Calls the
  // dedicated useProgram writer (`skipRecoveryEarly`) which resolves
  // the exit via `resolveRecoveryExit`: back to FREEFORM (plan +
  // raceGoal cleared) — the race is done and recorded — unless a
  // newer future race was set during recovery, in which case
  // race_prep is preserved and only the recovery phase clears.
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
      const result = await realignRacePlan();
      // A refusal or a failed save has already been said by the writer.
      if (result.status === "applied" && raceGoal) {
        toast.success(
          realignResultMessage({
            timing: result.timing,
            distance: raceGoal.distance as "5k" | "10k" | "half" | "marathon",
            totalWeeks: result.totalWeeks,
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
            title={ownGoal ? "Goal day has passed" : "Race day has passed"}
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
          now / Set next race / Manage plan) so the banner
          itself is the affordance — not dismissible. Run9: gated by the
          single contextual-prompt slot (precedence over recovery-complete). */}
      {contextualPrompt === "no-show" && raceGoal && (
        <Banner
          variant="warning"
          title={`${raceGoal.distance.toUpperCase()} · ${raceGoal.targetDate}`}
          description="We marked this as no-show after 3 days with no log. Log it now if you ran it."
          action={
            /* One filled coral CTA per banner, the run's main action
               (DESIGN_GUIDE §14i: running CTAs are `sport`); the rest
               are secondary. */
            <div className="flex flex-col gap-2">
              <Button
                variant="sport"
                fullWidth
                onClick={() => {
                  if (raceDayRunDay?.id) {
                    haptic();
                    navigate(
                      `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                    );
                  }
                }}
              >
                Log race now
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className={ACTION_PAIR}
                  onClick={() => {
                    haptic();
                    navigate("/settings/run-plan");
                  }}
                >
                  Set next race
                </Button>
                <Button
                  variant="secondary"
                  className={ACTION_PAIR}
                  onClick={() => {
                    haptic();
                    navigate("/settings/run-plan");
                  }}
                >
                  Manage plan
                </Button>
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
            <Button
              variant="sport"
              fullWidth
              onClick={() => {
                haptic();
                navigate("/settings/run-plan");
              }}
            >
              Configure plan
            </Button>
          }
        />
      )}

      {/* Info: recovery complete. Hosts critical "Set next race" /
          "Back to freeform" prompts — non-dismissible. Run9: gated by
          the single contextual-prompt slot (yields to no-show).
          RUN-L1: the second action is labelled for what the writer
          actually does post-Run9 — resolveRecoveryExit returns the
          user to freeform (the locked two-state model has no
          structured mode to switch to). */}
      {contextualPrompt === "recovery-complete" && (
        <Banner
          variant="info"
          title="Recovery complete"
          description="What's next?"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="sport"
                className={ACTION_PAIR}
                onClick={() => {
                  haptic();
                  navigate("/settings/run-plan");
                }}
              >
                Set next race
              </Button>
              <Button
                variant="secondary"
                className={ACTION_PAIR}
                onClick={handleSkipRecoveryEarly}
              >
                Back to freeform
              </Button>
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
              <Button variant="sport" fullWidth onClick={handleRealign}>
                Realign my plan
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  haptic();
                  void dismissFellBehindPrompt();
                  navigate("/settings/run-plan");
                }}
              >
                My race moved →
              </Button>
            </div>
          }
        />
      )}

      {/* Info: in recovery (state-derived — visibility tracks
          runPlan.phase === "recovery"; user can't dismiss). */}
      {currentMode === "race_prep" && raceGoal && inRecovery && (
        <Banner
          variant="info"
          title={`Recovering · ${recoveryDaysLeft} day${recoveryDaysLeft === 1 ? "" : "s"} left`}
          description="Easy runs only until then, while your legs recover from the race."
          action={
            <Button variant="sport-tinted" onClick={handleSkipRecoveryEarly}>
              Skip recovery early
            </Button>
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
          the stepper visibly jumped when toggling tabs. The way into the
          editor is the race card's "Edit run plan", or the footer link when
          there is no race card. */}

      {/* ── Hero: freeform ──────────────────────────────────────────
          Start CTA + last-run + this-week summary lines. Empty
          state when the user has no recent runs.
          Run7 Q7: subtle coral 6% tint (was gradient 18%→8%), icon
          container coral ~10% (was 13%). Same treatment applied to
          the Next · Pending card below for visual coherence. */}
      {currentMode === "freeform" && (
        <div className="space-y-3">
          <NonRaceGoalProgress
            goal={profile.nonRaceGoal}
            runs={runs}
            loading={runsLoading}
            failed={runsFailed}
          />
          {/* DS3: the same session card the Lift tab and a planned run
              use, where a hand-built row carried a gradient "Go" pill. */}
          <SessionCommandCard
            sport="run"
            eyebrow="Start a run"
            title="Pick your pace today"
            description="Easy, tempo, intervals or just go."
            meta={[]}
            primaryActionLabel="Start run"
            onPrimaryAction={() => {
              haptic();
              navigate("/run");
            }}
          />

          {/* Recent-run context. Hero shell paints immediately;
              these two lines fade in once useRunningStats resolves.
              No spinner is shown over the Start CTA above. */}
          {runsLoading ? (
            <div className="space-y-1.5">
              <div
                className="h-3.5 rounded bg-muted/60 motion-safe:animate-pulse"
                style={{ width: "70%" }}
              />
              <div
                className="h-3.5 rounded bg-muted/60 motion-safe:animate-pulse"
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
            <Card className="space-y-3">
              {/* R2-1 descriptive cadence headline (not a target). */}
              <p className="text-sm font-semibold text-foreground">
                You've run {freeformCadence.count}× in the last{" "}
                {freeformCadence.weeks} weeks
              </p>
              {/* DS3: the week as three plain numbers, where one grey line
                  carried all of them at 12px. */}
              {thisWeek && (
                <div>
                  <SectionLabel>This week</SectionLabel>
                  <div className="mt-2 grid grid-cols-3 divide-x divide-border">
                    {/* `totalDistance` is stored KILOMETRES, so it goes
                        through `storedKmLabel` into the reader's unit. A
                        bare `km` once showed a miles reader the metric
                        figure beside a converted pace. */}
                    <StatFigure
                      value={storedKmLabel(
                        thisWeek.totalDistance,
                        unit,
                        false,
                        1
                      )}
                      unit={distanceUnitLabel(unit)}
                    />
                    <StatFigure
                      value={String(thisWeek.runCount)}
                      unit={thisWeek.runCount === 1 ? "run" : "runs"}
                    />
                    <StatFigure
                      value={
                        thisWeek.avgPace > 0
                          ? paceMinSec(thisWeek.avgPace, unit)
                          : "—"
                      }
                      unit={`${paceUnitLabel(unit)} avg`}
                    />
                  </div>
                </div>
              )}
              {/* Prose labels in the body font; only the numerals take
                  tabular digits (`font-mono`). Each fact stays whole when
                  the line wraps ("5.0 km", "1 day ago"). */}
              {lastRun && (
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground">Last run</span>
                  {" · "}
                  <span className="whitespace-nowrap font-mono tabular-nums">
                    {distanceLabel(lastRun.distance, unit)}
                  </span>
                  {" · "}
                  <span className="whitespace-nowrap font-mono tabular-nums">
                    {durationLabel(lastRun.duration)}
                  </span>
                  {lastRun.avgPace > 0 && (
                    <>
                      {" · "}
                      <span className="whitespace-nowrap font-mono tabular-nums">
                        {paceLabel(lastRun.avgPace, unit)}
                      </span>
                    </>
                  )}
                  {" · "}
                  <span className="whitespace-nowrap">
                    {formatDistanceToNowStrict(lastRun.completedAt, {
                      addSuffix: true,
                    })}
                  </span>
                </p>
              )}
            </Card>
          )}

          {/* #975: one-time "Set a race goal" entry. Routes to the Race Goal
              Planner (/settings/run-plan). Dismissible; once a goal is set the
              mode flips to race_prep and this freeform block stops rendering. */}
          {!setRaceGoalDismissed && (
            <Card size="compact" className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  haptic();
                  navigate("/settings/run-plan");
                }}
                className="flex-1 flex items-center gap-3 text-left min-w-0"
                style={{ minHeight: 44 }}
              >
                {/* DS3: a plain card, words first. The tinted trophy tile
                    it led with repeated the coral the eyebrow already
                    carries. */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-running-strong">
                    Set a race goal
                  </p>
                  <p className="text-base font-bold text-foreground">
                    Training for a race?
                  </p>
                  <p className="text-sm text-muted-foreground">
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
            </Card>
          )}
        </div>
      )}

      {/* Run8 PR1a — the "Race prep not set up yet → Set race goal"
          inline form lives on /settings/run-plan now. The section
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
              <p className="text-xs font-semibold mb-0.5 text-running-strong">
                {goalDay}
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
              aria-label={
                ownGoal
                  ? "More options for this run"
                  : "More options for race day"
              }
              icon={<MoreVertical aria-hidden="true" />}
              className="shrink-0 -mr-1"
            />
          </div>
          <Button
            variant="sport"
            fullWidth
            leftIcon={<Play className="size-3.5" fill="currentColor" />}
            onClick={() => {
              haptic();
              navigate(
                raceDayRunDay?.id
                  ? `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                  : "/run"
              );
            }}
          >
            {ownGoal
              ? `Start ${goalDay.replace(/^Your/, "your")}`
              : "Start race"}
          </Button>
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
              <p className="text-xs font-semibold mb-0.5 text-running-strong">
                {goalDayQuestion(raceGoal)}
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="sport"
              className={ACTION_PAIR}
              onClick={() => {
                haptic();
                navigate(
                  raceDayRunDay?.id
                    ? `/run?scheduledRunId=${encodeURIComponent(raceDayRunDay.id)}`
                    : "/run"
                );
              }}
            >
              Log it
            </Button>
            <Button
              variant="secondary"
              className={ACTION_PAIR}
              onClick={() => {
                haptic();
                dismissRaceRecent();
              }}
            >
              {ownGoal ? "I didn't run it" : "I didn't race"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Run-week selector + selected-day command card ───────────────
          The single Run day-navigator (date-pinned, ADR-0002), sharing the
          Lift tab's visual language and vertical position. It DRIVES the
          card below: tap a day → that day's command card. Non-freeform only —
          freeform has no scheduled runs ("start whenever"); its hero above
          owns the Start CTA. */}
      {currentMode === "race_prep" &&
        !raceElapsed &&
        !inRecovery &&
        isRunningBaseline(profile.runningBaseline) &&
        runningBaselineNeedsReview(
          profile.runningBaseline,
          todayKeyDerivation
        ) && (
          <Banner
            variant="info"
            title="Review your running starting point"
            description="New weeks use easy running within your last report. Confirm your current training to review the next weeks of your plan."
            action={
              <Button
                variant="outline"
                onClick={() => navigate("/settings/run-plan")}
              >
                Review starting point
              </Button>
            }
          />
        )}
      {currentMode !== "freeform" && (
        <div
          className="space-y-3"
          data-swipe-pager
          data-swipe-at-start={selectedRunIdx <= 0}
          data-swipe-at-end={selectedRunIdx >= runWindow.length - 1}
          onTouchStart={handleRunTouchStart}
          onTouchEnd={handleRunTouchEnd}
        >
          <ProgrammeWeekSelector
            sport="run"
            ariaLabel="Run week"
            cells={runSelectorCells}
            /* The RESOLVED day, not the raw state. A stale `?rday` falls
               back to today for the command card below, and passing the
               unresolved key here left the strip with nothing highlighted
               while the card showed today — the two halves of one control
               disagreeing about what is selected. */
            selectedKey={selectedDay.dateKey}
            onSelect={selectRunDay}
          />

          {/* The selected-day command card. Suppressed only when a race
              state-overlay hero (race-today / race-recent) already owns
              today's slot AND today is selected — the selector still lets
              the user browse other days. */}
          {!heroOwnsSelectedToday &&
            (selectedRun.isStartable && !selectedRun.isCompleted ? (
              <div className="space-y-2">
                <SessionCommandCard
                  sport="run"
                  figure={
                    <img
                      src={runPoseUrl(runPoseFor(selectedTemplate?.type))}
                      alt=""
                      draggable={false}
                      decoding="async"
                      className="h-24 w-auto"
                    />
                  }
                  onFigurePress={openRunForm}
                  figureLabel="Running form"
                  eyebrow={`${selectedEyebrow} · ${selectedDateLabel}`}
                  title={selectedName}
                  /* Run21 (2): the session's one feel line. Its shape
                     is "What it is", in "Why this run" below. */
                  description={
                    selectedTemplate
                      ? runSessionAbout(selectedTemplate, {
                          racePace: selectedRacePace,
                        }).feel
                      : undefined
                  }
                  /* No plan position ("Base · week 1 of 10"): the page
                     header, the race card's date line and its rail say
                     it already. */
                  meta={selectedRunMeta}
                  /* Today's run starts from here, straight into the run, as
                     the Lift tab's Start begins its workout and Home's
                     Start does (`startOnArrival`). Another day's opens the
                     run's own card to look it over. */
                  primaryActionLabel={
                    selectedIsToday
                      ? selectedIsRace
                        ? "Start race"
                        : "Start run"
                      : selectedIsRace
                        ? "View race"
                        : "View run"
                  }
                  onPrimaryAction={() => {
                    haptic();
                    // startUrl carries ?template=&scheduledRunId= so the run
                    // fulfils this exact planned slot (claim-map binding).
                    const url = selectedRun.startUrl ?? FREE_RUN_URL;
                    navigate(selectedIsToday ? withStartOnArrival(url) : url);
                  }}
                  onManage={() => {
                    haptic();
                    setManageDate(selectedDateKey);
                  }}
                />
                <RunPlanPurpose
                  purpose={selectedPurpose.purpose}
                  template={selectedTemplate}
                  racePace={selectedRacePace}
                  run={selectedRun.runDay}
                  runDays={runDays}
                />
                {/* Secondary: an ad-hoc run that does NOT fulfil the plan slot. */}
                <Button
                  variant="ghost"
                  fullWidth
                  className="text-muted-foreground"
                  onClick={() => {
                    haptic();
                    navigate(FREE_RUN_URL);
                  }}
                >
                  Start free run instead
                </Button>
              </div>
            ) : (
              // No startable run on the selected day: done, skipped, or
              // nothing planned. The same card as a planned run, so every
              // day is drawn at one size, as the Lift tab's are; it always
              // offers a free run.
              <SessionCommandCard
                sport="run"
                figure={
                  <img
                    src={runPoseUrl("run-easy")}
                    alt=""
                    draggable={false}
                    decoding="async"
                    className="h-24 w-auto"
                  />
                }
                onFigurePress={openRunForm}
                figureLabel="Running form"
                eyebrow={
                  selectedRun.isCompleted
                    ? `Done · ${selectedDateLabel}`
                    : selectedRun.status === "skipped"
                      ? `Skipped · ${selectedDateLabel}`
                      : selectedDateLabel
                }
                title={
                  selectedRun.isCompleted || selectedRun.status === "skipped"
                    ? selectedName
                    : selectedDay.scheduleType === "lift"
                      ? // Run-scope card, but the day is not a rest day:
                        // Home names it a lift day.
                        "Lift day"
                      : "Rest day"
                }
                description={
                  selectedRun.isCompleted
                    ? "Add another whenever you like."
                    : selectedRun.status === "skipped"
                      ? "You can still head out."
                      : selectedDay.scheduleType === "lift"
                        ? "Head out for a free run if you like."
                        : "Head out whenever you like."
                }
                meta={[]}
                primaryActionLabel="Start free run"
                onPrimaryAction={() => {
                  haptic();
                  navigate(FREE_RUN_URL);
                }}
                action={
                  selectedRun.isCompleted && selectedSavedRunId ? (
                    <div className="space-y-2">
                      <Button
                        variant="sport"
                        size="lg"
                        fullWidth
                        onClick={() => {
                          haptic();
                          navigate(`/run/${selectedSavedRunId}`);
                        }}
                      >
                        View this run
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => {
                          haptic();
                          navigate(FREE_RUN_URL);
                        }}
                      >
                        Start free run
                      </Button>
                    </div>
                  ) : undefined
                }
              />
            ))}

          {/* Race progress identity card — moved BELOW the selected-day card
              (cockpit reorder). Race-prep only; the actionable race-day /
              race-recent heroes stay on top. */}
          {showRaceCard && raceCockpitVM && (
            <RaceCockpitCard
              distanceLabel={raceCockpitVM.distanceLabel}
              eventName={raceCockpitVM.eventName ?? undefined}
              targetDate={raceCockpitVM.targetDate}
              daysToRace={raceCockpitVM.daysToRace}
              currentWeek={raceCockpitVM.currentWeek}
              totalWeeks={raceCockpitVM.totalWeeks}
              phaseLabel={raceCockpitVM.phaseLabel}
              inTaper={raceCockpitVM.inTaper}
              compressed={raceCockpitVM.compressed}
              /* belowFloor implies compressed but must be surfaced
                   separately — the compressed copy describes interval work
                   trimmed and a long-run progression shortened, and a
                   below-floor plan has neither. The view model has carried
                   this since it was added for exactly that reason; only this
                   hop was missing, so the card fell through to the compressed
                   branch and described training the plan does not contain. */
              belowFloor={raceCockpitVM.belowFloor}
              /* PR4 cross-link — the PROFILE copy is canonical for the
                   catalogue binding (runPlan.raceGoal is the schedule's
                   snapshot and doesn't carry it). */
              raceSpaceId={profile.raceGoal?.eventSpaceId}
              /* R23: the plan's coming weeks, a week a row. */
              weeksAhead={
                <RaceWeeksAhead
                  profile={profile}
                  programState={programState}
                  recentLayoff={recentLayoff}
                  today={todayKeyDerivation}
                />
              }
              /* Run13 (RUN-02): the standing, proactive week adjustment,
                   not gated on falling behind. Hidden in recovery and just
                   after the race, which own their own flows. Opening clears
                   a pending fell-behind prompt first (Run9c, one primary
                   action). */
              onAdjustWeek={
                !inRecovery && !recoveryEnded
                  ? () => {
                      if (contextualPrompt === "fell-behind") {
                        void dismissFellBehindPrompt();
                      }
                      // Opens on the intent chooser, not the nudge's
                      // preselected easier preview.
                      setAdjustInitialIntent(undefined);
                      trackProgram("adjust_week_opened", {
                        source: "cockpit",
                      });
                      setAdjustOpen(true);
                    }
                  : undefined
              }
              onEdit={() => {
                haptic();
                navigate("/settings/run-plan");
              }}
            />
          )}

          {/* A7 — race execution card: A/B/C goals + negative-split table.
              Self-gates to taper + race week (raceDayPlanVisible) and to
              having at least one time to pace from (goal or benchmark).
              `targetTimeS` reads the PROFILE copy — the canonical store for
              the goal time (runPlan.raceGoal is the schedule's snapshot and
              doesn't carry it). */}
          {currentMode === "race_prep" &&
            raceGoal &&
            !raceElapsed &&
            raceCockpitVM && (
              <RaceDayPlanCard
                distance={raceGoal.distance as RaceDistance}
                targetTimeS={profile.raceGoal?.targetTimeS ?? null}
                runFitness={profile.runFitness ?? null}
                currentWeek={programState?.runPlan?.currentWeek ?? null}
                totalWeeks={programState?.runPlan?.totalWeeks ?? null}
              />
            )}

          {/* Run14: the ease-week nudge, under the race card whose Adjust
              this week row it opens preselected. It has already run all
              its scope + suppression rules in the pure module. */}
          {/* A6: the post-ease bounce line — one factual sentence the week
              after an applied easier week. Informational, no actions; the
              nudge machinery stays independently available. */}
          {postEaseBounce && (
            <p className="text-xs text-muted-foreground px-1">
              {postEaseBounce === "recovered"
                ? "Your latest tempo was inside its pace window. One run does not tell the whole story; the plan is unchanged."
                : postEaseBounce === "above_window"
                  ? "Your latest tempo was faster than its pace window. The plan is unchanged."
                  : "Your latest tempo was slower than its pace window. Adjust this week, on your race plan, can ease it."}
            </p>
          )}

          {easeNudgeVisible && easeNudgeTrigger && (
            <EaseWeekNudgeCard
              trigger={easeNudgeTrigger}
              count={easeNudgeCount}
              total={easeNudgeTotal}
              evidence={
                easeNudge.show && easeNudge.trigger === "short_sessions"
                  ? easeNudge.evidence
                  : undefined
              }
              unit={unit}
              onEase={() => {
                haptic();
                trackProgram("ease_week_nudge_applied");
                setAdjustInitialIntent("easier");
                setAdjustOpen(true);
              }}
              onDismiss={() => {
                haptic();
                setDismissedWeekKey(profile.uid, thisWeekKeyForDismissal);
                setEaseNudgeDismissed(dismissalScope);
                trackProgram("ease_week_nudge_dismissed");
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

      {/* The way into the run plan editor (/settings/run-plan) when there
          is no race card to carry it: a free runner, and a race plan that
          is over or recovering. With a race card on screen, its own "Edit
          run plan" is the one way in. */}
      {!showRaceCard && (
        <div className="flex justify-end pt-2 border-t border-border/30">
          <button
            type="button"
            onClick={() => {
              haptic();
              navigate("/settings/run-plan");
            }}
            className="inline-flex items-center gap-0.5 min-h-[44px] px-2 -my-1 -mr-1 text-xs font-medium text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97] transition-transform rounded-md"
          >
            Edit run plan
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}

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
        restoreRunDay={restoreRunDay}
        restoreWorkoutDay={restoreWorkoutDay}
        moveRunDay={moveRunDay}
      />

      {/* Run13 (RUN-02): proactive week-adjustment sheet. */}
      {raceGoal && (
        <AdjustWeekSheet
          open={adjustOpen}
          unit={unit}
          onClose={() => setAdjustOpen(false)}
          newRunnerUntil={newRunnerUntil}
          initialIntent={adjustInitialIntent}
          runDays={runDays}
          raceGoal={{
            distance: raceGoal.distance as "5k" | "10k" | "half" | "marathon",
            targetDate: raceGoal.targetDate,
          }}
          applyEaseWeek={applyEaseWeek}
          revertEaseWeek={revertEaseWeek}
          // The snapshot's own week guard is the truth about whether Undo
          // will work, so the affordance is gated on the same comparison the
          // server makes rather than on mere presence — a snapshot stranded
          // by a rollover would otherwise offer an Undo that always refuses.
          easedThisWeek={
            programState?.easeSnapshot != null &&
            programState.easeSnapshot.weekNumber === programState.weekNumber
          }
          realignRacePlan={realignRacePlan}
          // A6's eased-week marker is the sheet's own job, keyed by uid.
          uid={profile.uid}
        />
      )}
      <RunFormSheet open={runFormOpen} onOpenChange={setRunFormOpen} />
    </section>
  );
}
