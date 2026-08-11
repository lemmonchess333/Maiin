/**
 * Adjust-this-week sheet (Run13 lock, retention-audit RUN-02).
 *
 * The proactive counterpart to the reactive FellBehindSheet: a runner can
 * declare "not feeling 100% / crowded week / want easier running" BEFORE
 * misses accumulate, instead of waiting for the Monday fell-behind flag.
 *
 * Locked v1 shape — a THIN composition over existing writers, zero new
 * scheduler math:
 *   - intent chips are LANGUAGE + TELEMETRY only; they resolve to exactly two
 *     mutations: an easier week (quality→easy swaps, previewed day-by-day)
 *     or a re-plan from today (the existing realignRacePlan, previewed via
 *     classifyRaceTiming copy)
 *   - every change is PREVIEWED and applied only on an explicit tap
 *   - the race date is NEVER changed here
 *   - not a medical feature: copy is scheduling control, no diagnoses
 *
 * RUN-EASE-01 moved the easier week off N per-day `overrideRunDay` calls
 * onto one `applyEaseWeek` command. The composition is still thin, but a
 * half-eased week is no longer reachable and — the point — the server
 * snapshots the pre-ease runs, so Undo is a row on this sheet for the rest
 * of the week rather than an 8-second toast holding the only copy.
 *
 * Mounted by ProgrammeRunSection (cockpit entry) and SettingsRunPlan; both
 * gate on race_prep + not-recovery + not-elapsed before rendering the entry.
 * Both mounts matter — the A6 eased-week marker used to be a caller's job
 * and the Settings one never did it, which is why this sheet now owns it.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Feather } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { localDateString, localWeekKey } from "@/lib/dateHelpers";
import {
  clearEasedWeekKey,
  setEasedWeekKey,
} from "@/lib/easeWeekNudgeMarkers";
import { planEasierWeek, type EasySwap } from "@/lib/adjustWeek";
import { track } from "@/lib/programAnalytics";
import {
  classifyRaceTiming,
  type RaceTiming,
} from "@/features/program/runScheduler";
import { realignResultMessage } from "@/lib/realignCopy";
import type { ScheduledRunDay } from "@/features/program/programTypes";

type Intent = "not_100" | "crowded" | "easier";
type Step =
  | { kind: "intent" }
  | { kind: "preview-easier"; intent: Intent; swaps: EasySwap[] }
  | { kind: "preview-realign"; intent: Intent; timing: RaceTiming };

interface AdjustWeekSheetProps {
  open: boolean;
  onClose: () => void;
  runDays: ScheduledRunDay[];
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
  };
  /**
   * Apply the whole easier week as ONE command; resolves to the number of
   * runs the SERVER actually changed, or null if it failed.
   *
   * Was a per-day `overrideRunDay` loop, declared `=> void` — which is how
   * a missing `await` survived here, since a void return makes forgetting
   * to await type-correct. Two things changed with it: the week is now
   * atomic (a half-eased week is no longer reachable), and the server
   * stashes the pre-ease runs so Undo outlives the toast that used to hold
   * the only copy.
   */
  applyEaseWeek: (
    swaps: ReadonlyArray<{ key: string | number; toTemplateId: string }>
  ) => Promise<number | null>;
  /** Restore the pre-ease week from that server snapshot. */
  revertEaseWeek: () => Promise<boolean>;
  /**
   * Whether an easier week is currently applied AND still undoable — i.e.
   * the server holds a snapshot for the week the athlete is in. Drives the
   * persistent Undo row, which is the whole point: the 8-second toast only
   * ever caught the immediate mistake, and an athlete who felt better on
   * Tuesday had no way back at all.
   */
  easedThisWeek?: boolean;
  /** Existing re-anchor writer (keeps the race date). */
  realignRacePlan: () => Promise<{ timing: RaceTiming; totalWeeks: number }>;
  /** Run14: when the sheet is opened FROM the ease-week nudge, skip the
   *  intent chooser and land straight on the easier-week preview (the
   *  nudge already established the intent). Omitted for the normal
   *  "Adjust this week" entry, which still opens on the chooser. */
  initialIntent?: Intent;
  /**
   * Whose week this is. Required, and used ONLY for the A6 eased-week
   * marker the sheet maintains itself.
   *
   * It was a pair of optional `onEasedApplied` / `onEaseUndone` callbacks,
   * and the optionality did exactly what optionality does: this sheet is
   * mounted from two places, and the Settings one passed neither. So an
   * ease applied from Settings recorded no marker and never produced the
   * following week's bounce line, while an undo from Settings left a
   * marker set from the cockpit standing — the app would report recovering
   * from a reduction that had been restored.
   *
   * Owning the marker here is the same lesson as typing `overrideRunDay`
   * `=> Promise<boolean>` instead of `=> void`: the fix for a caller that
   * can forget is to stop asking it to remember.
   */
  uid: string;
}

const INTENTS: Array<{ id: Intent; label: string; hint: string }> = [
  {
    id: "not_100",
    label: "I'm not feeling 100%",
    hint: "Ease this week's runs",
  },
  { id: "crowded", label: "My week is crowded", hint: "Re-plan from today" },
  {
    id: "easier",
    label: "I need easier running",
    hint: "Ease this week's runs",
  },
  // No "keep the plan as is" chip — it was a pure no-op (it just dismissed the
  // sheet). Swiping the sheet down / tapping outside already means "no change",
  // so a dedicated row was a control that led back to where you started. The
  // sheet's own dismissal IS the "keep as is" path.
];

export default function AdjustWeekSheet({
  open,
  onClose,
  runDays,
  raceGoal,
  applyEaseWeek,
  revertEaseWeek,
  easedThisWeek = false,
  realignRacePlan,
  initialIntent,
  uid,
}: AdjustWeekSheetProps) {
  const [step, setStep] = useState<Step>({ kind: "intent" });
  const [applying, setApplying] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const todayKey = localDateString();
  const swaps = useMemo(
    () => planEasierWeek(runDays, todayKey),
    [runDays, todayKey]
  );

  // Run14: opened from the ease-week nudge → jump past the chooser to the
  // easier-week preview. Only the easier intents skip the chooser; a
  // realign ("crowded") still deserves its own preview step, so it isn't
  // pre-jumped here (the nudge never sends it).
  useEffect(() => {
    if (open && (initialIntent === "easier" || initialIntent === "not_100")) {
      setStep({ kind: "preview-easier", intent: initialIntent, swaps });
    }
  }, [open, initialIntent, swaps]);

  const close = (cancelled: boolean) => {
    if (cancelled) track("adjust_week_cancelled");
    setStep({ kind: "intent" });
    setApplying(false);
    onClose();
  };

  const pickIntent = (intent: Intent) => {
    track("adjust_week_intent_selected", { intent });
    if (intent === "crowded") {
      // Preview the realign OUTCOME before writing anything: weeks remaining
      // from today → the same timing classification the generator will land on.
      const daysLeft = Math.max(
        1,
        Math.round(
          (new Date(raceGoal.targetDate + "T00:00:00").getTime() -
            new Date(todayKey + "T00:00:00").getTime()) /
            86400000
        )
      );
      const timing = classifyRaceTiming({
        distance: raceGoal.distance,
        weeksRemaining: Math.max(1, Math.ceil(daysLeft / 7)),
      });
      setStep({ kind: "preview-realign", intent, timing });
      return;
    }
    setStep({ kind: "preview-easier", intent, swaps });
  };

  /**
   * Put the week back.
   *
   * Restores the server's pre-ease snapshot wholesale rather than replaying
   * each swap in reverse. That is the difference between an undo that works
   * for eight seconds and one that works all week: the reverse-replay
   * version could only ever restore what THIS component still had in
   * memory, so it died with the toast holding it — and it also restored the
   * days one at a time, which meant a failure halfway through left a week
   * that was neither eased nor whole.
   *
   * It also restores a swap the ATHLETE made before easing, which
   * reverse-replay could not: the snapshot is the week as it stood, not a
   * list of the changes we made to it.
   */
  const undoEase = async () => {
    if (undoing) return;
    setUndoing(true);
    const ok = await revertEaseWeek();
    setUndoing(false);
    track("adjust_week_applied", {
      intent: "not_100",
      action: "easier_week_undone",
    });
    if (!ok) {
      toast.error("Couldn't undo the easier week.");
      return;
    }
    clearEasedWeekKey(uid);
    toast.success("Easier week undone — this week is back to plan.");
    close(false);
  };

  const applyEasier = async (intent: Intent) => {
    if (applying) return;
    setApplying(true);
    try {
      /* ONE command, and the count is the SERVER's answer.

         Two shapes preceded this. First `for (const s of swaps)
         overrideRunDay(...)` with no await — N promises into the void,
         the enclosing try/catch blind to all of them, "3 runs eased"
         shown before a single write returned. Then the awaited version,
         honest about its count but still N transactions, so a half-eased
         week remained reachable and the only record of the originals was
         a React array that lived as long as a toast.

         Now the whole week is one transaction that snapshots what it
         replaced. `landed` comes back from the refetched document rather
         than the request, because the server silently skips a day that
         has since been completed, skipped, or turned into a race. */
      const landed = await applyEaseWeek(swaps);
      if (landed === null) {
        toast.error("Couldn't adjust the week. Please try again.");
        setApplying(false);
        return;
      }
      if (landed === 0) {
        // The server refuses an ease that would change nothing, so this is
        // the belt to that braces — say something rather than close on a
        // silent no-op.
        toast.error("None of this week's runs can be changed now.");
        setApplying(false);
        return;
      }
      // A6: record the week so next week's bounce check can read this
      // week's quality against it. Written only once the command has
      // COMMITTED, so a failed ease never leaves a marker behind.
      setEasedWeekKey(uid, localWeekKey(new Date()));
      track("adjust_week_applied", {
        intent,
        action: "easier_week",
        swapCount: landed,
      });
      /* An easier week is a REDUCTION, and the evidence handoff asks that
         reducing work "give a bounded path back". The toast is the fast
         path for the immediate mistake; the durable one is the Undo row
         on this sheet, which stands for the rest of the week because the
         snapshot lives on the document rather than in this component. */
      toast.success(
        landed === 1
          ? "1 run eased to an easy run this week."
          : `${landed} runs eased to easy runs this week.`,
        {
          duration: 8000,
          action: { label: "Undo", onClick: () => void undoEase() },
        }
      );
      close(false);
    } catch (err) {
      logger.error("[adjustWeek] easier-week apply failed", err);
      toast.error("Couldn't adjust the week. Please try again.");
      setApplying(false);
    }
  };

  const applyRealign = async (intent: Intent) => {
    if (applying) return;
    setApplying(true);
    try {
      const { timing, totalWeeks } = await realignRacePlan();
      track("adjust_week_applied", { intent, action: "realign" });
      toast.success(
        realignResultMessage({
          timing,
          totalWeeks,
          distance: raceGoal.distance,
        })
      );
      close(false);
    } catch (err) {
      logger.error("[adjustWeek] realign apply failed", err);
      toast.error("Couldn't re-plan. Please try again.");
      setApplying(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) close(true);
      }}
      title="Adjust this week"
      description="Your race date stays put — this only shapes the week."
    >
      <div className="px-4 pb-6 pt-3 space-y-2">
        {step.kind === "intent" && (
          <>
            {/* The durable path back.

                An easier week used to be undoable for eight seconds and
                then never again — the toast held the only record of what
                the runs had been. The snapshot now lives on the document,
                so this row stands for the rest of the week and is the
                first thing an athlete sees on the surface they eased from.

                Rendered ABOVE the intents on purpose: once a week is
                already eased, "make it easier" is rarely what someone came
                back for, and the row also answers "did that actually
                apply?" without making them count their runs. */}
            {easedThisWeek && (
              <div className="rounded-xl bg-running/[0.08] px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Feather
                    className="size-4 text-running shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-foreground">
                    This week is already eased
                  </span>
                </div>
                <p className="text-micro text-muted-foreground">
                  Feeling better? Put this week's runs back the way they were.
                </p>
                <Button
                  variant="sport-tinted"
                  fullWidth
                  loading={undoing}
                  onClick={() => void undoEase()}
                >
                  Undo easier week
                </Button>
              </div>
            )}
            {INTENTS.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => pickIntent(i.id)}
                className="w-full min-h-[56px] flex items-center gap-3 rounded-xl bg-muted px-4 py-3 text-left active:scale-[0.97] transition-transform"
              >
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {i.label}
                  </span>
                  <span className="text-micro text-muted-foreground">
                    {i.hint}
                  </span>
                </div>
                <ArrowRight
                  className="size-4 text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </>
        )}

        {step.kind === "preview-easier" && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Feather className="size-4 text-running" aria-hidden="true" />
              Easier week — preview
            </div>
            {step.swaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing left to ease — the rest of this week is already easy
                running (or done). Nice.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {step.swaps.map((s) => (
                  <li
                    key={String(s.key)}
                    className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm"
                  >
                    <span className="text-muted-foreground line-through">
                      {s.fromName}
                    </span>
                    <ArrowRight
                      className="size-3.5 text-muted-foreground shrink-0"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-foreground">
                      {s.toName}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-micro text-muted-foreground">
              Changes this week only. Next week follows your plan as normal.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                fullWidth
                onClick={() => setStep({ kind: "intent" })}
              >
                Back
              </Button>
              {step.swaps.length > 0 && (
                <Button
                  variant="sport"
                  fullWidth
                  loading={applying}
                  onClick={() => void applyEasier(step.intent)}
                >
                  Ease this week
                </Button>
              )}
            </div>
          </>
        )}

        {step.kind === "preview-realign" && (
          <>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarClock
                className="size-4 text-running"
                aria-hidden="true"
              />
              Re-plan from today — preview
            </div>
            <p className="text-sm text-muted-foreground">
              {step.timing === "healthy" &&
                "Your remaining weeks re-plan from today with room to spare — the race date stays put."}
              {step.timing === "compressible" &&
                "The remaining time is tight, so the re-planned block will be compressed toward your race date."}
              {step.timing === "below-floor" &&
                "There isn't enough time left for a full build — the plan will switch to a mostly-easy shape (all easy running, no big jumps)."}
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                fullWidth
                onClick={() => setStep({ kind: "intent" })}
              >
                Back
              </Button>
              <Button
                variant="sport"
                fullWidth
                loading={applying}
                onClick={() => void applyRealign(step.intent)}
              >
                Re-plan from today
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
