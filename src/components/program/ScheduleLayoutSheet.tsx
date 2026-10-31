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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import {
  DAY_LABELS,
  SCHEDULE_TYPE_META,
  getWeeklyRunTarget,
  type ScheduleDay,
} from "@/lib/scheduleUtils";
import { previewWeekLayout } from "@/lib/weekReset";
import { weekPosition } from "@/lib/dateHelpers";
import { useProgrammeScheduleEditor } from "@/features/program/useProgrammeScheduleEditor";
import { chooseSplit, splitLabel } from "@/features/program/programEngine";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import type { UserProfile, UpdateProfileResult } from "@/lib/auth";

interface RefreshRunScheduleOverrides {
  weekSchedule?: ScheduleDay[];
  weeklyRunDaysTarget?: number;
}

export interface ScheduleLayoutSheetProps {
  open: boolean;
  onClose: () => void;
  /** Review before saving when entered from the Weekly Review reset. */
  guided?: boolean;
  onSaved?: () => void;
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

function layoutSourceKey(profile: UserProfile | null): string {
  return JSON.stringify({
    uid: profile?.uid ?? null,
    weekSchedule: profile?.weekSchedule ?? null,
    weeklyWorkoutsTarget: profile?.weeklyWorkoutsTarget ?? null,
    weeklyRunTarget: getWeeklyRunTarget(profile),
    runMode: profile?.runMode ?? null,
  });
}

export default function ScheduleLayoutSheet(props: ScheduleLayoutSheetProps) {
  // Mount-when-open contract: when `open` is false we return null,
  // so the body component and its `useProgrammeScheduleEditor` hook
  // never mount. Each subsequent open is a fresh mount → fresh
  // `useState` reads from `profile`. Do NOT lift the hook to this
  // component, or hydration on re-open breaks.
  if (!props.open) return null;
  return <ScheduleLayoutSheetBody {...props} />;
}

function ScheduleLayoutSheetBody({
  profile,
  updateProfile,
  refreshRunSchedule,
  regenerateProgram,
  onClose,
  guided = false,
  onSaved,
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
    scheduleError,
    handleDayToggle,
    handleApplyScheduleChanges,
    showRestructureModal,
    pendingLiftDays,
    restructuring,
    saving,
    handleConfirmRestructure,
    cancelRestructure,
  } = editor;
  const [reviewing, setReviewing] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [sourceAtOpen] = useState(() => layoutSourceKey(profile));
  const [scheduleAtOpen] = useState(() => schedule.map((day) => ({ ...day })));
  const preview = previewWeekLayout(scheduleAtOpen, schedule);
  const sourceChanged = layoutSourceKey(profile) !== sourceAtOpen;
  const draftChanged = (preview?.changes.length ?? 0) > 0;

  // Restructure confirm uses the Dialog primitive (focus trap, Escape,
  // scroll-lock); overlay/panel z lifted above the BottomSheet via props.
  /* Monday first, as setup's week preview and Train's run week are. Sorted
     on getDay() the grid began on Sunday, the only week in the app that did. */
  const sortedSchedule = schedule
    .slice()
    .sort((a, b) => weekPosition(a.day) - weekPosition(b.day));
  const liftSessions = sortedSchedule.filter(
    (s) => s.type === "lift" || s.type === "both"
  ).length;
  const runSessions = sortedSchedule.filter(
    (s) => s.type === "run" || s.type === "both"
  ).length;
  const doubleDays = sortedSchedule.filter((s) => s.type === "both").length;

  async function handleApply(): Promise<void> {
    if (guided && (!reviewing || !draftChanged || sourceChanged)) return;
    const result = await handleApplyScheduleChanges();
    if (result === "saved") {
      onSaved?.();
      onClose();
    }
  }

  async function handleConfirmAndClose(): Promise<void> {
    if (guided && sourceChanged) {
      cancelRestructure();
      return;
    }
    if (await handleConfirmRestructure()) {
      onSaved?.();
      onClose();
    }
  }

  function requestClose(): void {
    if (saving || showRestructureModal) return;
    if (guided && draftChanged) setDiscard(true);
    else onClose();
  }

  return (
    <BottomSheet
      open
      onBack={guided && reviewing ? () => setReviewing(false) : undefined}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      dismissible={!saving && !showRestructureModal && !discard}
      title={guided && reviewing ? "Review usual week" : "Edit weekly layout"}
      description={
        guided && reviewing
          ? "This changes every week from now on."
          : "Tap any day to cycle through Rest, Lift, Run, Both."
      }
    >
      <div className="@container min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 pt-4 space-y-5">
        {guided && reviewing ? (
          <>
            <Banner
              variant="neutral"
              description="This changes your usual weekly layout for future weeks. It is not a one-week adjustment. Completed sessions stay in your history."
            />
            {sourceChanged && (
              <Banner
                variant="warning"
                description="Your plan changed while this was open. Close it and try again."
              />
            )}
            {!preview ? (
              <Banner
                variant="warning"
                description="The week layout could not be checked. Close and reopen the editor."
              />
            ) : (
              <>
                <div
                  className="grid grid-cols-2 gap-2"
                  aria-label="Before and after training days"
                >
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <SectionLabel>Lift days</SectionLabel>
                    <p className="mt-1 text-base font-bold font-mono tabular-nums">
                      {preview.before.lifts} → {preview.after.lifts}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-3">
                    <SectionLabel>Run days</SectionLabel>
                    <p className="mt-1 text-base font-bold font-mono tabular-nums">
                      {preview.before.runs} → {preview.after.runs}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <SectionLabel as="h3">Changed days</SectionLabel>
                  <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-3">
                    {preview.changes.map((change) => (
                      <li
                        key={change.day}
                        className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm"
                      >
                        <span className="font-semibold">
                          {DAY_LABELS[change.day]}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {SCHEDULE_TYPE_META[change.before].label} →{" "}
                          {SCHEDULE_TYPE_META[change.after].label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                {preview.rebuildsLifts && (
                  <Banner
                    variant="warning"
                    description="Changing the number of lift days rebuilds your lift programme. You will confirm that separately before saving."
                  />
                )}
                {profile?.runMode && profile.runMode !== "freeform" && (
                  <p className="text-sm text-muted-foreground">
                    Future planned runs may be refreshed from this layout.
                  </p>
                )}
              </>
            )}
            <div className="space-y-2">
              <Button
                fullWidth
                onClick={handleApply}
                disabled={
                  saving ||
                  sourceChanged ||
                  !draftChanged ||
                  !preview ||
                  Boolean(scheduleError)
                }
                loading={saving}
              >
                Confirm usual week
              </Button>
              <Button
                fullWidth
                variant="secondary"
                disabled={saving}
                onClick={() => setReviewing(false)}
              >
                Edit days
              </Button>
              <Button
                fullWidth
                variant="ghost"
                disabled={saving}
                onClick={requestClose}
              >
                Keep current layout
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* One column under 11em of sheet (2x text on a phone), where a
                third of the row was narrower than "Both". */}
            <div
              className="grid grid-cols-3 gap-2 @max-[11em]:grid-cols-1"
              aria-label="Weekly layout summary"
            >
              {[
                /* 18px bold sits under the 18.66px large-text line, so these
               numerals take the AA text steps, not the identities. */
                {
                  label: "Lift",
                  value: liftSessions,
                  color: "hsl(var(--lifting-strong))",
                },
                {
                  label: "Run",
                  value: runSessions,
                  color: "hsl(var(--running-strong))",
                },
                {
                  /* The days' own word ("Both"), and the menu's and the
                 description's. "Double" was a second name for them. */
                  label: "Both",
                  value: doubleDays,
                  color: "hsl(var(--lifting-strong))",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/50 bg-card px-3 py-2 text-center"
                >
                  <p
                    className="text-lg font-extrabold leading-none font-figure tabular-nums"
                    style={{ color: item.color }}
                  >
                    {item.value}
                  </p>
                  <SectionLabel className="mt-1">{item.label}</SectionLabel>
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

            {guided && sourceChanged && (
              <Banner
                variant="warning"
                description="Your plan changed while this was open. Close it and try again."
              />
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
                    disabled={saving || (guided && sourceChanged)}
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
                        <div className="w-1/2 h-full bg-lifting" />
                        <div className="w-1/2 h-full bg-running" />
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
                      className="text-caption font-bold leading-none"
                      style={{ color: color || "hsl(var(--muted-foreground))" }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {scheduleError && (
              <Banner variant="warning" description={scheduleError} />
            )}

            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={requestClose}
                disabled={saving}
                className={
                  guided
                    ? "flex-1"
                    : hasUnsavedScheduleChanges
                      ? "flex-1"
                      : "w-full"
                }
              >
                {hasUnsavedScheduleChanges ? "Cancel" : "Close"}
              </Button>
              {(guided ? draftChanged : hasUnsavedScheduleChanges) && (
                <Button
                  onClick={guided ? () => setReviewing(true) : handleApply}
                  disabled={
                    saving ||
                    Boolean(scheduleError) ||
                    (guided && (sourceChanged || !preview))
                  }
                  aria-busy={saving}
                  className="flex-1"
                >
                  {saving
                    ? "Saving…"
                    : guided
                      ? "Review change"
                      : "Apply changes"}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Restructure-confirm modal — fires when the day-toggle changed
          the weekly lift count. The hook owns the gating; we render
          its surface here so the modal lives inside the same sheet
          stack (no z-index drift with the BottomSheet overlay). */}
        <Dialog
          open={showRestructureModal && pendingLiftDays !== null}
          onClose={cancelRestructure}
          closeOnBackdrop={!saving}
          closeOnEscape={!saving}
          title="Restructure programme?"
          description="Changing your training days will restructure your programme. Your workout history won't be affected, but your programme will be rebuilt. This cannot be undone."
          role="alertdialog"
          overlayClassName="z-[60]"
          className="z-[70]"
        >
          {pendingLiftDays !== null && (
            <p className="text-sm font-medium text-foreground">
              Your new programme will use a{" "}
              <span className="text-lifting-strong">
                {splitLabel(chooseSplit(pendingLiftDays))}
              </span>{" "}
              split.
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={cancelRestructure}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirmAndClose}
              disabled={restructuring}
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
            </Button>
          </div>
        </Dialog>
        <ConfirmDialog
          open={discard}
          overSheet
          title="Discard layout changes?"
          description="Your saved week will stay the same."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setDiscard(false);
            onClose();
          }}
          onCancel={() => setDiscard(false)}
        />
      </div>
    </BottomSheet>
  );
}
