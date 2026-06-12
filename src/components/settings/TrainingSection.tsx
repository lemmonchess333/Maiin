import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Target,
  ChevronRight,
  RefreshCw,
  Minus,
  Plus,
  Check,
  Flag,
  Calendar,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";
import {
  generateSchedule,
  getWeeklyRunTarget,
  runTargetWriteFields,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { setRaceGoalPatch } from "@/features/program/runModeResolution";
import type { PreferredSplit } from "@/features/program/programTypes";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import RunFitnessSection from "./RunFitnessSection";
import HeartRateZonesSection from "./HeartRateZonesSection";

/**
 * Set1.1 + A1c + Run8: TrainingSection hosts post-onboarding plan
 * structure editing.
 *
 * Run8 grill (see `/root/.claude/plans/gentle-giggling-creek.md`)
 * consolidates Run mode + race goal into this page so the
 * Programme-page mode pills + inline race-goal form can be removed
 * in PR1. Today's surface is split into THREE labelled sub-sections:
 *
 *   1. Run plan — mode picker (Freeform / Structured / Race Prep),
 *      race goal editor (race_prep only), run days/week stepper
 *   2. Lift plan — lift days/week stepper, lift split picker
 *   3. Weekly layout — entry into ScheduleLayoutSheet (sheet itself
 *      is mounted by the parent SettingsTraining page)
 *
 * Each control writes immediately on change (iOS Settings live-save
 * convention). Mode writes compose `updateProfile` + `refreshRunSchedule`
 * with retry-once-on-failure — same pattern as ProgrammeRunSection
 * uses today. Once PR1 ships, ProgrammeRunSection's inline mode + race
 * surfaces go away and this becomes the only canonical destination.
 *
 * Locked vocabulary (Run8-Vocab in `programme-run-followups.md`):
 *   - Mode pills: "Freeform" / "Structured" / "Race Prep"
 *   - Race distance: "5K" / "10K" / "Half" / "Full"
 */

type RunMode = "freeform" | "structured" | "race_prep";
type RaceDistance = "5k" | "10k" | "half" | "marathon";

const SPLIT_OPTIONS: { id: PreferredSplit; label: string }[] = [
  { id: "full_body", label: "Full Body" },
  { id: "upper_lower", label: "Upper / Lower" },
  { id: "ppl", label: "Push / Pull / Legs" },
  { id: "bro_split", label: "Bro Split" },
  { id: "auto", label: "Auto" },
];

const MODE_DESCRIPTIONS: Record<RunMode, string> = {
  freeform: "Pick any run type when you start",
  structured: "Auto-assigns run templates to your run days",
  race_prep: "Follows a race training plan",
};

interface RefreshRunScheduleOverrides {
  weekSchedule?: ScheduleDay[];
  weeklyRunDaysTarget?: number;
}

interface TrainingSectionProps {
  profile: UserProfile;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean; throwOnError?: boolean }
  ) => Promise<UpdateProfileResult>;
  refreshRunSchedule: (
    overrides?: RefreshRunScheduleOverrides
  ) => Promise<void>;
  navigate: (path: string, opts?: { state?: Record<string, unknown> }) => void;
  /** Opens the ScheduleLayoutSheet, which the parent
   *  `SettingsTraining` page mounts and owns the state for. */
  onOpenWeeklyLayout: () => void;
}

export default function TrainingSection({
  profile,
  updateProfile,
  refreshRunSchedule,
  navigate,
  onOpenWeeklyLayout,
}: TrainingSectionProps) {
  // Existing controls — frequency + split state.
  const [liftDays, setLiftDays] = useState<number>(
    profile.weeklyWorkoutsTarget ?? 4
  );
  const [runDays, setRunDays] = useState<number>(() =>
    getWeeklyRunTarget(profile)
  );
  const [split, setSplit] = useState<PreferredSplit>(
    (profile.preferredSplit as PreferredSplit | undefined) ?? "auto"
  );
  const [pending, setPending] = useState<
    "liftDays" | "runDays" | "split" | null
  >(null);

  // Run8 — mode + race state. Mirrors ProgrammeRunSection's local
  // state so the same writer pattern applies. Once PR1 deletes the
  // Programme-page version, this becomes the only consumer.
  const currentMode = (profile.runMode ?? "freeform") as RunMode;
  const [intentMode, setIntentMode] = useState<RunMode | null>(null);
  const [modeChangePending, setModeChangePending] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  // Race form: open when user taps Race Prep chip AND has no goal yet,
  // OR when they explicitly tap "Edit" on a saved goal.
  const [showRaceForm, setShowRaceForm] = useState<boolean>(
    currentMode === "race_prep" && !profile.raceGoal
  );
  const [raceDistance, setRaceDistance] = useState<RaceDistance>(
    (profile.raceGoal?.distance as RaceDistance) ?? "10k"
  );
  const [raceTargetDate, setRaceTargetDate] = useState<string>(
    profile.raceGoal?.targetDate ?? ""
  );
  const [savingRaceGoal, setSavingRaceGoal] = useState(false);

  // Visual selection — mirrors ProgrammeRunSection's three-layer
  // resolution: showRaceForm > intentMode > currentMode.
  const selectedMode: RunMode = showRaceForm
    ? "race_prep"
    : (intentMode ?? currentMode);

  // ── Frequency / split writers (existing) ──────────────────────────

  async function persist(
    field: "liftDays" | "runDays" | "split",
    patch: Partial<UserProfile>,
    revert: () => void
  ): Promise<void> {
    if (pending) return;
    setPending(field);
    try {
      await updateProfile(patch, { throwOnError: true });
    } catch (e) {
      logger.error(`[TrainingSection] ${field} write failed`, e);
      revert();
      toast.error("Couldn't save plan structure. Try again.", {
        id: "training-prefs-save",
      });
    } finally {
      setPending(null);
    }
  }

  function handleLiftDaysChange(delta: number): void {
    const next = Math.max(2, Math.min(7, liftDays + delta));
    if (next === liftDays) return;
    const prev = liftDays;
    setLiftDays(next);
    haptic();
    void persist(
      "liftDays",
      {
        weeklyWorkoutsTarget: next,
        weekSchedule: generateSchedule(next, runDays),
      },
      () => setLiftDays(prev)
    );
  }

  function handleRunDaysChange(delta: number): void {
    const next = Math.max(0, Math.min(7, runDays + delta));
    if (next === runDays) return;
    const prev = runDays;
    setRunDays(next);
    haptic();
    void persist(
      "runDays",
      {
        ...runTargetWriteFields(next),
        weekSchedule: generateSchedule(liftDays, next),
      },
      () => setRunDays(prev)
    );
  }

  function handleSplitChange(nextSplit: PreferredSplit): void {
    if (nextSplit === split) return;
    const prev = split;
    setSplit(nextSplit);
    haptic();
    void persist("split", { preferredSplit: nextSplit }, () => setSplit(prev));
  }

  // ── Mode + race writers (Run8) ────────────────────────────────────
  //
  // Ported from ProgrammeRunSection.tsx's handleModeChange +
  // handleSaveRaceGoal. PR1 deletes the Programme-page versions;
  // until then they coexist (both write through the same writers).

  async function handleModeChange(newMode: RunMode): Promise<void> {
    if (modeChangePending) return;
    setModeError(null);

    // Race Prep is form-mediated — tap reveals the form, doesn't
    // write directly. Form save handles the runMode + raceGoal write.
    if (newMode === "race_prep") {
      setShowRaceForm(true);
      return;
    }

    // Tap on active mode: clear any open form / pending state.
    if (newMode === currentMode) {
      setShowRaceForm(false);
      setIntentMode(null);
      return;
    }

    setIntentMode(newMode);
    setModeChangePending(true);
    try {
      // Only freeform reaches here (race_prep is form-mediated above; the
      // structured pill was retired in Run9 3a). Defensive `if` keeps the
      // function correct if ever called with a legacy mode.
      if (newMode === "freeform") {
        // Run9 3a-ii: switching to freeform is "I have no race" — CLEAR the
        // race goal so the materialized runMode (derived from raceGoal
        // presence) and the goal can't disagree. setRaceGoalPatch(null) emits
        // { raceGoal: null, runMode: "freeform" } in one patch. The cast
        // bridges the pure core's loose `distance: string` to UserProfile's
        // narrow union — irrelevant here since the value is null.
        await updateProfile(setRaceGoalPatch(null) as Partial<UserProfile>, {
          throwOnError: true,
        });
        try {
          await refreshRunSchedule({ weekSchedule: profile.weekSchedule });
        } catch (e) {
          logger.warn(
            "[TrainingSection] freeform refresh failed once, retrying",
            e
          );
          try {
            await refreshRunSchedule({ weekSchedule: profile.weekSchedule });
          } catch (e2) {
            logger.error("[TrainingSection] freeform refresh failed twice", e2);
            setModeError(
              "Mode changed, but the run schedule didn't refresh. Try again."
            );
          }
        }
      }
      setIntentMode(null);
    } catch (e) {
      logger.error("[TrainingSection] mode change updateProfile failed", e);
      setIntentMode(null);
      toast.error("Couldn't change run mode. Please try again.", {
        id: "run-mode-change",
      });
    } finally {
      setModeChangePending(false);
    }
  }

  async function handleSaveRaceGoal(): Promise<void> {
    if (!raceTargetDate) {
      toast.error("Please select a target date", { id: "race-goal" });
      return;
    }
    const target = new Date(raceTargetDate);
    const now = new Date();
    if (target.getTime() < now.getTime()) {
      toast.error("Target date is in the past", { id: "race-goal" });
      return;
    }
    const weeksAway = Math.round(
      (target.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    if (weeksAway < 3) {
      toast.error("Target date must be at least 3 weeks away", {
        id: "race-goal",
      });
      return;
    }
    setSavingRaceGoal(true);
    setModeError(null);
    try {
      // Route through setRaceGoalPatch — the single materialization source
      // for the raceGoal→runMode invariant (mirrors the clear path above).
      // It emits { raceGoal, runMode: "race_prep" } in one patch. The cast
      // bridges the pure core's loose `distance: string` to UserProfile's
      // narrow RaceDistance union.
      await updateProfile(
        setRaceGoalPatch({
          distance: raceDistance,
          targetDate: raceTargetDate,
        }) as Partial<UserProfile>,
        { throwOnError: true }
      );
      const target3 = getWeeklyRunTarget(profile) || 3;
      try {
        await refreshRunSchedule({
          weekSchedule: profile.weekSchedule,
          weeklyRunDaysTarget: target3,
        });
      } catch (e) {
        logger.warn("[TrainingSection] race refresh failed once, retrying", e);
        try {
          await refreshRunSchedule({
            weekSchedule: profile.weekSchedule,
            weeklyRunDaysTarget: target3,
          });
        } catch (e2) {
          logger.error("[TrainingSection] race refresh failed twice", e2);
          setModeError(
            "Race goal saved, but the plan didn't regenerate. Try again."
          );
        }
      }
      toast.success("Race plan created", { id: "race-goal" });
      setShowRaceForm(false);
    } catch (e) {
      logger.error("[TrainingSection] race save updateProfile failed", e);
      toast.error("Couldn't save your race goal. Please try again.", {
        id: "race-goal",
      });
    } finally {
      setSavingRaceGoal(false);
    }
  }

  function handleCancelRaceForm(): void {
    setShowRaceForm(false);
    setIntentMode(null);
  }

  // ── Render ────────────────────────────────────────────────────────

  const hasRaceGoal = !!profile.raceGoal && currentMode === "race_prep";

  return (
    <div className="space-y-5">
      {/* ── Run plan section ──────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel tier="section">Run plan</SectionLabel>

        {/* Mode picker. Run9 (3a) retired the user-selectable `structured`
            mode — running is freeform by default; a race goal is the only
            "plan". `structured` stays a valid stored value for legacy data +
            migration, just not offered here. */}
        <div className="rounded-xl bg-card border border-border/40 p-3 space-y-2">
          <p className="text-sm font-medium text-foreground">Mode</p>
          <div role="radiogroup" aria-label="Run mode" className="flex gap-2">
            {(["freeform", "race_prep"] as const).map((mode) => {
              const isSelected = selectedMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleModeChange(mode)}
                  disabled={modeChangePending}
                  className={cn(
                    "flex-1 min-h-[44px] px-3 rounded-lg text-xs font-medium",
                    "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
                    isSelected
                      ? "bg-running text-white"
                      : "bg-muted text-muted-foreground",
                    modeChangePending &&
                      !isSelected &&
                      "opacity-40 cursor-not-allowed"
                  )}
                >
                  {mode === "race_prep"
                    ? "Race Prep"
                    : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {MODE_DESCRIPTIONS[selectedMode]}
          </p>
          {modeChangePending ? (
            <p className="text-xs text-muted-foreground">Updating your plan…</p>
          ) : modeError ? (
            <p className="text-xs text-running" role="alert">
              {modeError}
            </p>
          ) : null}
        </div>

        {/* Race goal — summary card OR editor form */}
        {selectedMode === "race_prep" && (
          <>
            {hasRaceGoal && !showRaceForm && (
              <div className="rounded-xl bg-card border border-border/40 px-3 py-2.5 flex items-center gap-2.5">
                <Flag
                  className="size-4 shrink-0 text-running"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Race goal
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.raceGoal!.distance === "marathon"
                      ? "Marathon"
                      : profile.raceGoal!.distance === "half"
                        ? "Half Marathon"
                        : profile.raceGoal!.distance.toUpperCase()}
                    {" · "}
                    {profile.raceGoal!.targetDate}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setShowRaceForm(true);
                  }}
                  className="text-xs font-semibold text-primary hover:text-primary/80 motion-safe:active:scale-95"
                >
                  Edit
                </button>
              </div>
            )}

            {showRaceForm && (
              <div className="rounded-xl bg-card border border-border/40 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Flag className="size-4 text-running" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">
                    {profile.raceGoal ? "Edit race goal" : "Set your race goal"}
                  </p>
                </div>
                <fieldset>
                  <SectionLabel as="legend">Distance</SectionLabel>
                  <div className="flex gap-1.5 mt-1.5">
                    {(["5k", "10k", "half", "marathon"] as const).map((d) => {
                      const isSel = raceDistance === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setRaceDistance(d)}
                          className={cn(
                            "flex-1 min-h-[44px] rounded-lg text-xs font-medium motion-safe:transition-all",
                            isSel
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {d === "half"
                            ? "Half"
                            : d === "marathon"
                              ? "Full"
                              : d.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div>
                  <label
                    htmlFor="settings-race-target-date"
                    className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Calendar className="size-3" aria-hidden="true" />
                    Target date
                  </label>
                  <input
                    id="settings-race-target-date"
                    type="date"
                    value={raceTargetDate}
                    onChange={(e) => setRaceTargetDate(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={handleCancelRaceForm}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveRaceGoal}
                    disabled={savingRaceGoal || !raceTargetDate}
                  >
                    {savingRaceGoal
                      ? "Creating plan…"
                      : profile.raceGoal
                        ? "Save race goal"
                        : "Create race plan"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Run days/week stepper */}
        <div className="flex items-center justify-between rounded-xl bg-card border border-border/40 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">
            Run days / week
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease run days"
              onClick={() => handleRunDaysChange(-1)}
              disabled={pending !== null || runDays <= 0}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="font-mono tabular-nums text-sm font-semibold min-w-[1.5rem] text-center">
              {runDays}
            </span>
            <button
              type="button"
              aria-label="Increase run days"
              onClick={() => handleRunDaysChange(1)}
              disabled={pending !== null || runDays >= 7}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Adaptive Paces — your running fitness ─────────────────── */}
      <RunFitnessSection profile={profile} updateProfile={updateProfile} />

      {/* ── Heart-rate zones ──────────────────────────────────────── */}
      <HeartRateZonesSection updateProfile={updateProfile} />

      {/* ── Lift plan section ─────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel tier="section">Lift plan</SectionLabel>

        {/* Lift days stepper */}
        <div className="flex items-center justify-between rounded-xl bg-card border border-border/40 px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">
            Lift days / week
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease lift days"
              onClick={() => handleLiftDaysChange(-1)}
              disabled={pending !== null || liftDays <= 2}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Minus className="size-4" />
            </button>
            <span className="font-mono tabular-nums text-sm font-semibold min-w-[1.5rem] text-center">
              {liftDays}
            </span>
            <button
              type="button"
              aria-label="Increase lift days"
              onClick={() => handleLiftDaysChange(1)}
              disabled={pending !== null || liftDays >= 7}
              className="size-11 rounded-lg bg-muted text-foreground inline-flex items-center justify-center motion-safe:active:scale-95 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Lift split picker */}
        <div className="rounded-xl bg-card border border-border/40 px-3 py-2.5 space-y-2">
          <p className="text-sm font-medium text-foreground">Lift split</p>
          <div
            role="radiogroup"
            aria-label="Lift split"
            className="flex flex-wrap gap-1.5"
          >
            {SPLIT_OPTIONS.map((opt) => {
              const isSelected = split === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSplitChange(opt.id)}
                  disabled={pending !== null && pending !== "split"}
                  className={cn(
                    "px-3 min-h-[44px] rounded-lg text-xs font-medium inline-flex items-center gap-1",
                    "motion-safe:transition-colors motion-safe:active:scale-[0.97]",
                    isSelected
                      ? "bg-primary-strong text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                    pending !== null &&
                      pending !== "split" &&
                      "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSelected ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : null}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Weekly layout section ─────────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel tier="section">Weekly layout</SectionLabel>
        <button
          type="button"
          onClick={() => {
            haptic();
            onOpenWeeklyLayout();
          }}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-card border border-border/40 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Edit weekly layout
            </p>
            <p className="text-xs text-muted-foreground">
              Choose which days are lift, run, or rest
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Existing links (unchanged) ────────────────────────────── */}
      <button
        type="button"
        onClick={() => {
          haptic();
          navigate("/program");
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
      >
        <Target className="size-4 text-primary" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Open Train</p>
          <p className="text-xs text-muted-foreground">
            Today's training, week strip, run history
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          haptic();
          // Pgm4: programme editing is now the unified ProgrammeSettings
          // screen at /settings/training — the onboarding-retake was retired
          // (no app re-runs onboarding to edit settings). This legacy row
          // just deep-links there.
          navigate("/settings/training");
        }}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
      >
        <RefreshCw className="size-4 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 text-left">
          <p className="text-sm font-medium">Edit programme</p>
          <p className="text-xs text-muted-foreground">
            Update goals, days, equipment or injuries &mdash; we&apos;ll rebuild
            your plan
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </motion.button>
    </div>
  );
}
