/**
 * Express Session chooser (PROGRAM-FLEX-01).
 *
 * Opens on "Begin Workout" ONLY when a shorter budget would actually
 * change the session (`expressChoices(day).length > 1`) — a day that
 * already fits 30 minutes starts directly, keeping the primary action
 * one tap. Full is always the visually-primary choice; Express is an
 * explicit opt-in, never a default.
 *
 * Each option shows the post-trim estimate and what the trim costs
 * ("2 accessories trimmed") so the choice is informed, not magic. The
 * trimming itself is `buildExpressSession` — deterministic, primaries
 * always preserved, stored programme never mutated.
 */

import { ChoiceSheet, type Choice } from "@/components/ui/ChoiceSheet";
import {
  buildExpressSession,
  estimateSessionMinutes,
  expressChoices,
  summarizeTrim,
  type SessionVariant,
} from "@/features/program/expressSession";
import type { WorkoutDay } from "@/features/program/programTypes";

interface ExpressSessionSheetProps {
  open: boolean;
  day: WorkoutDay | null;
  onClose: () => void;
  /** Fires with the chosen variant; the caller builds the plan and
   *  opens the session. */
  onStart: (variant: SessionVariant) => void;
}

export default function ExpressSessionSheet({
  open,
  day,
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

  return (
    <ChoiceSheet
      open={open}
      onClose={onClose}
      title="How much time do you have?"
      description="Short on time? Do the most valuable version — primary lifts stay, accessories trim. Your programme doesn't change."
      choices={choices}
      logTag="expressSession"
    />
  );
}
