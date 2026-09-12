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
 *
 * PR-2 hydration strategy: the hook is mounted by a component
 * (`ScheduleLayoutSheet`) that itself only mounts when its `open`
 * prop is true. Closing the sheet unmounts the body, tearing the
 * hook down. Opening it remounts → useState initialisers run
 * fresh → draft state reflects the latest `profile`. NO hydration
 * `useEffect` is needed; callers should keep the mount-when-open
 * pattern intact rather than reintroducing a state-syncing effect.
 */

import { useState, useMemo, useRef } from "react";
import { toast } from "@/lib/toast";
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

/* Restructure-failure copy. The two realistic shapes here are a
   Firestore write failure (permission-denied / unavailable /
   unauthenticated / deadline-exceeded) and a regenerateProgram bug
   that bubbles out. Surface what the user can do about it instead
   of a flat "Something went wrong". */
function friendlyRestructureError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "permission-denied")
    return "You don't have permission to change this schedule.";
  if (code === "unauthenticated")
    return "Please sign in again to save changes.";
  if (code === "unavailable")
    return "Couldn't save changes. Reconnect and try again.";
  if (code === "deadline-exceeded") return "Saving took too long. Try again.";
  return "Couldn't rebuild your programme. Try again.";
}

export interface UseProgrammeScheduleEditorArgs {
  profile: UserProfile | null;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  /** Signature matches useProgram.refreshRunSchedule. Optional
   *  overrides let the editor's apply path pass the freshly-
   *  confirmed weekSchedule explicitly, avoiding a stale read of
   *  `profile.weekSchedule` from useAuth's closure that hasn't
   *  yet propagated from the immediately-preceding updateProfile. */
  refreshRunSchedule: (overrides?: {
    weekSchedule?: ScheduleDay[];
    weeklyRunDaysTarget?: number;
  }) => Promise<void>;
  /** Signature matches useProgram.regenerateProgram. The third arg
   *  carries weekSchedule + weeklyRunDaysTarget overrides so the
   *  rebuild uses the user's confirmed layout rather than the pre-
   *  edit profile snapshot (see Settings comment block). */
  regenerateProgram: (
    goalOverride?: string,
    weeklyTargetOverride?: number,
    overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number }
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
  handleApplyScheduleChanges: () => Promise<
    "saved" | "confirmation-required" | "failed" | "busy"
  >;
  // Restructure modal state + handlers.
  showRestructureModal: boolean;
  pendingLiftDays: number | null;
  restructuring: boolean;
  saving: boolean;
  handleConfirmRestructure: () => Promise<boolean>;
  cancelRestructure: () => void;
}

export function useProgrammeScheduleEditor(
  args: UseProgrammeScheduleEditorArgs
): UseProgrammeScheduleEditorReturn {
  const { profile, updateProfile, refreshRunSchedule, regenerateProgram } =
    args;

  const [workoutsTarget, setWorkoutsTarget] = useState(
    profile?.weeklyWorkoutsTarget ?? 4
  );
  // PR-2: zero-as-zero. Pre-PR-2 this was `getWeeklyRunTarget(profile) || 2`
  // which silently coerced a user's explicit 0 runs into 2. Same class of
  // bug PR-0c fixed for Home's runTarget. The slider's min stays at 1 in
  // the UI; users land on the editor with 0 visible if that's their
  // genuine setting, and the chips reflect it.
  const [runsTarget, setRunsTarget] = useState(() =>
    getWeeklyRunTarget(profile)
  );
  const [customSchedule, setCustomSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : null
  );

  // Restructure warning modal — fires when the cycle handler moves
  // the weekly lift-day count. Same trigger Settings used pre-P0-7.
  const [showRestructureModal, setShowRestructureModal] = useState(false);
  const [pendingLiftDays, setPendingLiftDays] = useState<number | null>(null);
  const [pending, setPending] = useState<"save" | "rebuild" | null>(null);
  const pendingRef = useRef(false);

  // savedSchedule is the schedule at hook-mount time — we use it
  // to detect unsaved edits. Pre-P0-7 Settings captured this with
  // a useState initialiser (no setter ever called), keeping the
  // baseline frozen until the user navigates away. Same here.
  const [savedSchedule] = useState<ScheduleDay[] | null>(
    profile?.weekSchedule && profile.weekSchedule.length === 7
      ? profile.weekSchedule
      : null
  );
  const savedLiftDays = useMemo(() => {
    if (savedSchedule)
      return savedSchedule.filter((s) => s.type === "lift" || s.type === "both")
        .length;
    return profile?.weeklyWorkoutsTarget ?? 4;
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
    if (pendingRef.current) return;
    const current = schedule.find((s) => s.day === day);
    if (!current) return;
    const cycle: DayType[] = ["rest", "lift", "run", "both"];
    const nextIdx = (cycle.indexOf(current.type) + 1) % cycle.length;
    const updated = schedule.map((s) =>
      s.day === day ? { ...s, type: cycle[nextIdx] } : s
    );
    setCustomSchedule(updated);
    const newLiftDays = updated.filter(
      (s) => s.type === "lift" || s.type === "both"
    ).length;
    const newRunDays = updated.filter(
      (s) => s.type === "run" || s.type === "both"
    ).length;
    setRunsTarget(newRunDays);
    setWorkoutsTarget(newLiftDays);
  }

  async function handleApplyScheduleChanges(): Promise<
    "saved" | "confirmation-required" | "failed" | "busy"
  > {
    if (pendingRef.current) return "busy";
    const currentLiftDays = schedule.filter(
      (s) => s.type === "lift" || s.type === "both"
    ).length;
    if (currentLiftDays !== savedLiftDays && currentLiftDays > 0) {
      setPendingLiftDays(currentLiftDays);
      setShowRestructureModal(true);
      return "confirmation-required";
    }
    pendingRef.current = true;
    setPending("save");
    try {
      const result = await updateProfile({
        weekSchedule: schedule,
        weeklyWorkoutsTarget: workoutsTarget,
        ...runTargetWriteFields(runsTarget),
      });
      // updateProfile reports failures as values. It already shows its error;
      // stop here so a failed profile write cannot change the programme.
      if (!result.ok) return "failed";
      if (profile?.runMode && profile.runMode !== "freeform") {
        await refreshRunSchedule({
          weekSchedule: schedule,
          weeklyRunDaysTarget: runsTarget,
        });
      }
      return "saved";
    } catch (error) {
      logger.error("Schedule save failed:", error);
      toast.error("Couldn't finish saving your layout. Try again.");
      return "failed";
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  async function handleConfirmRestructure(): Promise<boolean> {
    if (pendingLiftDays === null || pendingRef.current) return false;
    pendingRef.current = true;
    setPending("rebuild");
    try {
      const result = await updateProfile({
        weekSchedule: schedule,
        weeklyWorkoutsTarget: workoutsTarget,
        ...runTargetWriteFields(runsTarget),
      });
      if (!result.ok) return false;
      await regenerateProgram(undefined, pendingLiftDays, {
        weekSchedule: schedule,
        weeklyRunDaysTarget: runsTarget,
      });
      setShowRestructureModal(false);
      void chooseSplit(pendingLiftDays);
      setPendingLiftDays(null);
      return true;
    } catch (error) {
      logger.error("handleConfirmRestructure failed:", error);
      toast.error(friendlyRestructureError(error));
      return false;
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  function cancelRestructure(): void {
    if (pendingRef.current) return;
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
    restructuring: pending === "rebuild",
    saving: pending !== null,
    handleConfirmRestructure,
    cancelRestructure,
  };
}
