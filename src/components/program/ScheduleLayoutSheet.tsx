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
import { Dialog } from "@/components/ui/Dialog";
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
    opts?: { allowProtected?: boolean }
  ) => Promise<UpdateProfileResult>;
  refreshRunSchedule: (
    overrides?: RefreshRunScheduleOverrides
  ) => Promise<void>;
  regenerateProgram: (
    goalOverride?: string,
    weeklyTargetOverride?: number,
    overrides?: { weekSchedule?: ScheduleDay[]; weeklyRunDaysTarget?: number }
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

  // Restructure confirm uses the Dialog primitive (focus trap, Escape,
  // scroll-lock); overlay/panel z lifted above the BottomSheet via props.
  const sortedSchedule = schedule.slice().sort((a, b) => a.day - b.day);
  const liftSessions = sortedSchedule.filter(
    (s) => s.type === "lift" || s.type === "both"
  ).length;
  const runSessions = sortedSchedule.filter(
    (s) => s.type === "run" || s.type === "both"
  ).length;
  const doubleDays = sortedSchedule.filter((s) => s.type === "both").length;

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
    <div className="px-5 pb-6 pt-4 space-y-5">
      <div
        className="grid grid-cols-3 gap-2"
        aria-label="Weekly layout summary"
      >
        {[
          { label: "Lift", value: liftSessions, color: THEME.lifting },
          { label: "Run", value: runSessions, color: THEME.running },
          { label: "Double", value: doubleDays, color: THEME.brand },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border/50 bg-card px-3 py-2 text-center"
          >
            <p
              className="text-lg font-extrabold leading-none tabular-nums"
              style={{ color: item.color }}
            >
              {item.value}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {hasUnsavedScheduleChanges && (
        <p
          className="rounded-xl px-3 py-2 text-xs font-medium"
          style={{
            backgroundColor: `${THEME.amber}12`,
            color: THEME.amber,
          }}
        >
          Unsaved layout changes
        </p>
      )}

      <div className="grid grid-cols-7 gap-1.5">
        {sortedSchedule.map((s) => {
          const color =
            s.type === "lift"
              ? THEME.lifting
              : s.type === "run"
                ? THEME.running
                : s.type === "both"
                  ? THEME.brand
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
              type="button"
              key={s.day}
              onClick={() => handleDayToggle(s.day)}
              aria-label={`${DAY_LABELS[s.day]}: ${label}. Tap to change.`}
              className={cn(
                "min-h-[86px] flex flex-col items-center justify-between rounded-2xl border px-1.5 py-2.5 text-center shadow-sm transition-all active:scale-[0.98]",
                s.type !== "rest"
                  ? "bg-card"
                  : "border-border/60 bg-muted/30 text-muted-foreground"
              )}
              style={
                s.type !== "rest" && color
                  ? {
                      borderColor: `${color}45`,
                      background: `${color}10`,
                    }
                  : undefined
              }
            >
              <span className="text-xs font-semibold text-muted-foreground">
                {DAY_LABELS[s.day].charAt(0)}
              </span>
              {s.type === "both" ? (
                <div className="size-4 rounded-full overflow-hidden flex shadow-sm">
                  <div
                    className="w-1/2 h-full"
                    style={{ backgroundColor: THEME.lifting }}
                  />
                  <div
                    className="w-1/2 h-full"
                    style={{ backgroundColor: THEME.running }}
                  />
                </div>
              ) : color ? (
                <div
                  className="size-4 rounded-full shadow-sm"
                  style={{ backgroundColor: color }}
                />
              ) : (
                <div className="size-4 rounded-full bg-muted-foreground/20" />
              )}
              <span
                className="text-[11px] font-bold leading-none"
                style={{ color: color || "hsl(var(--muted-foreground))" }}
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
          className={cn(
            "py-3 rounded-xl text-sm font-medium active:scale-[0.97] transition-transform",
            hasUnsavedScheduleChanges
              ? "flex-1 text-muted-foreground bg-muted"
              : "w-full text-foreground bg-card border border-border/60"
          )}
        >
          {hasUnsavedScheduleChanges ? "Cancel" : "Close"}
        </button>
        {hasUnsavedScheduleChanges && (
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleApply}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary text-primary-foreground transition-all"
          >
            Apply changes
          </motion.button>
        )}
      </div>

      {/* Restructure-confirm modal — fires when the day-toggle changed
          the weekly lift count. The hook owns the gating; we render
          its surface here so the modal lives inside the same sheet
          stack (no z-index drift with the BottomSheet overlay). */}
      <Dialog
        open={showRestructureModal && pendingLiftDays !== null}
        onClose={cancelRestructure}
        title="Restructure programme?"
        description="Changing your training days will restructure your programme. Your workout history won't be affected, but your programme will be rebuilt. This cannot be undone."
        role="alertdialog"
        overlayClassName="z-[60]"
        className="z-[70]"
      >
        {pendingLiftDays !== null && (
          <p className="text-sm font-medium text-foreground">
            Your new programme will use a{" "}
            <span className="text-primary">
              {splitLabel(chooseSplit(pendingLiftDays))}
            </span>{" "}
            split.
          </p>
        )}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={cancelRestructure}
            className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmAndClose}
            disabled={restructuring}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2"
          >
            {restructuring ? (
              <>
                <Spinner
                  size="sm"
                  variant="inverse"
                  label="Rebuilding programme"
                />
                Rebuilding...
              </>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
