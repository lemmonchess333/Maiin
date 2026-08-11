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
 *     mutations: an easier week (per-day quality→easy swaps via
 *     overrideRunDay, previewed day-by-day) or a re-plan from today (the
 *     existing realignRacePlan, previewed via classifyRaceTiming copy)
 *   - every change is PREVIEWED and applied only on an explicit tap
 *   - the race date is NEVER changed here
 *   - not a medical feature: copy is scheduling control, no diagnoses
 *
 * Mounted by ProgrammeRunSection (cockpit entry) and SettingsRunPlan; both
 * gate on race_prep + not-recovery + not-elapsed before rendering the entry.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, Feather } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { localDateString } from "@/lib/dateHelpers";
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
  /** Existing per-day writer ("changes this day only"). */
  /**
   * Declared `=> void` until 2026-08-11, which is how the missing `await`
   * below survived: the real function is async and reports whether the
   * swap landed, but a `void` return makes forgetting to await it
   * type-correct. Typing the truth is what makes the caller's mistake a
   * compile error instead of a toast that lies.
   */
  overrideRunDay: (
    idOrDayIndex: string | number,
    templateId: string
  ) => Promise<boolean>;
  /** Existing re-anchor writer (keeps the race date). */
  realignRacePlan: () => Promise<{ timing: RaceTiming; totalWeeks: number }>;
  /** Run14: when the sheet is opened FROM the ease-week nudge, skip the
   *  intent chooser and land straight on the easier-week preview (the
   *  nudge already established the intent). Omitted for the normal
   *  "Adjust this week" entry, which still opens on the chooser. */
  initialIntent?: Intent;
  /** A6: fired after an easier-week apply COMMITS (never on realign or
   *  cancel). The parent records the eased weekKey so the post-ease
   *  bounce check can read next week's quality session against it. */
  onEasedApplied?: () => void;
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
  overrideRunDay,
  realignRacePlan,
  initialIntent,
  onEasedApplied,
}: AdjustWeekSheetProps) {
  const [step, setStep] = useState<Step>({ kind: "intent" });
  const [applying, setApplying] = useState(false);

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
   * Put back exactly the runs that were eased.
   *
   * Re-applies each swap in reverse (`toTemplateId` → `fromTemplateId`)
   * through the same command, so the restore is subject to the same
   * guards: a race is still refused, and a day completed in the meantime
   * is no longer editable and is simply skipped rather than rewritten.
   *
   * Reports honestly for the same reason the apply does — a partial
   * restore that claimed a full one would be the failure this whole
   * change exists to remove.
   */
  const undoEase = async (landed: EasySwap[]) => {
    let restored = 0;
    for (const s of landed) {
      if (await overrideRunDay(s.key, s.fromTemplateId)) restored += 1;
    }
    track("adjust_week_applied", {
      intent: "not_100",
      action: "easier_week_undone",
      swapCount: restored,
    });
    if (restored === 0) {
      toast.error("Couldn't undo the easier week.");
      return;
    }
    toast.success(
      restored === landed.length
        ? "Easier week undone — this week is back to plan."
        : `${restored} of ${landed.length} runs put back.`
    );
  };

  const applyEasier = async (intent: Intent) => {
    if (applying) return;
    setApplying(true);
    try {
      /* AWAITED, and the count comes from what actually landed.

         This was `for (const s of swaps) overrideRunDay(...)` with no
         await: N promises fired into the void, the enclosing try/catch
         unable to see any of them, and "3 runs eased to easy runs this
         week." shown before a single write had returned. A rejected swap
         surfaced its own "Couldn't change that run" toast a moment
         later, so the athlete got both messages and no way to tell which
         was true.

         Sequential rather than Promise.all: each command re-reads
         programState, and a rejection triggers a refetch, so firing them
         concurrently races that refresh against the commands still in
         flight. A week is at most seven runs. */
      /* The swaps that LANDED are kept, not just counted, because they
         are the only record of what each run used to be: the server's
         overrideRunDay reducer overwrites `templateId` as well as
         `userOverride`, so once applied, nothing on the day remembers
         its previous template. */
      const landed: EasySwap[] = [];
      for (const s of swaps) {
        if (await overrideRunDay(s.key, s.toTemplateId)) landed.push(s);
      }
      if (landed.length === 0) {
        // overrideRunDay has already said why, per failure.
        setApplying(false);
        return;
      }
      onEasedApplied?.();
      track("adjust_week_applied", {
        intent,
        action: "easier_week",
        swapCount: landed.length,
      });
      /* An easier week is a REDUCTION, and the evidence handoff asks that
         reducing work "give a bounded path back". There was none: the
         originals are destroyed on write, so an athlete who tapped this
         by mistake could not restore their week or even see what it had
         been. Same 8s undo affordance the deload uses (Program.tsx), for
         the same reason and in the same shape. */
      toast.success(
        landed.length === 1
          ? "1 run eased to an easy run this week."
          : `${landed.length} runs eased to easy runs this week.`,
        {
          duration: 8000,
          action: { label: "Undo", onClick: () => void undoEase(landed) },
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
