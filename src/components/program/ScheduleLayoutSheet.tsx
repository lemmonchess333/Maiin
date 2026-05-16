/**
 * PR-2: weekly schedule layout editor — bottom sheet variant.
 *
 * Pre-PR-2 this UI lived inside Settings's TrainingSection. The
 * mental model was inverted: Programme is where the user thinks
 * about their training, but they had to bounce out to Settings to
 * change the day shape. PR-2 relocates the editor to the Programme
 * overflow menu's "Edit weekly layout" item.
 *
 * Hydration strategy: the parent (`Program.tsx`) renders this
 * component conditionally on `editLayoutOpen` — `{open && <Sheet… />}`.
 * When the sheet closes, the entire component unmounts (along with
 * its body and the `useProgrammeScheduleEditor` hook inside). When
 * it next opens, the hook re-mounts and its `useState` initialisers
 * re-read the current `profile`. No `useEffect`-based hydration
 * needed — the lifecycle does the work.
 *
 * The component therefore exposes two layers: the outer `ScheduleLayoutSheet`
 * (always-mounted shell, returns null when closed) and the inner
 * `ScheduleLayoutSheetBody` (mounted only when open — the hook lives
 * here). Don't merge them; merging would defeat the unmount-on-close
 * contract.
 */

import { BottomSheet } from "@/components/ui/BottomSheet";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { DAY_LABELS, type ScheduleDay } from "@/lib/scheduleUtils";
import { useProgrammeScheduleEditor } from "@/features/program/useProgrammeScheduleEditor";
import { chooseSplit, splitLabel } from "@/features/program/programEngine";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Spinner } from "@/components/ui/Spinner";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface RefreshRunScheduleOverrides {
  weekSchedule?: ScheduleDay[];
  weeklyRunDaysTarget?: number;
}

export interface ScheduleLayoutSheetProps {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  updateProfile: (
    data: Partial<UserProfile>,
    opts?: { allowProtected?: boolean },
  ) => Promise<UpdateProfileResult>;
  refreshRunSchedule: (overrides?: RefreshRunScheduleOverrides) => Promise<void>;
  regenerateProgram: (
    goalOverride?: string,
    weeklyTargetOverride?: number,
    overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number },
  ) => Promise<void>;
}

export default function ScheduleLayoutSheet(props: ScheduleLayoutSheetProps) {
  // Mount-when-open contract: when `open` is false we return null,
  // so the body component and its `useProgrammeScheduleEditor` hook
  // never mount. Each subsequent open is a fresh mount → fresh
  // `useState` reads from `profile`. Do NOT lift the hook to this
  // component, or hydration on re-open breaks.
  if (!props.open) return null;
  return (
    <BottomSheet
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Edit weekly layout"
      description="Tap any day to cycle through Rest, Lift, Run, Both."
    >
      <ScheduleLayoutSheetBody {...props} />
    </BottomSheet>
  );
}

function ScheduleLayoutSheetBody({
  profile,
  updateProfile,
  refreshRunSchedule,
  regenerateProgram,
  onClose,
}: ScheduleLayoutSheetProps) {
  const editor = useProgrammeScheduleEditor({
    profile,
    updateProfile,
    refreshRunSchedule,
    regenerateProgram,
  });
  const {
    schedule,
    hasUnsavedScheduleChanges,
    handleDayToggle,
    handleApplyScheduleChanges,
    showRestructureModal,
    pendingLiftDays,
    restructuring,
    handleConfirmRestructure,
    cancelRestructure,
  } = editor;

  const restructureRef = useFocusTrap<HTMLDivElement>(showRestructureModal);

  async function handleApply(): Promise<void> {
    await handleApplyScheduleChanges();
    // If a restructure is required the hook opens its modal and the
    // sheet stays put. If not, we just applied — close the sheet.
    if (!editor.showRestructureModal) {
      onClose();
    }
  }

  async function handleConfirmAndClose(): Promise<void> {
    await handleConfirmRestructure();
    onClose();
  }

  return (
    <div className="px-5 pb-6 pt-3 space-y-4">
      <div className="w-9 h-1 rounded-full bg-border mx-auto" />
      <div>
        <p className="text-base font-semibold text-foreground">Weekly layout</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tap any day to cycle Rest &rarr; Lift &rarr; Run &rarr; Both.
          {hasUnsavedScheduleChanges && (
            <span style={{ color: "#d97706", fontWeight: 500 }}> · unsaved changes</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {schedule
          .slice()
          .sort((a, b) => a.day - b.day)
          .map((s) => {
            const color =
              s.type === "lift"
                ? THEME.lifting
                : s.type === "run"
                  ? THEME.running
                  : s.type === "both"
                    ? THEME.lifting
                    : undefined;
            const label =
              s.type === "lift"
                ? "Lift"
                : s.type === "run"
                  ? "Run"
                  : s.type === "both"
                    ? "Both"
                    : "Rest";
            return (
              <button
                key={s.day}
                onClick={() => handleDayToggle(s.day)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-all text-center",
                  s.type !== "rest"
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/50 bg-muted/30",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {DAY_LABELS[s.day].charAt(0)}
                </span>
                {s.type === "both" ? (
                  <div className="w-3 h-3 rounded-full overflow-hidden flex">
                    <div className="w-1/2 h-full" style={{ backgroundColor: THEME.lifting }} />
                    <div className="w-1/2 h-full" style={{ backgroundColor: THEME.running }} />
                  </div>
                ) : color ? (
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-muted" />
                )}
                <span
                  className="text-xs font-medium"
                  style={{
                    color: s.type === "both" ? THEME.lifting : color || "hsl(var(--muted-foreground))",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-medium text-muted-foreground bg-muted active:scale-[0.97] transition-transform"
        >
          Close
        </button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleApply}
          disabled={!hasUnsavedScheduleChanges}
          className={cn(
            "flex-1 py-3 rounded-xl text-sm font-semibold transition-all",
            hasUnsavedScheduleChanges
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed",
          )}
        >
          Apply changes
        </motion.button>
      </div>

      {/* Restructure-confirm modal — fires when the day-toggle changed
          the weekly lift count. The hook owns the gating; we render
          its surface here so the modal lives inside the same sheet
          stack (no z-index drift with the BottomSheet overlay). */}
      {showRestructureModal && pendingLiftDays !== null && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            role="button"
            tabIndex={0}
            aria-label="Close dialog"
            onClick={cancelRestructure}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") cancelRestructure();
            }}
          />
          <div
            ref={restructureRef}
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[70] bg-card rounded-2xl p-4 space-y-4 max-w-sm mx-auto shadow-xl"
          >
            <h3 className="text-base font-semibold text-foreground">Restructure programme?</h3>
            <p className="text-sm text-muted-foreground">
              Changing your training days will restructure your programme. Your workout
              history won&apos;t be affected, but your programme will be rebuilt. This
              cannot be undone.
            </p>
            <p className="text-sm font-medium text-foreground">
              Your new programme will use a{" "}
              <span className="text-primary">{splitLabel(chooseSplit(pendingLiftDays))}</span> split.
            </p>
            <div className="flex gap-2">
              <button
                onClick={cancelRestructure}
                className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAndClose}
                disabled={restructuring}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2"
              >
                {restructuring ? (
                  <>
                    <Spinner size="sm" variant="inverse" label="Rebuilding programme" />
                    Rebuilding...
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
