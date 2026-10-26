import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, GraduationCap } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { Button } from "@/components/ui/Button";
import {
  detectExperienceSuggestion,
  suggestionSignature,
  type ExperienceDetectionContext,
} from "@/features/program/experienceDetection";
import type { WorkoutDay } from "@/features/program/programTypes";
import { levelSuggestionCopy } from "@/features/program/levelSuggestionCopy";
import Card from "@/components/ui/Card";
import { withSign } from "@/utils/formatters";

/**
 * Evidence-triggered training-level suggestion (experience auto-detection).
 *
 * Renders null almost always: it appears only when the v2 classifier's full
 * exhaustion criteria hold (`detectExperienceSuggestion` — flat e1RM with
 * honest misses AND a survived load reset, on ≥2 mains, in a mature
 * programme, outside a cut), and never again for a suggestion the user
 * dismissed. The card carries its evidence (per-lift session counts and
 * e1RM deltas) and states its criteria, because "what's this based on?"
 * must be answerable from the card itself. It NEVER changes the level:
 * "Review level" deep-links to the plan editor.
 *
 * It sits above the day's session, so it says itself in a title and one
 * line, with its actions; the explanation, the evidence and the criteria
 * open under Read more, and the session stays on the first screen.
 */
export default function ExperienceSuggestionCard({
  workouts,
  context,
  suppressed = false,
}: {
  workouts: readonly WorkoutDay[] | undefined;
  /** programState.weekNumber + goal — the promotion gates' inputs. */
  context?: ExperienceDetectionContext;
  /** True while a week-level notice (the recovery reduction or a deload
   *  recommendation) is on the page: advice waits its turn, one at a time
   *  (`programNotices`). The suggestion comes back once that notice has
   *  gone; nothing is dismissed. */
  suppressed?: boolean;
}) {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  const suggestion = useMemo(
    () => detectExperienceSuggestion(workouts, profile?.experience, context),
    [workouts, profile?.experience, context]
  );

  if (!suggestion || suppressed) return null;
  const signature = suggestionSignature(suggestion);
  if (profile?.experienceSuggestionDismissed?.signature === signature) {
    return null;
  }

  const copy = levelSuggestionCopy(suggestion, profile?.primaryGoal);

  return (
    <Card className="mt-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <GraduationCap className="size-4 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.summary}</p>
        </div>
      </div>

      <details className="group mt-1 pl-12">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-lifting-strong [&::-webkit-details-marker]:hidden">
          Read more
          <ChevronDown
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <p className="text-sm text-muted-foreground">{copy.body}</p>

        {/* The evidence itself — the answer to "what's this based on?". */}
        <div className="mt-3 space-y-1.5">
          {suggestion.evidence.slice(0, 3).map((e) => (
            <div
              key={e.exerciseId}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-muted px-3 py-2"
            >
              <span className="text-sm text-foreground truncate">{e.name}</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
                {e.sessions} sessions · {Math.round(e.spanDays / 7)} wks · e1RM{" "}
                {withSign(e.deltaPct, String(Math.abs(e.deltaPct)))}%
              </span>
            </div>
          ))}
        </div>

        <p className="mt-2 text-caption text-muted-foreground">{copy.basis}</p>
      </details>

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
    </Card>
  );
}
