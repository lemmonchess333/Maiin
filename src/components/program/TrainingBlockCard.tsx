/**
 * Training Block card (PROGRAM-BLOCK-01, slice 4) — the Lift tab's
 * compact block header plus its two sheets (create / review).
 *
 * Three states, deliberately small (no hero, no competing CTA — the
 * SessionCommandCard stays the tab's primary moment):
 *   - no active block → one quiet entry row to start one
 *   - active, in-window → "Week N of M · title" + one next-action line
 *   - active, finished → "Block complete" + Review CTA
 *
 * The review sheet shows only evidence the app already owns
 * (buildBlockReview) and ends with the four EXPLICIT choices from the
 * GsPb1 lock: Continue / Repeat / Adjust / New block. None of them
 * silently rewrites the programme — "repeat"/"new" create a fresh
 * private block doc; "adjust" points at Programme settings without
 * touching anything.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, ChevronRight, Flag } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import { Spinner } from "@/components/ui/Spinner";
import {
  BLOCK_DURATIONS,
  BLOCK_PRESETS,
  blockWeekOf,
  isBlockFinished,
  type BlockDurationWeeks,
  type BlockPreset,
  type TrainingBlock,
} from "@/features/program/trainingBlock";
import { useTrainingBlock } from "@/features/program/useTrainingBlock";
import {
  buildBlockReview,
  type BlockReview,
} from "@/features/program/blockReviewViewModel";

interface Props {
  uid: string;
  /** Programme's lift days per week — the block's default target. */
  defaultWeeklyLiftTarget: number;
  /** Main-compound exerciseIds from the current programme (≤3 used) —
   *  the v1 auto-anchors; a manual picker can come later. */
  mainCompoundIds: string[];
  trainingWhy: string;
}

function todayLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function pill(selected: boolean): string {
  return cn(
    "min-h-[44px] px-3 rounded-xl text-xs font-semibold transition-colors active:scale-[0.97]",
    selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
  );
}

export default function TrainingBlockCard({
  uid,
  defaultWeeklyLiftTarget,
  mainCompoundIds,
  trainingWhy,
}: Props) {
  const { loading, activeBlock, createBlock, finishBlock, loadReviewWorkouts } =
    useTrainingBlock(uid);
  const [showCreate, setShowCreate] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [preset, setPreset] = useState<BlockPreset>("strength_foundation");
  const [duration, setDuration] = useState<BlockDurationWeeks>(8);
  const [creating, setCreating] = useState(false);
  const [review, setReview] = useState<BlockReview | null>(null);
  const [finishing, setFinishing] = useState(false);

  const today = todayLocal();

  const openReview = useCallback(
    async (block: TrainingBlock) => {
      setShowReview(true);
      setReview(null);
      const workouts = await loadReviewWorkouts(block);
      setReview(buildBlockReview(block, workouts));
    },
    [loadReviewWorkouts]
  );

  // Reset creation form whenever the sheet opens fresh.
  useEffect(() => {
    if (showCreate) {
      setPreset("strength_foundation");
      setDuration(8);
    }
  }, [showCreate]);

  const create = async (startDate: string) => {
    setCreating(true);
    const created = await createBlock({
      preset,
      durationWeeks: duration,
      startDate,
      weeklyLiftTarget: defaultWeeklyLiftTarget,
      anchorExerciseIds: mainCompoundIds.slice(0, 3),
      why: trainingWhy,
    });
    setCreating(false);
    if (created) {
      setShowCreate(false);
      toast.success(`${created.title} started — ${duration} weeks.`);
    } else {
      toast.error("Couldn't start the block. Please try again.");
    }
  };

  const finish = async (outcome: "continue" | "repeat" | "adjust" | "new") => {
    if (!activeBlock) return;
    setFinishing(true);
    const ok = await finishBlock(activeBlock, outcome);
    setFinishing(false);
    if (!ok) {
      toast.error("Couldn't save. Please try again.");
      return;
    }
    setShowReview(false);
    haptic("light");
    if (outcome === "repeat") {
      const repeated = await createBlock({
        preset: activeBlock.preset,
        durationWeeks: activeBlock.durationWeeks,
        startDate: today,
        weeklyLiftTarget: activeBlock.weeklyLiftTarget,
        anchorExerciseIds: activeBlock.anchorExerciseIds,
        why: activeBlock.why,
      });
      if (repeated)
        toast.success(`${repeated.title} — round two starts today.`);
    } else if (outcome === "new") {
      setShowCreate(true);
    } else if (outcome === "adjust") {
      toast.success(
        "Block closed. Tweak your programme from the settings on this tab."
      );
    } else {
      toast.success("Block closed. Keep rolling.");
    }
  };

  if (loading) return null;

  const week = activeBlock ? blockWeekOf(activeBlock, today) : null;
  const finished = activeBlock ? isBlockFinished(activeBlock, today) : false;

  return (
    <>
      {!activeBlock && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            setShowCreate(true);
          }}
          className="w-full min-h-[44px] p-3 rounded-xl bg-muted flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <Flag className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              Start a training block
            </p>
            <p className="text-xs text-muted-foreground">
              Give the next few weeks a shape — and a finish line.
            </p>
          </div>
          <ChevronRight
            className="size-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </button>
      )}

      {activeBlock && (
        <div className="p-3 rounded-xl bg-muted flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {activeBlock.title}
              {!finished && week !== null && (
                <span className="font-mono tabular-nums font-normal text-muted-foreground">
                  {" "}
                  · Week {week} of {activeBlock.durationWeeks}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {finished
                ? "Block complete — see what changed."
                : "Show up this week; the block does the rest."}
            </p>
          </div>
          {finished && (
            <Button size="sm" onClick={() => void openReview(activeBlock)}>
              Review
            </Button>
          )}
        </div>
      )}

      {/* ── Creation sheet ── */}
      <BottomSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Start a training block"
        description="A private focus for the next few weeks. Your programme doesn't change."
      >
        <div className="space-y-3 pb-2">
          <div className="space-y-2" role="group" aria-label="Block focus">
            {BLOCK_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={preset === p.value}
                onClick={() => {
                  haptic("light");
                  setPreset(p.value);
                }}
                className={cn(
                  "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                  preset === p.value
                    ? "bg-primary/10 border border-primary/40"
                    : "bg-muted border border-transparent"
                )}
              >
                <p className="text-sm font-semibold text-foreground">
                  {p.label}
                </p>
                <p className="text-xs text-muted-foreground">{p.description}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2" role="group" aria-label="Block length">
            {BLOCK_DURATIONS.map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={duration === w}
                className={cn(pill(duration === w), "flex-1")}
                onClick={() => {
                  haptic("light");
                  setDuration(w);
                }}
              >
                {w} weeks
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Starts today · target {Math.max(1, defaultWeeklyLiftTarget)}{" "}
            {Math.max(1, defaultWeeklyLiftTarget) === 1 ? "lift" : "lifts"} a
            week (from your programme).
          </p>
          <Button
            className="w-full"
            loading={creating}
            onClick={() => void create(today)}
          >
            Start block
          </Button>
        </div>
      </BottomSheet>

      {/* ── Review sheet ── */}
      <BottomSheet
        open={showReview}
        onOpenChange={setShowReview}
        title="Block review"
        description={activeBlock ? activeBlock.title : undefined}
      >
        {!review && (
          <div className="flex justify-center py-8">
            <Spinner label="Building your review" />
          </div>
        )}
        {review && activeBlock && (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-foreground leading-relaxed">
              {review.verdict}
            </p>
            <div className="p-3 rounded-xl bg-muted">
              <p className="text-sm font-semibold text-foreground font-mono tabular-nums">
                {review.completedLifts}
                <span className="font-sans font-normal text-muted-foreground">
                  {" "}
                  of {review.plannedLifts} planned lifts
                </span>
              </p>
              <div className="flex gap-1 mt-2" aria-hidden="true">
                {review.weeklyCounts.map((count, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      count > 0 ? "bg-primary" : "bg-border"
                    )}
                  />
                ))}
              </div>
            </div>
            {review.anchors.length > 0 && (
              <div className="space-y-1.5">
                <SectionLabel as="h3">Anchor lifts</SectionLabel>
                {review.anchors.map((a) => (
                  <div
                    key={a.exerciseId}
                    className="flex items-center justify-between"
                  >
                    <p className="text-sm text-foreground">{a.exerciseName}</p>
                    <p className="text-sm font-mono tabular-nums text-muted-foreground">
                      {a.deltaKg !== null
                        ? `${a.deltaKg >= 0 ? "+" : ""}${a.deltaKg} kg`
                        : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Button
                className="w-full"
                loading={finishing}
                onClick={() => void finish("continue")}
              >
                Close block & keep rolling
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                loading={finishing}
                onClick={() => void finish("repeat")}
              >
                Repeat this block
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                loading={finishing}
                onClick={() => void finish("new")}
              >
                Start a different block
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                loading={finishing}
                onClick={() => void finish("adjust")}
              >
                Close & adjust my programme
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
