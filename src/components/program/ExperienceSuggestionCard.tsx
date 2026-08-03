import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptic";
import { Button } from "@/components/ui/Button";
import {
  detectExperienceSuggestion,
  suggestionSignature,
  type ExperienceDetectionContext,
  type ExperienceSuggestion,
} from "@/features/program/experienceDetection";
import type { WorkoutDay } from "@/features/program/programTypes";

/**
 * Evidence-triggered training-level suggestion (experience auto-detection).
 *
 * Renders null almost always: it appears only when the v2 classifier's full
 * exhaustion criteria hold (`detectExperienceSuggestion` — flat e1RM with
 * honest misses AND a survived load reset, on ≥2 mains, in a mature
 * programme, outside a cut), and never again for a suggestion the user
 * dismissed. The card SHOWS its evidence — per-lift session counts and e1RM
 * deltas — and states its criteria, because "what's this based on?" must be
 * answerable from the card itself. It NEVER changes the level: "Review
 * level" deep-links to the plan editor.
 */
export default function ExperienceSuggestionCard({
  workouts,
  context,
}: {
  workouts: readonly WorkoutDay[] | undefined;
  /** programState.weekNumber + goal — the promotion gates' inputs. */
  context?: ExperienceDetectionContext;
}) {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  const suggestion = useMemo(
    () => detectExperienceSuggestion(workouts, profile?.experience, context),
    [workouts, profile?.experience, context]
  );

  if (!suggestion) return null;
  const signature = suggestionSignature(suggestion);
  if (profile?.experienceSuggestionDismissed?.signature === signature) {
    return null;
  }

  const copy = copyFor(suggestion);

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
              {e.deltaPct >= 0 ? "+" : ""}
              {e.deltaPct}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-caption text-muted-foreground">{copy.basis}</p>

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

function copyFor(suggestion: ExperienceSuggestion): {
  title: string;
  body: string;
  basis: string;
} {
  if (suggestion.to === "intermediate") {
    return {
      title: "Ready for intermediate programming?",
      body:
        "These lifts have stalled through real missed reps AND a load " +
        "reset — the classic end of session-to-session progress, not just " +
        "a week that needed to be easy. Intermediate programming " +
        "progresses week to week instead.",
      basis:
        "Based only on your logged sessions: a reset and honest misses are " +
        "already in this window, and you're not in a cut. Advanced is " +
        "never suggested automatically — that's a years-of-training " +
        "judgement, and it stays yours.",
    };
  }
  return {
    title: "You could progress faster",
    body:
      "You're still adding weight nearly every session. The beginner " +
      "scheme rides that wave with one simple target per lift — switch " +
      "back the moment progress slows.",
    basis:
      "Based only on your logged sessions: steady session-to-session e1RM " +
      "gains are the definition of the beginner window, whatever the " +
      "calendar says.",
  };
}
