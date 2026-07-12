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
  overrideRunDay: (idOrDayIndex: string | number, templateId: string) => void;
  /** Existing re-anchor writer (keeps the race date). */
  realignRacePlan: () => Promise<{ timing: RaceTiming; totalWeeks: number }>;
  /** Run14: when the sheet is opened FROM the ease-week nudge, skip the
   *  intent chooser and land straight on the easier-week preview (the
   *  nudge already established the intent). Omitted for the normal
   *  "Adjust this week" entry, which still opens on the chooser. */
  initialIntent?: Intent;
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

  const applyEasier = async (intent: Intent) => {
    if (applying) return;
    setApplying(true);
    try {
      for (const s of swaps) overrideRunDay(s.key, s.toTemplateId);
      track("adjust_week_applied", {
        intent,
        action: "easier_week",
        swapCount: swaps.length,
      });
      toast.success(
        swaps.length === 1
          ? "1 run eased to an easy run this week."
          : `${swaps.length} runs eased to easy runs this week.`
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
                "There isn't enough time left for a full build — the plan will switch to a finish-safely shape (all easy running, no big jumps)."}
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
