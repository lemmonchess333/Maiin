/**
 * Pgm4 — the programme's settings, in two views.
 *
 * Pgm4 made this the single, FREE destination for editing an existing
 * programme, replacing the onboarding-RETAKE, the 6-step Pro-gated
 * ConfigurePlanModal wizard and the ProgramSettingsPanel sheet.
 * Reference-app audit (Pgm4 lock): Fitbod / Hevy / MacroFactor / Garmin /
 * Nike Run Club / Strava all edit goals/plan/equipment via grouped SETTINGS
 * fields with the plan re-deriving — none re-run onboarding, none use a
 * separate wizard, none gate basic plan-editing behind a paywall.
 *
 * One view: Settings → Lift plan, and Train's links, the lifting editor.
 * It had a second, "overview", for a Settings → Programme page that edited
 * nothing: the saved setup, a row for each place a part was set, and the
 * reset. Trim1 call 2 (the owner, 11 November 2026: "streamline all") took
 * that page out, since Settings now lists Lift plan and Run plan itself,
 * and the reset moved to this editor's foot.
 *
 * Save model (the lift editor):
 *   - The two engine toggles (auto-progression, small plates) live-save via
 *     `updateSettings` — no rebuild.
 *   - Every plan-shaping field (focus, experience, lift days, equipment,
 *     injuries) is a DRAFT. A single "Save changes" action runs `buildPlan`
 *     then the `configurePlan` CF with `preserveHistory: true` (week number
 *     / weekHistory / fatigue survive — only the lift workouts + run plan
 *     regenerate), gated behind a single confirmation. The nutrition phase
 *     and the run plan are threaded through unchanged; Nutrition and Run
 *     plan own them.
 *   - "Reset programme", at the foot, calls the destructive
 *     `regenerateProgram` (Week 1 + cleared weekHistory), behind its own
 *     confirmation.
 *
 * NOT here (Pgm4 lock): identity edits (name/gender/age/body metrics/units)
 * stay in Settings → Profile / Units. The day-by-day weekly layout stays in
 * ScheduleLayoutSheet, which this editor links to.
 */
import { appErrorMessage } from "@/lib/callableErrors";
import { rollingGoalOf } from "@/features/program/programMaintenance";
import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Dialog } from "@/components/ui/Dialog";
import {
  Target,
  Dumbbell,
  Footprints,
  Warehouse,
  User,
  Award,
  Sparkles,
  Check,
  AlertTriangle,
  BicepsFlexed,
  Flame,
  Heart,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { focusLabel } from "@/features/program/trainingBlock";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import BaseSectionLabel from "@/components/ui/SectionLabel";
import SectionHeading from "@/components/ui/SectionHeading";
import { logger } from "@/lib/logger";
import { buildPlan } from "@/features/program/planBuilder";
import {
  configureLiftPlan,
  liftPlanInput,
  planSaveRejection,
  savedLiftPlan,
} from "@/features/program/liftPlanRebuild";
import {
  focusRepSummary,
  represcribeWorkouts,
} from "@/features/program/represcribe";
import {
  chooseSplit,
  splitLabel,
  splitRationale,
} from "@/features/program/programEngine";
import {
  computeProgrammeChanges,
  programmePreservationNote,
} from "@/lib/programmeChanges";
import SessionLengthLabel from "./SessionLengthLabel";
import { SESSION_MINUTES_OPTIONS } from "@/features/program/sessionFit";
import ProgrammeSettingsGroup from "./ProgrammeSettingsGroup";
import PendingChangesSummary from "./PendingChangesSummary";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import type {
  PrimaryGoal,
  Goal,
  ProgramState,
  ProgramSettings,
  Experience,
  Equipment,
} from "@/features/program/programTypes";
import type { ProgramReadiness } from "@/features/program/useProgram";
import { DEFAULT_PROGRAM_SETTINGS } from "@/features/program/programTypes";
import { smallPlatesHint } from "@/lib/liftRules";
import type { UserProfile } from "@/lib/auth";

// RunMode / RaceDistance / Experience / Equipment are imported from the
// single-source measure vocabularies (D3) — no longer re-declared here.
interface ProgrammeSettingsProps {
  recentLayoff?: import("@/features/program/layoffDetection").LayoffClass;
  /** `useProgram().recentRuns`: the saved runs read with the layoff, null
   *  while unread. A save rebuilds this week's race runs, and a running
   *  starting point climbs from what these say was done; without them the
   *  week is built as if every run so far had been followed. */
  recentRuns:
    readonly import("@/features/program/layoffDetection").DatedRun[] | null;
  profile: UserProfile;
  programState: ProgramState | null;
  /** `useProgram().readiness`: whether `programState` is the server's copy
   *  yet. Save changes builds the new plan on it and commits against it,
   *  and Reset rebuilds from it, so neither runs before "ready". While the
   *  programme loads it is null or the cached copy, and a save built on
   *  null starts from no programme and is refused as a conflict. */
  readiness: ProgramReadiness;
  /** Live-saves the engine toggles (auto-progression / small plates). */
  updateSettings: (patch: Partial<ProgramSettings>) => Promise<unknown> | void;
  /** Destructive rebuild from scratch (Week 1, clears weekHistory). */
  regenerateProgram: (
    goal?: string,
    weeklyTarget?: number
  ) => Promise<void> | void;
  /** Re-hydrates profile state after the atomic server-side rebuild. */
  refreshProfile: () => Promise<void>;
  /** Opens the day-by-day weekly-layout editor (ScheduleLayoutSheet). */
  onOpenWeeklyLayout: () => void;
  /** Optional hook so the host can refresh after a save. */
  onSaved?: () => void;
  /**
   * Drawn after the form's last group and before Reset programme: the
   * page's own additions (the rest timer, the week's volume), so the
   * reset stays the last thing on the page.
   */
  afterForm?: React.ReactNode;
  /**
   * Blk1 (5): initialises the training-focus DRAFT (mount only) so the
   * block-creation hand-off lands on a prefilled form. The saved profile
   * value is untouched until the user commits through the normal save —
   * the per-field diff then flags the change like any manual edit.
   */
  prefillGoal?: PrimaryGoal;
  /**
   * Blk2: the focus owned by the active training block, if any. When set,
   * the training-focus picker becomes a read-only display — the block is
   * the one place that setting lives while it runs, so two editable copies
   * would be exactly the drift Blk1's original confusion came from.
   *
   * Also threaded into the rebuild, so a save cannot move `primaryGoal`
   * away from the block's focus even if some future caller forgets.
   */
  activeBlockFocus?: PrimaryGoal;
}

/* Programme-settings convenience wrapper — each field group opens with a
   compact section heading and a consistent mb-2. Delegates to the shared
   SectionHeading primitive so the treatment can't drift. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <SectionHeading size="compact" className="mb-2">
      {children}
    </SectionHeading>
  );
}

interface SettingsOptionCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  disabled?: boolean;
  index?: number;
  accent?: string;
}

function SettingsOptionCard({
  selected,
  onSelect,
  icon,
  label,
  desc,
  disabled,
  index = 0,
  accent = THEME.brand,
}: SettingsOptionCardProps) {
  // The card is a container so its picture can give way at larger text,
  // as setup's OptionCard does: under 15em the icon tile left a word like
  // "Intermediate" no room, and a single word cannot wrap. Wide-first, so
  // a browser without container queries keeps the designed card.
  return (
    <div className="@container">
      <motion.button
        data-motion-driven
        type="button"
        onClick={onSelect}
        disabled={disabled}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: index * 0.025 }}
        className={cn(
          "w-full min-h-[68px] flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left",
          "bg-card text-foreground shadow-sm transition-all active:scale-[0.98]",
          selected ? "border-transparent" : "border-border/70",
          disabled && "opacity-35 pointer-events-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
        style={
          selected
            ? {
                /* The tint lies over the card, not in place of it. A bare
                   `${accent}14` replaced `bg-card` with a wash over the
                   PAGE, so in light the description under it (muted, 12px)
                   was 4.23:1 on #e3e2ee, and in dark the selected card sat
                   darker than its neighbours. axe caught it once Settings
                   listed this editor (Trim1 call 2). */
                background: `linear-gradient(${accent}14, ${accent}14), hsl(var(--card))`,
                borderColor: `${accent}45`,
              }
            : undefined
        }
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted/50 @max-[15em]:hidden">
          {icon}
        </span>
        {/* A word wider than the card (larger text on a narrow phone)
          hyphenates rather than running out of it. */}
        <span className="min-w-0 flex-1 break-words hyphens-auto">
          <span className="block text-body font-bold leading-tight">
            {label}
          </span>
          {desc ? (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {desc}
            </span>
          ) : null}
        </span>
        {selected && !disabled ? (
          <Check className="size-4 shrink-0" style={{ color: accent }} />
        ) : null}
      </motion.button>
    </div>
  );
}

// Each focus card gets a distinct GLYPH for scannability, but all keep the
// purple lifting accent — every option here is a lifting goal (primaryGoal
// drives the lift split's rep ranges; "Support my running" is lifting that
// complements runs, NOT run scheduling). So per sport-coding, purple is
// correct; only the icon varies. Do not recolour these to coral.
const FOCUS_OPTIONS: {
  id: PrimaryGoal;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "hypertrophy",
    label: "Build muscle",
    desc: "Higher reps, more volume",
    icon: <BicepsFlexed size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "strength",
    label: "Get stronger",
    desc: "Lower reps, heavier compounds",
    icon: <Dumbbell size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "fat_loss",
    label: "Lose fat",
    // The engine builds this focus as Build muscle (`roleTable.ts`), not
    // high-rep "conditioning" work: the lifting keeps strength and muscle
    // while the calorie deficit does the fat loss (Lift4 (4)).
    desc: "Keeps your strength and muscle as you lose fat",
    icon: <Flame size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "general",
    label: "General fitness",
    desc: "Balanced general training",
    icon: <Heart size={18} style={{ color: THEME.brand }} />,
  },
  {
    id: "running",
    label: "Support my running",
    desc: "Lifting that complements your runs",
    icon: <Footprints size={18} style={{ color: THEME.brand }} />,
  },
];

const EXPERIENCE_OPTIONS: {
  id: Experience;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "beginner",
    label: "Beginner",
    desc: "0 – 6 months of consistent training",
    icon: <Target size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "intermediate",
    label: "Intermediate",
    desc: "6 months – 2 years of training",
    icon: <Award size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "advanced",
    label: "Advanced",
    desc: "2+ years of structured training",
    icon: <Sparkles size={20} style={{ color: "var(--ds-orange-500)" }} />,
  },
];

const EQUIPMENT_OPTIONS: {
  id: Equipment;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "full_gym",
    label: "Full gym",
    desc: "Barbells, dumbbells, cables, machines",
    icon: <Warehouse size={20} className="text-lifting" />,
  },
  {
    id: "home_gym",
    label: "Home gym",
    desc: "Dumbbells, bench, pull-up bar",
    icon: <Dumbbell size={20} style={{ color: THEME.brand }} />,
  },
  {
    id: "minimal",
    label: "Minimal / bodyweight",
    desc: "Bands, bodyweight, maybe dumbbells",
    icon: <User size={20} style={{ color: THEME.success }} />,
  },
];

const INJURY_OPTIONS: {
  id: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "none",
    label: "No injuries",
    desc: "No limitations",
    icon: <Check size={20} style={{ color: THEME.success }} />,
  },
  {
    id: "lower_back",
    label: "Lower back",
    desc: "Avoids heavy loads on your spine",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "shoulder",
    label: "Shoulder",
    desc: "Adjusts pressing movements",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "knee",
    label: "Knee",
    desc: "Adjusts squat and lunge variations",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "elbow",
    label: "Elbow",
    desc: "Swaps heavy curls and dips for cable work",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
  {
    id: "wrist",
    label: "Wrist",
    desc: "Picks neutral-grip and machine variants",
    icon: <AlertTriangle size={20} style={{ color: THEME.warning }} />,
  },
];

// Run9 (3a): `structured` retired as a user-selectable mode — running is
export default function ProgrammeSettings({
  recentLayoff = "none",
  recentRuns,
  profile,
  programState,
  readiness,
  updateSettings,
  regenerateProgram,
  refreshProfile,
  onOpenWeeklyLayout,
  onSaved,
  afterForm,
  prefillGoal,
  activeBlockFocus,
}: ProgrammeSettingsProps) {
  const loadFailedId = useId();
  // ── Persisted values (also the dirty-check baseline) ──────────────
  const saved = useMemo(() => savedLiftPlan(profile), [profile]);

  // ── Draft state ───────────────────────────────────────────────────
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>(
    prefillGoal ?? saved.primaryGoal
  );
  // Nutrition phase is NO LONGER editable here — it's DERIVED from goal
  // weight vs current (the locked goalWeightPlan / MacroFactor model, owned
  // by /settings/nutrition). This editor showed a direct cut/lean-bulk/recomp
  // picker that wrote `program.goal` independently of goal weight, so the two
  // could disagree (pick "Cut" here while goal weight said maintain → drift).
  // We keep the current phase as a plain derived value and thread it through
  // buildPlan unchanged; the read-only card below links out to change it.
  const nutritionPhase: Goal = saved.nutritionPhase;
  const [experience, setExperience] = useState<Experience>(saved.experience);
  const [liftDays, setLiftDays] = useState<number>(saved.liftDays);
  const [sessionMinutes, setSessionMinutes] = useState<number>(
    saved.sessionMinutes
  );
  const [equipment, setEquipment] = useState<Equipment>(saved.equipment);
  const [barbellAtHome, setBarbellAtHome] = useState(saved.barbellAtHome);
  const [injuries, setInjuries] = useState<string[]>(saved.injuries);
  // D14 dedupe: run-plan fields are NO LONGER edited here — the focused
  // /settings/run-plan editor (RunPlanSettings) is the one place they
  // change, with run-only save semantics (never a full rebuild). This
  // editor reads the SAVED run values and threads them through the
  // rebuild unchanged, and renders a read-only Running summary that
  // links out (same treatment as the derived Nutrition phase card).

  const [saving, setSaving] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const settings = programState?.settings ?? DEFAULT_PROGRAM_SETTINGS;

  // The per-field diff is the single source of truth: the recap shown in the
  // confirm modal and the dirty state both derive from it, so they can't drift.
  const changes = computeProgrammeChanges(saved, {
    primaryGoal,
    nutritionPhase,
    experience,
    liftDays,
    sessionMinutes,
    preferredSplit: saved.preferredSplit,
    equipment,
    barbellAtHome,
    injuries,
    // Run fields mirror `saved` — run edits live on /settings/run-plan,
    // so they can never appear in this editor's change recap.
    runMode: saved.runMode,
    weeklyRunDays: saved.weeklyRunDays,
    raceDistance: saved.raceDistance,
    raceTargetDate: saved.raceTargetDate,
    runVolume: saved.runVolume,
    runDifficulty: saved.runDifficulty,
  });
  const dirty = changes.length > 0;
  // Pgm5 (Q3): content edits now PRESERVE the user's workouts — only a
  // lift-days change re-derives the skeleton. The confirm copy must name the
  // customization reset for a day-count change, and reassure otherwise.
  const liftDaysChanged = liftDays !== saved.liftDays;
  const sessionMinutesChanged = sessionMinutes !== saved.sessionMinutes;
  // LIFT-EV-06 (owner decision 2026-08-09): a permanent goal change at the
  // SAME frequency used to be silent — buildPlan's preserve branch keeps the
  // workouts verbatim, so only the label moved. The confirm dialog now offers
  // a visible keep-or-represcribe choice (reusing the training-block
  // transform). The choice only exists when the preserve branch would run:
  // a day-count change rebuilds, and an active block owns the focus. A level
  // change never rebuilds (Lift4 (12)), so a focus changed with one still
  // needs the choice, and the new level re-aims the sessions.
  const focusChangedSameFrequency =
    primaryGoal !== saved.primaryGoal &&
    !liftDaysChanged &&
    !activeBlockFocus &&
    (programState?.workouts?.length ?? 0) > 0;

  // A plan with no race date keeps its run days (Run24 (3)).
  const effectiveRunDays =
    saved.runMode === "freeform" && !rollingGoalOf(programState, profile)
      ? 0
      : saved.weeklyRunDays;

  // ── Derived display values (P1/P2/P3 — presentational only) ───────
  // "Current setup" reflects the SAVED snapshot (not the draft), so it reads
  // as "what your programme is currently built around" and never duplicates a
  // draft option label into the DOM.
  const labelFor = (
    opts: readonly { id: string; label: string }[],
    id: string
  ): string => opts.find((o) => o.id === id)?.label ?? id;

  // P3: the engine derives the split from weekly lift days (chooseSplit); it
  // does NOT honour an explicit preference in this rebuild path. Surface the
  // split it WILL generate for the current draft so the picker reads honestly
  // rather than implying control the generation doesn't grant.
  const generatedSplitLabel = splitLabel(chooseSplit(liftDays));
  // Pgm5 (Q1): the split is shown, not chosen. Prefer the actual current
  // structure (programState.splitType); fall back to what the engine would
  // derive for the saved lift-days.
  const currentSplitLabel = splitLabel(
    programState?.splitType ?? chooseSplit(saved.liftDays)
  );

  // P2: weekly-layout preview counts, derived from the draft lift/run days
  // (consistent with the double-day warning) — no stored weekSchedule needed.
  const weekLiftDays = liftDays;
  const weekRunDays = effectiveRunDays;
  const weekDoubleDays = Math.max(0, weekLiftDays + weekRunDays - 7);
  const weekRestDays = Math.max(0, 7 - weekLiftDays - weekRunDays);

  function toggleInjury(id: string) {
    if (id === "none") {
      setInjuries((prev) => (prev.includes("none") ? [] : ["none"]));
      return;
    }
    setInjuries((prev) => {
      const withoutNone = prev.filter((i) => i !== "none");
      return prev.includes(id)
        ? withoutNone.filter((i) => i !== id)
        : [...withoutNone, id];
    });
  }

  /**
   * `represcribe` is the LIFT-EV-06 choice: re-aim the preserved workouts'
   * rep targets at the new focus via the same transform training blocks use.
   * Undo semantics (deliberate, documented in the handoff ledger): the
   * transform is invertible by re-application — changing the focus back
   * re-offers the choice in the opposite direction, so no snapshot is kept.
   */
  async function applyRebuild(represcribe = false) {
    // Not before the programme has loaded (`readiness`); the buttons wait
    // too, and this holds for any other way in.
    if (saving || readiness !== "ready") return;
    setConfirmRebuild(false);
    setSaving(true);
    try {
      const plan = buildPlan(
        liftPlanInput({
          profile,
          programState,
          saved,
          draft: {
            primaryGoal,
            experience,
            liftDays,
            sessionMinutes,
            equipment,
            barbellAtHome,
            injuries,
          },
          recentLayoff,
          recentRuns,
        })
      );

      // LIFT-EV-06: the user chose "update my sessions" — apply the block
      // transform to the preserved workouts before they travel. buildPlan's
      // preserve branch has handed back the verbatim prescription, so this
      // lands on exactly the input the training-block writers see.
      if (represcribe && focusChangedSameFrequency) {
        plan.programState.workouts = represcribeWorkouts(
          plan.programState.workouts,
          primaryGoal,
          experience,
          plan.programState.settings?.loadUnit
        );
      }

      await configureLiftPlan(plan, profile, programState);

      // configurePlan writes through the Admin SDK, outside updateProfile's
      // optimistic local-state path. Re-hydrating the authoritative profile
      // also retriggers useProgram's loader, so the form and programme cannot
      // keep showing (or later re-save) the pre-change experience/schedule.
      try {
        await refreshProfile();
      } catch (refreshErr) {
        // The atomic server write has already succeeded. Do not tell the user
        // the save failed (or invite a duplicate retry); reload as the
        // authoritative fallback, matching onboarding's post-callable path.
        logger.warn(
          "[ProgrammeSettings] plan saved but profile refresh failed; reloading",
          refreshErr
        );
        toast.success("Plan updated");
        onSaved?.();
        window.location.reload();
        return;
      }
      toast.success("Plan updated");
      onSaved?.();
    } catch (err) {
      logger.error("[ProgrammeSettings] save failed:", err);
      const rejection = planSaveRejection(
        err,
        "Your programme changed. Reopen settings to review the latest plan before saving."
      );
      if (rejection.refresh) {
        await refreshProfile().catch((error) =>
          logger.warn("Plan refresh failed", error)
        );
      }
      toast.error(rejection.message);
    } finally {
      setSaving(false);
    }
  }

  async function applyReset() {
    // As applyRebuild: a reset made while the programme loads was built
    // from no programme at all.
    if (readiness !== "ready") return;
    setConfirmReset(false);
    try {
      await regenerateProgram();
      toast.success("Programme reset");
    } catch (err) {
      logger.error("[ProgrammeSettings] reset failed:", err);
      toast.error(
        appErrorMessage(err, "Couldn’t reset your programme. Try again.")
      );
    }
  }

  /* The commit buttons (Save changes, and the dialog's Save and Reset) wait
     for the programme: the primitive's loading state while it loads, the
     label staying the name under the spinner; unavailable if the load
     failed, with one line saying so. Cancel never waits. */
  const programReady = readiness === "ready";
  const waitingForProgramme = readiness === "pending";
  const loadFailed = readiness === "failed";
  const loadFailedLine = (id: string, className: string) =>
    loadFailed ? (
      <p id={id} className={cn("text-xs text-muted-foreground", className)}>
        Couldn’t load your programme. Reopen this page to try again.
      </p>
    ) : null;
  const dialogLoadFailedId = `${loadFailedId}-dialog`;
  const confirmTitleId = `${loadFailedId}-confirm-title`;
  function commitWaits(label: string) {
    return {
      disabled: !programReady,
      loading: waitingForProgramme,
      "aria-label": waitingForProgramme ? label : undefined,
      "aria-describedby": loadFailed ? dialogLoadFailedId : undefined,
    };
  }

  /* ── Confirmation modal (the rebuild, and the reset at the foot) ──
     The shared dialog: focus moves in and stays there, Escape and the
     device's Back cancel, and focus goes back to the button that opened
     it. Above the settings sheet, as before. */
  const closeConfirm = () => {
    setConfirmRebuild(false);
    setConfirmReset(false);
  };
  const confirmModal = (
    <Dialog
      open={confirmRebuild || confirmReset}
      onClose={closeConfirm}
      role="alertdialog"
      labelledBy={confirmTitleId}
      size="md"
      overlayClassName="bg-black/60 z-[60]"
      className="z-[61] p-4 max-w-sm"
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div
            className="size-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${THEME.amber}1F` }}
          >
            <AlertTriangle className="size-4" style={{ color: THEME.amber }} />
          </div>
          <div className="min-w-0">
            <h3
              id={confirmTitleId}
              className="text-sm font-semibold text-foreground"
            >
              {confirmReset ? "Reset programme?" : "Save changes?"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {confirmReset
                ? "This rebuilds your programme from scratch with your current settings. You start again at Week 1 and past week summaries clear. Your logged workouts and runs stay in Analytics."
                : focusChangedSameFrequency
                  ? `New focus: ${labelFor(FOCUS_OPTIONS, primaryGoal)}. Update your sessions to re-aim working sets at ${focusRepSummary(primaryGoal, experience)} reps — weights adjust down where a target rises, and ${sessionMinutesChanged ? "your exercises, history and week number stay, with your sets refitted to the new session length" : "your exercises, sets, history and week number stay"}. Or keep your current sessions and change the focus only.`
                  : programmePreservationNote({
                      liftDaysChanged,
                      weekNumber: programState?.weekNumber,
                      levelChanged: experience !== saved.experience,
                      ...(sessionMinutesChanged
                        ? { sessionMinutesTo: sessionMinutes }
                        : {}),
                    })}
            </p>
          </div>
        </div>

        {/* What's changing — recap of the touched fields (rebuild only). */}
        {!confirmReset && changes.length > 0 && (
          <div className="rounded-xl bg-muted/60 px-3 py-2.5">
            <BaseSectionLabel className="mb-1.5 text-foreground">
              Changes
            </BaseSectionLabel>
            <ul className="space-y-1 max-h-44 overflow-y-auto">
              {changes.map((c) => (
                <li
                  key={c.label}
                  className="flex items-baseline justify-between gap-2 text-xs"
                >
                  <span className="text-muted-foreground shrink-0">
                    {c.label}
                  </span>
                  <span className="min-w-0 text-right font-medium text-foreground">
                    <span className="text-muted-foreground">{c.from}</span>
                    <span className="mx-1 text-muted-foreground">→</span>
                    {c.to}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {loadFailedLine(dialogLoadFailedId, "leading-relaxed")}
        {!confirmReset && focusChangedSameFrequency ? (
          /* LIFT-EV-06: the keep-or-represcribe choice. Two explicit
               saves — neither outcome is the silent default. */
          <div className="space-y-2 pt-1">
            <Button
              variant="neutral"
              fullWidth
              {...commitWaits("Save and update sessions")}
              onClick={() => void applyRebuild(true)}
            >
              Save and update sessions
            </Button>
            <Button
              variant="secondary"
              fullWidth
              {...commitWaits("Save, keep current sessions")}
              onClick={() => void applyRebuild(false)}
            >
              Save, keep current sessions
            </Button>
            <Button variant="ghost" fullWidth onClick={closeConfirm}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={closeConfirm}
            >
              Cancel
            </Button>
            <Button
              variant={confirmReset ? "destructive" : "primary"}
              className="flex-1"
              {...commitWaits(confirmReset ? "Reset" : "Save")}
              onClick={
                confirmReset ? applyReset : () => void applyRebuild(false)
              }
            >
              {confirmReset ? "Reset" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );

  return (
    <div className="space-y-6 pb-6">
      {/* Each group's controls carry their own headings, so the first
          three groups take no title above them (`ProgrammeSettingsGroup`).
          Group 1: the goal. */}
      <ProgrammeSettingsGroup>
        <div>
          <GroupHeading>Training focus</GroupHeading>
          {activeBlockFocus ? (
            /* Blk2: a block OWNS the focus while it runs, so this becomes a
               read-only display pointing at the one place that sets it —
               the same pattern PR #953 used for the split picker once the
               engine took ownership. Days, experience, equipment and
               injuries stay editable below, so an injury or an equipment
               change never costs the user their block. */
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3.5 py-3 shadow-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-body font-bold leading-tight">
                  {focusLabel(activeBlockFocus)}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  Set by your training block — change it there.
                </span>
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {FOCUS_OPTIONS.map((opt, i) => (
                <SettingsOptionCard
                  key={opt.id}
                  selected={primaryGoal === opt.id}
                  onSelect={() => setPrimaryGoal(opt.id)}
                  index={i}
                  icon={opt.icon}
                  accent={THEME.brand}
                  label={opt.label}
                  desc={opt.desc}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <GroupHeading>Experience</GroupHeading>
          <div className="space-y-2">
            {EXPERIENCE_OPTIONS.map((opt, i) => (
              <SettingsOptionCard
                key={opt.id}
                selected={experience === opt.id}
                onSelect={() => setExperience(opt.id)}
                index={i}
                icon={opt.icon}
                label={opt.label}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>
      </ProgrammeSettingsGroup>

      {/* Group 2: the week. */}
      <ProgrammeSettingsGroup>
        <div>
          <GroupHeading>Lift days per week</GroupHeading>
          <SegmentedControl
            ariaLabel="Lift days per week"
            options={[2, 3, 4, 5, 6].map((d) => ({
              value: d,
              // Numeric picker labels follow the design rule: mono + tabular.
              label: <span className="font-mono tabular-nums">{d}</span>,
            }))}
            value={liftDays}
            onChange={setLiftDays}
          />
        </div>

        <div>
          <GroupHeading>Session length</GroupHeading>
          <SegmentedControl
            ariaLabel="Minutes per lift session"
            options={SESSION_MINUTES_OPTIONS.map((n) => ({
              value: n,
              label: <SessionLengthLabel minutes={n} />,
            }))}
            value={sessionMinutes}
            onChange={setSessionMinutes}
            className="@container"
          />
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
            Your sessions are built to fit this, warm-ups and rests included.
          </p>
        </div>

        {/* Pgm5 (Q1): split is a derived DISPLAY — the coach sets it from your
            weekly training days; the user expresses preference via lift-days +
            the exercise editor, not a split toggle. */}
        <div>
          <GroupHeading>Split</GroupHeading>
          <div className="rounded-xl bg-muted px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {currentSplitLabel}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              {splitRationale(liftDays)}
              {liftDays !== saved.liftDays && (
                <>
                  {" "}
                  At <span className="font-mono tabular-nums">
                    {liftDays}
                  </span>{" "}
                  {liftDays === 1 ? "day" : "days"} it becomes{" "}
                  <span className="font-medium text-foreground">
                    {generatedSplitLabel}
                  </span>
                  .
                </>
              )}
            </p>
          </div>
        </div>

        {/* P2: weekly-layout preview — counts derived from the draft lift/run
          days; opens the existing day-by-day editor (ScheduleLayoutSheet). */}
        <div className="rounded-xl bg-muted px-3 py-2.5">
          {/* "Edit days" drops under the counts when the two no longer
              fit side by side (larger text), rather than squeezing them. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-[min(100%,8em)] flex-1">
              <p className="text-sm font-medium text-foreground">
                Weekly layout
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">{weekLiftDays}</span>{" "}
                lift
                {weekRunDays > 0 && (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {weekRunDays}
                    </span>{" "}
                    run
                  </>
                )}
                {weekDoubleDays > 0 && (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {weekDoubleDays}
                    </span>{" "}
                    double
                  </>
                )}
                {weekRestDays > 0 && (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {weekRestDays}
                    </span>{" "}
                    rest
                  </>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenWeeklyLayout}
              className="-mr-1 ml-auto inline-flex min-h-[44px] shrink-0 items-center gap-1 px-1 text-xs font-semibold text-lifting-strong transition-transform active:scale-[0.97]"
            >
              Edit days &rarr;
            </button>
          </div>
        </div>
      </ProgrammeSettingsGroup>

      {/* Group 3: what the plan works around. */}
      <ProgrammeSettingsGroup>
        <div>
          <GroupHeading>Equipment access</GroupHeading>
          <div className="space-y-2">
            {EQUIPMENT_OPTIONS.map((opt, i) => (
              <SettingsOptionCard
                key={opt.id}
                selected={equipment === opt.id}
                onSelect={() => setEquipment(opt.id)}
                index={i}
                icon={opt.icon}
                label={opt.label}
                desc={opt.desc}
              />
            ))}
          </div>
          {/* Lift4 (11): "what do you have?" beside the setups. */}
          {equipment !== "full_gym" && (
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">A barbell and a rack</p>
                <p className="text-xs text-muted-foreground">
                  Squats, deadlifts and presses with the bar.
                </p>
              </div>
              <Toggle
                checked={barbellAtHome}
                label="A barbell and a rack"
                className="ml-3"
                onChange={() => setBarbellAtHome((v) => !v)}
              />
            </div>
          )}
        </div>

        <div>
          <GroupHeading>Injuries</GroupHeading>
          <div className="space-y-2">
            {INJURY_OPTIONS.map((opt, i) => (
              <SettingsOptionCard
                key={opt.id}
                selected={injuries.includes(opt.id)}
                onSelect={() => toggleInjury(opt.id)}
                index={i}
                icon={opt.icon}
                label={opt.label}
                desc={opt.desc}
              />
            ))}
          </div>
        </div>
      </ProgrammeSettingsGroup>

      {/* ── Group 4: Advanced (engine toggles — live-save, no rebuild) ── */}
      <ProgrammeSettingsGroup
        title="Advanced"
        subtitle="These save as you switch them."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Auto progression</p>
              <p className="text-xs text-muted-foreground">
                Raises the weight or reps when you hit the target reps. Off,
                your next session keeps the weight you lifted.
              </p>
            </div>
            <Toggle
              checked={settings.autoProgression}
              label="Auto progression"
              className="ml-3"
              onChange={() =>
                updateSettings({ autoProgression: !settings.autoProgression })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">I have small plates</p>
              <p className="text-xs text-muted-foreground">
                {smallPlatesHint(settings.loadUnit ?? "kg")}
              </p>
            </div>
            <Toggle
              checked={settings.smallPlates}
              label="I have small plates"
              className="ml-3"
              onChange={() =>
                updateSettings({ smallPlates: !settings.smallPlates })
              }
            />
          </div>
        </div>
      </ProgrammeSettingsGroup>

      {afterForm}

      {/* Reset programme. It was the foot of Settings → Programme, a page
          that edited nothing; this editor is where the programme is set
          now (Trim1 call 2). */}
      <div className="pt-4">
        <SettingsGroup footer="Rebuilds your programme from Week 1. Past week summaries clear; logged workouts and runs stay in Analytics.">
          <SettingsRow
            tone="destructive"
            label="Reset programme"
            onClick={() => setConfirmReset(true)}
          />
        </SettingsGroup>
      </div>

      {/* ── Sticky save bar ── */}
      {(dirty || saving) && (
        <div
          className="sticky z-20 -mx-[16px] px-[16px] pt-3 pb-3 bg-background/92 backdrop-blur border-t border-border shadow-[0_-10px_24px_rgba(0,0,0,0.08)]"
          style={{ bottom: "calc(var(--tab-bar-height) + var(--safe-bottom))" }}
        >
          <PendingChangesSummary
            count={changes.length}
            className="mb-2 text-center"
          />
          {!saving && loadFailedLine(loadFailedId, "mb-2 text-center")}
          <Button
            variant="neutral"
            fullWidth
            onClick={() => setConfirmRebuild(true)}
            disabled={!dirty || saving || !programReady}
            loading={!saving && waitingForProgramme}
            aria-label={
              !saving && waitingForProgramme ? "Save changes" : undefined
            }
            aria-describedby={!saving && loadFailed ? loadFailedId : undefined}
            className={cn(
              // The bar's own shape and muted treatment, kept from before
              // the primitive.
              "rounded-2xl py-3.5 font-bold disabled:opacity-60",
              (!dirty || saving || !programReady) &&
                "bg-muted text-muted-foreground opacity-60"
            )}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}

      {confirmModal}
    </div>
  );
}
