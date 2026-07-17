/**
 * Pre-session chooser (PROGRAM-FLEX-01 + PROGRAM-ADAPT-01).
 *
 * Opens on "Begin Workout" for every programme day: Full is always the
 * visually-primary choice; time-budgeted Express options appear only
 * when trimming would actually change the session; and "Easier today"
 * (PROGRAM-ADAPT-01) is ALWAYS offered — a reduced execution of the
 * same session for rough days, never a default and never auto-applied.
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
}

export default function ExpressSessionSheet({
  open,
  day,
  easierRecommendation = null,
  onClose,
  onStart,
}: ExpressSessionSheetProps) {
  if (!day) return null;

  const variants = expressChoices(day);
  const choices: Choice[] = variants.map((variant) => {
    if (variant === "full") {
      return {
        id: "full",
        label: `Full session · ~${estimateSessionMinutes(day.exercises)} min`,
        variant: "primary",
        onSelect: async () => onStart("full"),
      };
    }
    const plan = buildExpressSession(day, variant);
    const minutes = variant === "express45" ? 45 : 30;
    return {
      id: variant,
      label: `${minutes} min · ${summarizeTrim(plan.trim)}`,
      variant: "secondary",
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

  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title="How do you want to train today?"
      description="Full plan is the default. Short on time or feeling beat up — pick the honest version. Your programme doesn't change."
      choices={choices}
      logTag="sessionChooser"
    />
  );
}
