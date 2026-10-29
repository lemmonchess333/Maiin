import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { parseLocalDate, weekPosition } from "@/lib/dateHelpers";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";
import {
  resolveRunMoveOptions,
  runMoveSourceSignature,
  runMoveCompletionEvidence,
  type MoveBlockReason,
  type MoveWarning,
  type RunMovePrecondition,
} from "@/lib/runReschedule";
import type { ScheduledRunDay } from "@/features/program/programTypes";
import type { ProgramOutcome } from "@/features/program/programOutcome";
import type { SavedRun } from "@/lib/savedRuns";
import type { ScheduleDay } from "@/lib/scheduleUtils";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import { cn } from "@/lib/utils";

interface Props {
  runs: ScheduledRunDay[];
  allRuns: ScheduledRunDay[];
  savedRuns: readonly SavedRun[];
  runDescriptions?: Record<string, string>;
  weekSchedule: ScheduleDay[];
  todayKey: string;
  nextLiftName?: string;
  initialRunId?: string;
  /** Completion evidence or a session can change while the sheet is open. */
  blocked: boolean;
  onClose: () => void;
  onMove: (
    id: string,
    target: number,
    expected: RunMovePrecondition
  ) => Promise<ProgramOutcome>;
  onResult: (outcome: ProgramOutcome, message: string) => void;
}

const BLOCK_COPY: Record<MoveBlockReason, string> = {
  same: "Current day",
  past: "That date has passed",
  occupied: "A run is already here",
  race: "Race day stays on its date",
  post_race: "After this week's race",
  malformed: "This date is unavailable",
};
const WARNING_COPY: Record<MoveWarning, string> = {
  clashes_lift: "This demanding run will share a lifting day.",
  beside_hard: "This demanding run will be beside another demanding run.",
};

function dateLabel(key: string): string {
  return formatShortWeekdayDayMonth(parseLocalDate(key));
}

function plannedRunName(run: ScheduledRunDay): string {
  return (
    RUN_TEMPLATES.find((t) => t.id === (run.userOverride || run.templateId))
      ?.name ?? `${run.type.charAt(0).toUpperCase()}${run.type.slice(1)} run`
  );
}

/** One local draft. It unmounts on close, so a new opening reads fresh truth. */
export default function MoveRunSheet({
  runs,
  allRuns,
  savedRuns,
  runDescriptions,
  weekSchedule,
  todayKey,
  nextLiftName,
  initialRunId,
  blocked,
  onClose,
  onMove,
  onResult,
}: Props) {
  const initial = runs.find((r) => r.id === initialRunId) ?? runs[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const [expected, setExpected] = useState<RunMovePrecondition | null>(
    initial
      ? {
          sourceSignature: runMoveSourceSignature(initial),
          todayKey,
          completionEvidence: runMoveCompletionEvidence(allRuns, savedRuns),
        }
      : null
  );
  const [target, setTarget] = useState<number | null>(null);
  const [review, setReview] = useState(false);
  const [reviewContext, setReviewContext] = useState("");
  const [reviewSource, setReviewSource] = useState<ScheduledRunDay | null>(
    null
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [review]);
  const source = runs.find((r) => r.id === selectedId);
  const stale =
    blocked ||
    !source ||
    !expected ||
    expected.todayKey !== todayKey ||
    expected.completionEvidence !==
      runMoveCompletionEvidence(allRuns, savedRuns) ||
    expected.sourceSignature !== runMoveSourceSignature(source);
  const options = useMemo(
    () =>
      source
        ? resolveRunMoveOptions({
            source,
            runDays: allRuns,
            weekSchedule,
            todayKey,
          }).sort((a, b) => weekPosition(a.dayIndex) - weekPosition(b.dayIndex))
        : [],
    [source, allRuns, weekSchedule, todayKey]
  );
  const option = options.find((o) => o.dayIndex === target);
  const warning = option?.warning;
  const previewContext = `${selectedId}|${target}|${option?.date}|${warning}|${JSON.stringify(weekSchedule)}`;
  const staleReview = review && reviewContext !== previewContext;
  const valid = !stale && !staleReview && !!option?.available;
  const changed = target !== null;

  function closeRequested() {
    if (pending.current) return;
    if (changed) setDiscard(true);
    else onClose();
  }
  function back() {
    if (pending.current) return;
    if (review) {
      setReview(false);
      setAcknowledged(false);
    } else closeRequested();
  }

  async function confirm() {
    if (!valid || !source?.id || !expected || !option || pending.current)
      return;
    if (warning && !acknowledged) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await onMove(source.id, option.dayIndex, expected);
      if (result.status === "applied" || result.status === "queued") {
        onResult(
          result,
          `${plannedRunName(source)} moved to ${dateLabel(option.date)}`
        );
        onClose();
      } else {
        setError(
          result.status === "declined"
            ? "Your plan changed. Keep this week and review the latest dates."
            : "Couldn't move this run. Your change is still here. Try again."
        );
      }
    } catch {
      setError("Couldn't move this run. Your change is still here. Try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <>
      <BottomSheet
        open
        onBack={back}
        title={review ? "Review change" : "Move a run"}
        description="This week only. Your usual weekly layout stays the same."
        onOpenChange={(open) => {
          if (!open) closeRequested();
        }}
        dismissible={!saving && !discard}
        maxHeight="max-h-[90dvh]"
      >
        <div className="overflow-y-auto overscroll-contain p-4 space-y-4">
          <h2 ref={heading} tabIndex={-1} className="sr-only">
            {review
              ? "Review selected run change"
              : "Choose a run and destination"}
          </h2>
          {review ? (
            <>
              <Button
                variant="ghost"
                onClick={back}
                disabled={saving}
                leftIcon={<ArrowLeft className="size-4" />}
              >
                Edit destination
              </Button>
              <h2 className="text-base font-bold">
                {reviewSource ? plannedRunName(reviewSource) : "Planned run"}
              </h2>
              {reviewSource?.id && runDescriptions?.[reviewSource.id] && (
                <p className="text-sm text-muted-foreground">
                  {runDescriptions[reviewSource.id]}
                </p>
              )}
              {source && option && (
                <Card size="compact" className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">From</p>
                    <p className="text-sm font-semibold">
                      {dateLabel(reviewSource?.date ?? source.date!)}
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 text-running-strong"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs text-muted-foreground">To</p>
                    <p className="text-sm font-semibold">
                      {dateLabel(option.date)}
                    </p>
                  </div>
                </Card>
              )}
              {warning && (
                <div className="space-y-2">
                  <Banner
                    variant="warning"
                    description={WARNING_COPY[warning]}
                  />
                  <label className="flex items-start gap-3 min-h-[44px] py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      disabled={saving}
                      className="mt-1 size-5 shrink-0 accent-running-strong"
                    />
                    <span>Keep this destination</span>
                  </label>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {nextLiftName ? `Your next lift stays ${nextLiftName}. ` : ""}
                Completed sessions stay as logged.
              </p>
            </>
          ) : (
            <>
              <fieldset className="space-y-2" disabled={saving}>
                <legend className="text-base font-bold mb-2">
                  Planned run
                </legend>
                {runs.map((run) => (
                  <label
                    key={run.id}
                    aria-label={`${plannedRunName(run)} on ${run.date ? dateLabel(run.date) : "unknown date"}`}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border p-3 text-sm"
                  >
                    <input
                      type="radio"
                      name="move-source"
                      checked={selectedId === run.id}
                      onChange={() => {
                        setSelectedId(run.id!);
                        setExpected({
                          sourceSignature: runMoveSourceSignature(run),
                          todayKey,
                          completionEvidence: runMoveCompletionEvidence(
                            allRuns,
                            savedRuns
                          ),
                        });
                        setTarget(null);
                        setAcknowledged(false);
                        setError("");
                      }}
                      className="size-5 shrink-0 accent-running-strong"
                    />
                    <span>
                      <span className="block font-semibold">
                        {plannedRunName(run)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {run.date ? dateLabel(run.date) : "Date unavailable"}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="space-y-2" disabled={saving || stale}>
                <legend className="text-base font-bold mb-2">Move to</legend>
                {options.map((candidate) => (
                  <label
                    key={candidate.dayIndex}
                    className={cn(
                      "flex min-h-[44px] items-center gap-3 rounded-xl border p-3 text-sm",
                      target === candidate.dayIndex
                        ? "border-running-strong bg-running/12"
                        : "border-border"
                    )}
                  >
                    <input
                      type="radio"
                      name="move-destination"
                      checked={target === candidate.dayIndex}
                      disabled={!candidate.available}
                      onChange={() => {
                        setTarget(candidate.dayIndex);
                        setAcknowledged(false);
                        setError("");
                      }}
                      className="size-5 shrink-0 accent-running-strong"
                    />
                    <span>
                      <span className="block font-semibold">
                        {candidate.date
                          ? dateLabel(candidate.date)
                          : "Date unavailable"}
                      </span>
                      {candidate.blockReason && (
                        <span className="block text-xs text-muted-foreground">
                          {BLOCK_COPY[candidate.blockReason]}
                        </span>
                      )}
                      {candidate.warning && (
                        <span className="block text-xs text-muted-foreground">
                          {WARNING_COPY[candidate.warning]}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {!saving && (stale || staleReview) && (
            <Banner
              variant="neutral"
              description="Your plan or session changed. Close this draft and review the latest week."
            />
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
          <div className="space-y-2">
            {review ? (
              <Button
                variant="sport"
                fullWidth
                loading={saving}
                disabled={!valid || (!!warning && !acknowledged)}
                onClick={() => void confirm()}
              >
                Confirm change
              </Button>
            ) : (
              <Button
                variant="sport"
                fullWidth
                disabled={!valid}
                onClick={() => {
                  setReviewContext(previewContext);
                  setReviewSource(source ? { ...source } : null);
                  setReview(true);
                  setAcknowledged(false);
                }}
              >
                Review change
              </Button>
            )}
            <Button
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={onClose}
            >
              {review ? "Keep current week" : "Cancel"}
            </Button>
          </div>
        </div>
        {/* Keep the confirmation inside the drawer's portal. Vaul hides
            content outside that portal from assistive technology. */}
        <ConfirmDialog
          open={discard}
          overSheet
          title="Discard this change?"
          description="Your saved week will stay the same."
          confirmLabel="Discard change"
          cancelLabel="Keep editing"
          onConfirm={onClose}
          onCancel={() => setDiscard(false)}
        />
      </BottomSheet>
    </>
  );
}
