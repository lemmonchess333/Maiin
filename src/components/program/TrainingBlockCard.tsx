/**
 * Training Block card (Blk2) — the Lift tab's block header and its sheets.
 *
 * A block now OWNS the lift prescription for as long as it runs, so this
 * surface is where the user chooses what the next 4/8/12 weeks are FOR. Two
 * questions, not one:
 *
 *   Focus — the same five options as the lift-plan editor, sharing one
 *           vocabulary (`FOCUS_LABELS`) because under Blk2 they are the same
 *           setting. Picking one re-prescribes the week.
 *   Pace  — full / lighter / easing back in. This is where the two retired
 *           "habit" presets went: Consistency Reset and Return to Training
 *           were never a focus, they were a PACE, which is exactly why
 *           `presetProgrammeGoal` had to return null for them. Split apart,
 *           a returning strength lifter can finally answer both questions
 *           instead of picking which half of their situation to describe.
 *
 * GsPb1's "never a silent programme rewrite" is UPHELD, not superseded, and
 * the consequence line is what carries it: the exact change is stated above
 * the button, BEFORE the write. That is stricter than the post-save offer it
 * replaces (Blk1(2)), which asked after the block was already saved.
 *
 * The block itself lives on `programState.trainingBlock`, so start and
 * release are one document write each and two active blocks are
 * structurally impossible. `useTrainingBlock` is now the ARCHIVE only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, ChevronRight, Flag } from "lucide-react";
import { toast } from "@/lib/toast";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomSheet } from "@/components/ui/BottomSheet";
import SectionLabel from "@/components/ui/SectionLabel";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import {
  BLOCK_DURATIONS,
  FOCUS_ORDER,
  PACE_OPTIONS,
  blockEndDate,
  blockWeekOf,
  focusLabel,
  isBlockFinished,
  type BlockDurationWeeks,
  type TrainingBlock,
} from "@/features/program/trainingBlock";
import {
  blockConsequence,
  focusRepSummary,
} from "@/features/program/represcribe";
import { useTrainingBlock } from "@/features/program/useTrainingBlock";
import {
  buildBlockReview,
  type BlockReview,
} from "@/features/program/blockReviewViewModel";
import type {
  ActiveTrainingBlock,
  BlockPace,
  PrimaryGoal,
} from "@/features/program/programTypes";

export interface StartBlockInput {
  focus: PrimaryGoal;
  pace: BlockPace;
  durationWeeks: BlockDurationWeeks;
  startDate: string;
  anchorExerciseIds: string[];
  why: string;
}

interface Props {
  uid: string;
  /** The live block from `programState`, or undefined for none. */
  block: ActiveTrainingBlock | undefined;
  /** `programState.primaryGoal` — the focus in force right now. */
  currentFocus: PrimaryGoal;
  /**
   * Lift days in the programme. ZERO means a run-only athlete, and the
   * entry is hidden: there is no prescription for a block to own, and the
   * old card seeded a target of 1 lift onto a plan with no lifts.
   */
  liftDaysPerWeek: number;
  /** Main-compound exerciseIds from the current programme (≤3 anchors). */
  mainCompoundIds: string[];
  trainingWhy: string;
  /**
   * Suppressed during a race taper or race week. A "Get stronger" block
   * raising lift stimulus into a taper is a real conflict; post-race
   * recovery is deliberately NOT suppressed — that is a good moment to
   * pick a lifting focus back up.
   */
  raceTaperActive?: boolean;
  onStart: (input: StartBlockInput) => Promise<boolean>;
  /**
   * Adopts a pre-Blk2 block that was still open when Blk2 shipped. Without
   * it the block vanishes from the UI: the archive still says active, but
   * nothing puts it on programState, so this card offers "Start a training
   * block" to someone who already has one running.
   */
  onAdoptLegacy: (legacy: TrainingBlock) => Promise<boolean>;
  onRelease: () => Promise<boolean>;
  onKeepFocus: () => Promise<boolean>;
}

function todayLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Archive shape for a block that has finished doing its job. */
function toArchive(
  block: ActiveTrainingBlock,
  outcome: "continue" | "repeat" | "adjust" | "new",
  endedEarly: boolean
): TrainingBlock {
  return {
    id: block.id,
    title: focusLabel(block.focus),
    startDate: block.startDate,
    durationWeeks: block.durationWeeks,
    weeklyLiftTarget: block.weeklyLiftTarget,
    anchorExerciseIds: block.anchorExerciseIds,
    why: block.why,
    status: endedEarly ? "abandoned" : "completed",
    outcome,
    endedAt: Date.now(),
    focus: block.focus,
    pace: block.pace,
    goalBefore: block.goalBefore,
    owned: block.owned,
    ...(endedEarly ? { endedEarly: true as const } : {}),
    createdAt: block.createdAt,
  };
}

export default function TrainingBlockCard({
  uid,
  block,
  currentFocus,
  liftDaysPerWeek,
  mainCompoundIds,
  trainingWhy,
  raceTaperActive = false,
  onStart,
  onAdoptLegacy,
  onRelease,
  onKeepFocus,
}: Props) {
  const navigate = useNavigate();
  const { blocks, archiveBlock, loadReviewWorkouts } = useTrainingBlock(uid);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState<"switch" | "end" | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [focus, setFocus] = useState<PrimaryGoal>(currentFocus);
  const [pace, setPace] = useState<BlockPace>("full");
  const [showPace, setShowPace] = useState(false);
  const [duration, setDuration] = useState<BlockDurationWeeks>(8);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<BlockReview | null>(null);

  const today = todayLocal();

  const openReview = useCallback(
    async (b: ActiveTrainingBlock) => {
      setShowReview(true);
      setReview(null);
      const archived = toArchive(b, "continue", false);
      const workouts = await loadReviewWorkouts(archived);
      setReview(buildBlockReview(archived, workouts));
    },
    [loadReviewWorkouts]
  );

  // Open on the user's CURRENT focus. The old sheet always reset to
  // "strength_foundation", so an idle tap proposed strength to a
  // hypertrophy user — which under Blk2 would actually change their week.
  useEffect(() => {
    if (showCreate) {
      setFocus(currentFocus);
      setPace("full");
      setShowPace(false);
      setDuration(8);
    }
  }, [showCreate, currentFocus]);

  // One-shot legacy adoption. Guarded three ways so it can't loop: the
  // ref fires it once per mount, the writer itself no-ops when a live
  // block already exists, and the archive row is only a candidate while
  // its window is still open — an elapsed legacy block is history, not
  // something to resurrect.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (block || adoptedRef.current || liftDaysPerWeek === 0) return;
    const legacy = blocks.find(
      (b) => b.status === "active" && !isBlockFinished(b, today)
    );
    if (!legacy) return;
    adoptedRef.current = true;
    void onAdoptLegacy(legacy);
  }, [block, blocks, liftDaysPerWeek, today, onAdoptLegacy]);

  const consequence = useMemo(
    () =>
      blockConsequence({
        focus,
        currentFocus,
        pace,
        durationWeeks: duration,
        focusLabel,
      }),
    [focus, currentFocus, pace, duration]
  );

  const start = async () => {
    setBusy(true);
    const ok = await onStart({
      focus,
      pace,
      durationWeeks: duration,
      startDate: today,
      anchorExerciseIds: mainCompoundIds.slice(0, 3),
      why: trainingWhy,
    });
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't start the block. Nothing changed — try again.");
      return;
    }
    setShowCreate(false);
    haptic("light");
    toast.success(
      focus !== currentFocus
        ? `${focusLabel(focus)} — ${duration} weeks. Your programme's updated.`
        : `${duration} weeks. Your programme's unchanged.`
    );
  };

  /**
   * Close the block. `keepFocus` leaves the prescription exactly as the
   * block left it; otherwise the programme returns to `goalBefore`.
   * The archive write goes first so a failure to close can never lose the
   * record of what was trained.
   */
  const close = async (
    outcome: "continue" | "repeat" | "adjust" | "new",
    opts: { keepFocus: boolean; endedEarly: boolean }
  ) => {
    if (!block) return false;
    setBusy(true);
    await archiveBlock(toArchive(block, outcome, opts.endedEarly));
    const ok = opts.keepFocus ? await onKeepFocus() : await onRelease();
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't close the block. Try again.");
      return false;
    }
    haptic("light");
    return true;
  };

  const week = block ? blockWeekOf(block, today) : null;
  const finished = block ? isBlockFinished(block, today) : false;
  const endsOn = block ? blockEndDate(block) : null;

  // A run-only athlete has no lift prescription for a block to own.
  if (liftDaysPerWeek === 0) return null;

  return (
    <>
      {!block && !raceTaperActive && (
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
              Pick what the next few weeks are for. Your programme follows.
            </p>
          </div>
          <ChevronRight
            className="size-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </button>
      )}

      {block && (
        <button
          type="button"
          onClick={() => {
            haptic("light");
            if (finished) void openReview(block);
            else setShowDetail(true);
          }}
          className="w-full min-h-[44px] p-3 rounded-xl bg-muted flex items-center gap-3 text-left active:scale-[0.97] transition-transform"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {focusLabel(block.focus)}
              {!finished && week !== null && (
                <span className="font-mono tabular-nums font-normal text-muted-foreground">
                  {" "}
                  {/* "Block week", never the programme week counter shown an
                      inch above — Blk1(3)'s two-counters fix, still load-
                      bearing because the block deliberately does NOT own
                      `weekNumber` (owning it is objection 1's failure mode). */}
                  · Block week {week} of {block.durationWeeks}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {finished
                ? "Block complete — see what changed."
                : !block.owned
                  ? `Block week ${week ?? 1} of ${block.durationWeeks}.`
                  : block.pace === "easing" && week !== null && week <= 2
                    ? "Weights holding steady this week. Just show up."
                    : block.pace !== "full"
                      ? "Shorter sessions for now."
                      : `Main lifts at ${focusRepSummary(block.focus)} reps.`}
            </p>
          </div>
          <ChevronRight
            className="size-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </button>
      )}

      {/* ── Create sheet — Focus × Pace, with the consequence line ── */}
      <BottomSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        title="Start a training block"
        description="Your programme follows the block for as long as it runs."
      >
        <div className="space-y-4 pb-2">
          <div className="space-y-2">
            <SectionLabel>Focus</SectionLabel>
            <div className="space-y-2">
              {FOCUS_ORDER.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={focus === g}
                  onClick={() => {
                    haptic("light");
                    setFocus(g);
                  }}
                  className={cn(
                    "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                    focus === g
                      ? "bg-primary/10 border border-primary/40"
                      : "bg-muted border border-transparent"
                  )}
                >
                  <p className="text-sm font-semibold text-foreground">
                    {focusLabel(g)}
                    {g === currentFocus && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Your focus now
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Main lifts at{" "}
                    <span className="font-mono tabular-nums">
                      {focusRepSummary(g)}
                    </span>{" "}
                    reps.
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <SectionLabel>Length</SectionLabel>
            <SegmentedControl
              options={BLOCK_DURATIONS.map((w) => ({
                value: w,
                label: `${w} weeks`,
              }))}
              value={duration}
              onChange={(w) => {
                haptic("light");
                setDuration(w);
              }}
              ariaLabel="Block length"
            />
          </div>

          {/* Progressive disclosure: most blocks are "full", and the pace
              question only matters to someone who already knows they're
              training around something. */}
          {!showPace ? (
            <button
              type="button"
              onClick={() => {
                haptic("light");
                setShowPace(true);
              }}
              className="w-full min-h-[44px] flex items-center justify-between text-left"
            >
              <span className="text-sm font-semibold text-foreground">
                Training around something?
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className="space-y-2">
              <SectionLabel>Pace</SectionLabel>
              <div className="space-y-2">
                {PACE_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    aria-pressed={pace === p.value}
                    onClick={() => {
                      haptic("light");
                      setPace(p.value);
                    }}
                    className={cn(
                      "w-full min-h-[44px] p-3 rounded-xl text-left transition-colors active:scale-[0.97]",
                      pace === p.value
                        ? "bg-primary/10 border border-primary/40"
                        : "bg-muted border border-transparent"
                    )}
                  >
                    <p className="text-sm font-semibold text-foreground">
                      {p.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The consequence line IS the confirmation — no modal, because
              every block is reversible and a second tap to confirm what the
              sentence already said is friction, not safety. */}
          <p className="text-xs text-muted-foreground">{consequence}</p>

          <Button
            className="w-full"
            loading={busy}
            onClick={() => void start()}
          >
            Start block
          </Button>
        </div>
      </BottomSheet>

      {/* ── Active block detail ── */}
      <BottomSheet
        open={showDetail}
        onOpenChange={setShowDetail}
        title={block ? focusLabel(block.focus) : "Training block"}
        description="Your current training block"
      >
        {block && (
          <div className="space-y-4 pb-2">
            <div>
              <p className="text-sm text-foreground">
                <span className="font-mono tabular-nums">
                  Block week {week ?? 1} of {block.durationWeeks}
                </span>
                {endsOn && (
                  <span className="text-muted-foreground">
                    {" "}
                    · ends {endsOn}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Target{" "}
                <span className="font-mono tabular-nums">
                  {block.weeklyLiftTarget}
                </span>{" "}
                {block.weeklyLiftTarget === 1 ? "lift" : "lifts"} a week
                {block.why ? ` · ${block.why}` : ""}
              </p>
              {block.owned && (
                <p className="mt-2 text-xs text-muted-foreground">
                  While this block runs, your main lifts are prescribed at{" "}
                  <span className="font-mono tabular-nums">
                    {focusRepSummary(block.focus)}
                  </span>{" "}
                  reps.
                </p>
              )}
            </div>
            {/* PROGRAM-CIRCLE-01 (slice 4a) — hand the block off to a
                Circle. Privacy fence unchanged by Blk2: ONLY the space
                type, the block's display title and its end date travel —
                never the focus, the prescription, exercises or loads. */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                haptic("light");
                setShowDetail(false);
                navigate(
                  `/social?circleCreate=strength_block&circleTitle=${encodeURIComponent(
                    focusLabel(block.focus)
                  )}&circleDate=${blockEndDate(block)}`
                );
              }}
            >
              Train together
            </Button>
            {/* Close the sheet before the confirm opens. vaul marks
                everything outside an open drawer `aria-hidden`, so a
                dialog raised on top of it is visible but unreachable to a
                screen reader — the confirm button included. */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                haptic("light");
                setShowDetail(false);
                setConfirmEnd("switch");
              }}
            >
              Change focus or length
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                haptic("light");
                setShowDetail(false);
                setConfirmEnd("end");
              }}
            >
              End block early
            </Button>
          </div>
        )}
      </BottomSheet>

      {/* ── Review ── */}
      <BottomSheet
        open={showReview}
        onOpenChange={setShowReview}
        title={block ? focusLabel(block.focus) : "Block complete"}
        description="How the block went"
      >
        {!review ? (
          <div className="py-8 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4 pb-2">
            <p className="text-sm text-foreground">{review.verdict}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {review.completedLifts}
              </span>{" "}
              of{" "}
              <span className="font-mono tabular-nums">
                {review.plannedLifts}
              </span>{" "}
              planned lifts.
            </p>
            {block?.owned && (
              <p className="text-xs text-muted-foreground">
                You trained at{" "}
                <span className="font-mono tabular-nums">
                  {focusRepSummary(block.focus)}
                </span>{" "}
                reps on your main lifts for{" "}
                <span className="font-mono tabular-nums">
                  {block.durationWeeks}
                </span>{" "}
                weeks.
              </p>
            )}

            <Button
              className="w-full"
              loading={busy}
              onClick={() => {
                void (async () => {
                  if (!block) return;
                  const kept = { ...block };
                  if (
                    !(await close("repeat", {
                      keepFocus: true,
                      endedEarly: false,
                    }))
                  )
                    return;
                  setShowReview(false);
                  const ok = await onStart({
                    focus: kept.focus,
                    pace: kept.pace,
                    durationWeeks: kept.durationWeeks,
                    startDate: today,
                    anchorExerciseIds: kept.anchorExerciseIds,
                    why: kept.why,
                  });
                  if (ok)
                    toast.success(
                      `Another ${kept.durationWeeks} weeks. Same focus.`
                    );
                })();
              }}
            >
              Another {block?.durationWeeks ?? 8} weeks of this
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              loading={busy}
              onClick={() => {
                void (async () => {
                  if (
                    await close("continue", {
                      keepFocus: true,
                      endedEarly: false,
                    })
                  ) {
                    setShowReview(false);
                    toast.success("Focus kept.");
                  }
                })();
              }}
            >
              Keep this focus, no block
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              loading={busy}
              onClick={() => {
                void (async () => {
                  if (
                    await close("new", { keepFocus: false, endedEarly: false })
                  ) {
                    setShowReview(false);
                    setShowCreate(true);
                  }
                })();
              }}
            >
              Start a different block
            </Button>
            <div>
              <Button
                variant="ghost"
                className="w-full"
                loading={busy}
                onClick={() => {
                  void (async () => {
                    if (
                      await close("adjust", {
                        keepFocus: false,
                        endedEarly: false,
                      })
                    ) {
                      setShowReview(false);
                      toast.success(
                        "Block closed. Your programme's back to how it was."
                      );
                    }
                  })();
                }}
              >
                Back to your rolling programme
              </Button>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                Your lifts return to how they were prescribed before the block.
              </p>
            </div>
          </div>
        )}
      </BottomSheet>

      <ConfirmDialog
        open={confirmEnd === "end"}
        onCancel={() => setConfirmEnd(null)}
        title="End this block early?"
        description="Your lifts go back to how they were prescribed before the block. Everything you logged stays."
        confirmLabel="End block"
        onConfirm={() => {
          void (async () => {
            if (
              await close("continue", { keepFocus: false, endedEarly: true })
            ) {
              setConfirmEnd(null);
              setShowDetail(false);
              toast.success(
                "Block closed. Your programme's back to how it was."
              );
            }
          })();
        }}
      />
      <ConfirmDialog
        open={confirmEnd === "switch"}
        onCancel={() => setConfirmEnd(null)}
        title="Change focus?"
        description={
          block
            ? `This closes ${focusLabel(block.focus)} and starts a new block from today. Your weights and history carry over.`
            : ""
        }
        confirmLabel="Change focus"
        onConfirm={() => {
          void (async () => {
            if (await close("new", { keepFocus: false, endedEarly: true })) {
              setConfirmEnd(null);
              setShowDetail(false);
              setShowCreate(true);
            }
          })();
        }}
      />
    </>
  );
}
