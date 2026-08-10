/**
 * Session chooser (PROGRAM-FLEX-01 + PROGRAM-ADAPT-01).
 *
 * Opened ON DEMAND from the "Short on time?" link under the session
 * card — NOT on "Begin Workout", which starts the full session
 * directly (operator, 2026-08-05: the every-tap interstitial was "too
 * much choice"; Hevy / Strong / Fitbod all start on tap, and the
 * CLAUDE.md reference bar for interrupting wasn't met). A menu the
 * user asked for can afford its full option list; a menu that
 * intercepts cannot. Full stays the visually-primary choice;
 * time-budgeted Express options appear only when trimming would
 * actually change the session (the gate asks the builder — see
 * `expressChoices`); and "Easier today" (PROGRAM-ADAPT-01) is ALWAYS
 * offered — a reduced execution of the same session for rough days,
 * never a default and never auto-applied. When its recommendation
 * signal fires, the session card also surfaces a direct "Go easier
 * today" row, so the recommendation no longer depends on this sheet
 * being opened.
 *
 * Each option shows what it costs ("2 accessories trimmed", "one set
 * less per lift, lighter loads") so the choice is informed, not magic.
 * Easier today carries a "Recommended — {reason}" sublabel ONLY when a
 * strong existing signal supports it (hard run before a lower-body
 * day, target muscles still recovering, or the deload recommendation)
 * — one factual reason, never a readiness percentage. The plans are
 * `buildExpressSession` / `buildEasierSession` — deterministic, stored
 * programme never mutated.
 */

import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import {
  buildExpressSession,
  estimateSessionMinutes,
  expressChoices,
  summarizeTrim,
  type SessionVariant,
} from "@/features/program/expressSession";
import {
  buildEasierSession,
  summarizeEasier,
  type EasierTodayRecommendation,
  type LighterDaySwap,
} from "@/features/program/easierToday";
import type { WorkoutDay } from "@/features/program/programTypes";

interface ExpressSessionSheetProps {
  open: boolean;
  day: WorkoutDay | null;
  /** Pure recommendation computed by the caller from existing signals
   *  (never a readiness score). Null = treat as not recommended. */
  easierRecommendation?: EasierTodayRecommendation | null;
  onClose: () => void;
  /** Fires with the chosen variant; the caller builds the plan and
   *  opens the session. */
  onStart: (variant: SessionVariant) => void;
  /** Backlog #1 (Helms H1): the week's lightest remaining day, offered as
   *  a one-tap swap. Null/absent = no meaningfully lighter alternative,
   *  and the row simply doesn't render. */
  lighterDay?: LighterDaySwap | null;
  /** Launches the swapped day (full prescription) instead of today's. */
  onSwapToDay?: (index: number) => void;
  /**
   * Blk2: true while a training block's pace is "lighter" or "easing
   * back in". PROMOTES the 30-minute option to the primary slot and
   * demotes the full session — it never removes a choice, and the full
   * plan stays one tap. This is what makes the pace copy true; without
   * it "shorter sessions" described nothing.
   */
  blockPrefersShorter?: boolean;
}

export default function ExpressSessionSheet({
  open,
  day,
  easierRecommendation = null,
  onClose,
  onStart,
  lighterDay = null,
  onSwapToDay,
  blockPrefersShorter = false,
}: ExpressSessionSheetProps) {
  if (!day) return null;

  const variants = expressChoices(day);
  // Only promote when the short session is actually on offer for this
  // day — a day too small to trim has no express30, and promoting a
  // choice that isn't there would leave the sheet with no primary.
  const promote = blockPrefersShorter && variants.includes("express30");
  const choices: Choice[] = variants.map((variant) => {
    if (variant === "full") {
      return {
        id: "full",
        label: `Full session · ~${estimateSessionMinutes(day.exercises)} min`,
        variant: promote ? "secondary" : "primary",
        onSelect: async () => onStart("full"),
      };
    }
    const plan = buildExpressSession(day, variant);
    const minutes = variant === "express45" ? 45 : 30;
    const promoted = promote && variant === "express30";
    return {
      id: variant,
      label: `${minutes} min · ${summarizeTrim(plan.trim)}`,
      sublabel: promoted
        ? "Your block is running lighter sessions."
        : undefined,
      variant: promoted ? "primary" : "secondary",
      onSelect: async () => onStart(variant),
    };
  });

  // Always offered (PROGRAM-ADAPT-01) — same exercises, reduced.
  const easierPlan = buildEasierSession(day);
  choices.push({
    id: "easier_today",
    label: `Easier today · ${summarizeEasier(easierPlan)}`,
    sublabel: easierRecommendation?.recommended
      ? `Recommended — ${easierRecommendation.reason}`
      : undefined,
    variant: "secondary",
    onSelect: async () => onStart("easier_today"),
  });

  // Backlog #1 (Helms H1), quietly-visible per the presentation policy:
  // one plain row, no jargon, only when a meaningfully lighter session
  // exists. Swapping launches that day untouched — today's day stays in
  // the week (lifts are split-ordered, ADR-0002).
  if (lighterDay && onSwapToDay) {
    const swapIndex = lighterDay.index;
    choices.push({
      id: "lighter_day",
      label: `Do ${lighterDay.day.dayName} instead · ~${lighterDay.minutes} min`,
      sublabel: "The lighter session in your week — today's stays planned.",
      variant: "secondary",
      onSelect: async () => onSwapToDay(swapIndex),
    });
  }

  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title="How do you want to train today?"
      description={
        promote
          ? "Your block is running lighter sessions, so the short one is first. The full plan is still here whenever you want it."
          : "Full plan is the default. Short on time or feeling beat up — pick the honest version. Your programme doesn't change."
      }
      choices={choices}
      logTag="sessionChooser"
    />
  );
}
