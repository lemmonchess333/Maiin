import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { Button } from "@/components/ui/Button";
import {
  detectExperienceSuggestion,
  suggestionSignature,
  type ExperienceSuggestion,
} from "@/features/program/experienceDetection";
import type { WorkoutDay } from "@/features/program/programTypes";

/**
 * Evidence-triggered training-level suggestion (experience auto-detection).
 *
 * Renders null almost always: it appears only when ≥2 main lifts' histories
 * contradict the stored experience level (`detectExperienceSuggestion`), and
 * never again for a suggestion the user dismissed
 * (`profile.experienceSuggestionDismissed`). It NEVER changes the level —
 * "Review level" deep-links to the plan editor where the experience control
 * lives, keeping the blocks' no-silent-rewrite rule.
 */
export default function ExperienceSuggestionCard({
  workouts,
}: {
  workouts: readonly WorkoutDay[] | undefined;
}) {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  const suggestion = useMemo(
    () => detectExperienceSuggestion(workouts, profile?.experience),
    [workouts, profile?.experience]
  );

  if (!suggestion) return null;
  const signature = suggestionSignature(suggestion);
  if (profile?.experienceSuggestionDismissed?.signature === signature) {
    return null;
  }

  const liftNames = suggestion.evidence.slice(0, 2).map((e) => e.name);
  const copy = copyFor(suggestion, liftNames);

  return (
    <div className="mt-3 rounded-xl bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <GraduationCap className="size-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            haptic("light");
            navigate("/settings/lift-plan");
          }}
        >
          Review level
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            haptic("light");
            void updateProfile({
              experienceSuggestionDismissed: { signature, at: Date.now() },
            });
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function copyFor(
  suggestion: ExperienceSuggestion,
  liftNames: string[]
): { title: string; body: string } {
  const lifts =
    liftNames.length >= 2
      ? `${liftNames[0]} and ${liftNames[1]}`
      : liftNames[0];
  const sessions = suggestion.evidence[0]?.sessions ?? 6;
  if (suggestion.to === "intermediate") {
    return {
      title: "Ready for intermediate programming?",
      body:
        `${lifts} haven't gained across your last ${sessions} sessions. ` +
        "That usually means session-to-session progression has done its job — " +
        "intermediate programming varies your rep days and deloads on volume " +
        "to keep progress coming.",
    };
  }
  return {
    title: "You could progress faster",
    body:
      `You're still adding weight nearly every session on ${lifts}. ` +
      "The beginner scheme rides that wave with one simple target per lift — " +
      "you can switch back the moment progress slows.",
  };
}
