/**
 * P0-7: shared weekly-schedule editor.
 *
 * Until now the schedule editor lived inline in `Settings.tsx` and
 * piped through `TrainingSection`. Programme's Run + Week tabs in
 * P0-8 will let users edit the same weekSchedule from a different
 * surface — extracting the state machine into a hook means the two
 * call sites can't drift on edge cases like "user flips Mon Rest →
 * Lift, lift count went 4 → 5, prompt for restructure".
 *
 * Inputs intentionally minimal:
 *   - `profile`: source of initial schedule + targets. The hook
 *     re-derives a fresh editor state whenever the profile reference
 *     changes (e.g. after a successful save).
 *   - `updateProfile`, `refreshRunSchedule`, `regenerateProgram`:
 *     side-effect surface, injected so the hook stays unit-testable
 *     against fake implementations.
 *
 * What this hook owns:
 *   - editable `workoutsTarget` + `runsTarget` (mutated by cycle
 *     handler, surfaced for the +/− steppers on TrainingSection).
 *   - `customSchedule` (the user's in-progress edits) and the
 *     stable `savedSchedule` snapshot (for diff comparison).
 *   - derived `schedule` (custom if set, else generateSchedule).
 *   - derived `hasUnsavedScheduleChanges`.
 *   - restructure-modal state: when applying changes that move the
 *     weekly lift-day count, surface a confirmation modal so users
 *     understand their lift programme will rebuild.
 *
 * What this hook deliberately does NOT own:
 *   - `mealsTarget`, `weightKg`, `heightCm` etc. — those belong to
 *     Settings's profile-form state. The hook is scoped to the
 *     training schedule only.
 *   - Race-goal state — that lives next to it in TrainingSection
 *     and writes via `updateProfile` directly. Pulling it in would
 *     widen the surface beyond what P0-8 / P0-9 need.
 */

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import {
  generateSchedule,
  getWeeklyRunTarget,
  runTargetWriteFields,
  type ScheduleDay,
  type DayType,
} from "@/lib/scheduleUtils";
import { chooseSplit } from "./programEngine";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

export interface UseProgrammeScheduleEditorArgs {
  profile: UserProfile | null;
  updateProfile: (data: Partial<UserProfile>, opts?: { allowProtected?: boolean }) => Promise<UpdateProfileResult>;
  /** Signature matches useProgram.refreshRunSchedule. Optional
   *  overrides let the editor's apply path pass the freshly-
   *  confirmed weekSchedule explicitly, avoiding a stale read of
   *  `profile.weekSchedule` from useAuth's closure that hasn't
   *  yet propagated from the immediately-preceding updateProfile. */
  refreshRunSchedule: (overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number }) => Promise<void>;
  /** Signature matches useProgram.regenerateProgram. The third arg
   *  carries weekSchedule + weeklyRunDaysTarget overrides so the
   *  rebuild uses the user's confirmed layout rather than the pre-
   *  edit profile snapshot (see Settings comment block). */
  regenerateProgram: (
    goalOverride?: string,
    weeklyTargetOverride?: number,
    overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number },
  ) => Promise<void>;
}

export interface UseProgrammeScheduleEditorReturn {
  // Current edit state.
  workoutsTarget: number;
  runsTarget: number;
  schedule: ScheduleDay[];
  hasUnsavedScheduleChanges: boolean;
  // Setters for the +/− stepper UI in TrainingSection.
  setWorkoutsTarget: (n: number) => void;
  setRunsTarget: (n: number) => void;
  // Type-cycle handler used by the weekly chip row.
  handleDayToggle: (day: number) => void;
  // Save flow — opens the restructure modal when the lift-day count
  // changed, otherwise updates the profile directly.
  handleApplyScheduleChanges: () => Promise<void>;
  // Restructure modal state + handlers.
  showRestructureModal: boolean;
  pendingLiftDays: number | null;
  restructuring: boolean;
  handleConfirmRestructure: () => Promise<void>;
  cancelRestructure: () => void;
}

export function useProgrammeScheduleEditor(
  args: UseProgrammeScheduleEditorArgs,
): UseProgrammeScheduleEditorReturn {
  const { profile, updateProfile, refreshRunSchedule, regenerateProgram } = args;

  const [workoutsTarget, setWorkoutsTarget] = useState(profile?.weeklyWorkoutsTarget || 4);
  const [runsTarget, setRunsTarget] = useState(getWeeklyRunTarget(profile) || 2);
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7 ? profile.weekSchedule : null,
  );

  // Restructure warning modal — fires when the cycle handler moves
  // the weekly lift-day count. Same trigger Settings used pre-P0-7.
  const [showRestructureModal, setShowRestructureModal] = useState(false);
  const [pendingLiftDays, setPendingLiftDays] = useState<number | null>(null);
  const [restructuring, setRestructuring] = useState(false);

  // savedSchedule is the schedule at hook-mount time — we use it
  // to detect unsaved edits. Pre-P0-7 Settings captured this with
  // a useState initialiser (no setter ever called), keeping the
  // baseline frozen until the user navigates away. Same here.
  const [savedSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7 ? profile.weekSchedule : null,
  );
  const savedLiftDays = useMemo(() => {
    if (savedSchedule) return savedSchedule.filter((s) => s.type === "lift" || s.type === "both").length;
    return profile?.weeklyWorkoutsTarget || 4;
  }, [savedSchedule, profile?.weeklyWorkoutsTarget]);

  // Derived current schedule. Custom (in-progress edits) wins; falls
  // back to the canonical `generateSchedule` output keyed on the
  // current targets so the targets-only path (no day-toggles) still
  // shows a sensible layout.
  const schedule = useMemo<ScheduleDay[]>(() => {
    if (customSchedule) return customSchedule;
    return generateSchedule(workoutsTarget, runsTarget);
  }, [workoutsTarget, runsTarget, customSchedule]);

  const hasUnsavedScheduleChanges = useMemo(() => {
    if (!customSchedule) return false;
    if (!savedSchedule) return true;
    return customSchedule.some((s, i) => s.type !== savedSchedule[i]?.type);
  }, [customSchedule, savedSchedule]);

  function handleDayToggle(day: number): void {
    const current = schedule.find((s) => s.day === day);
    if (!current) return;
    const cycle: DayType[] = ["rest", "lift", "run", "both"];
    const nextIdx = (cycle.indexOf(current.type) + 1) % cycle.length;
    const updated = schedule.map((s) => (s.day === day ? { ...s, type: cycle[nextIdx] } : s));
    setCustomSchedule(updated);
    const newLiftDays = updated.filter((s) => s.type === "lift" || s.type === "both").length;
    const newRunDays = updated.filter((s) => s.type === "run" || s.type === "both").length;
    setRunsTarget(newRunDays);
    setWorkoutsTarget(newLiftDays);
  }

  async function handleApplyScheduleChanges(): Promise<void> {
    const currentLiftDays = schedule.filter((s) => s.type === "lift" || s.type === "both").length;
    if (currentLiftDays !== savedLiftDays && currentLiftDays > 0) {
      setPendingLiftDays(currentLiftDays);
      setShowRestructureModal(true);
      return;
    }
    await updateProfile({
      weekSchedule: schedule,
      weeklyWorkoutsTarget: workoutsTarget,
      ...runTargetWriteFields(runsTarget),
    });
    if (profile?.runMode && profile.runMode !== "freeform") {
      // PR-0b-ii: pass the freshly-confirmed schedule explicitly.
      // useAuth's profile closure may not yet reflect the
      // updateProfile above by the time refreshRunSchedule reads
      // it, so without the override refreshRunSchedule could
      // regenerate runDays against a stale schedule.
      await refreshRunSchedule({
        weekSchedule: schedule,
        weeklyRunDaysTarget: runsTarget,
      });
    }
  }

  async function handleConfirmRestructure(): Promise<void> {
    if (pendingLiftDays === null) return;
    setRestructuring(true);
    try {
      // Save profile FIRST so subsequent reads (and the
      // refreshRunSchedule fallback) see the new schedule. Then pass
      // the new schedule directly into regenerateProgram via the
      // `overrides` param so the run scheduler uses the user's
      // confirmed layout, not the pre-edit profile state.
      await updateProfile({
        weekSchedule: schedule,
        weeklyWorkoutsTarget: workoutsTarget,
        ...runTargetWriteFields(runsTarget),
      });
      await regenerateProgram(undefined, pendingLiftDays, {
        weekSchedule: schedule,
        weeklyRunDaysTarget: runsTarget,
      });
      // PR-0b-ii: removed redundant refreshRunSchedule() call.
      // regenerateProgram above already used the confirmed schedule
      // via the `overrides` arg, so a second pass through
      // refreshRunSchedule would just re-write the same runDays
      // against the same weekSchedule. The race-prep path would
      // also reset currentWeek to 0 inside regenerate AND then
      // refresh — pointless double work + extra Firestore write.
      setShowRestructureModal(false);
      // chooseSplit invocation kept for parity with the pre-P0-7
      // Settings code — it doesn't toast but pinning the call
      // surfaces an exception if the lift-day count ever drifts out
      // of the chooseSplit domain. void to silence the unused-expr
      // lint.
      const newSplit = chooseSplit(pendingLiftDays);
      setPendingLiftDays(null);
      void newSplit;
    } catch (error) {
      logger.error("handleConfirmRestructure failed:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRestructuring(false);
    }
  }

  function cancelRestructure(): void {
    setShowRestructureModal(false);
    setPendingLiftDays(null);
  }

  return {
    workoutsTarget,
    runsTarget,
    schedule,
    hasUnsavedScheduleChanges,
    setWorkoutsTarget,
    setRunsTarget,
    handleDayToggle,
    handleApplyScheduleChanges,
    showRestructureModal,
    pendingLiftDays,
    restructuring,
    handleConfirmRestructure,
    cancelRestructure,
  };
}
