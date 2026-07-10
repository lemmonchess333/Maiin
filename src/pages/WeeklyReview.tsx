import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Dumbbell,
  Footprints,
  UtensilsCrossed,
  Scale,
  CalendarRange,
  Trophy,
  TrendingDown,
  TrendingUp,
  Minus,
  Sparkles,
  Heart,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWeeklyReview, reviewViewedKey } from "@/hooks/useWeeklyReview";
import { formatWeekRange } from "@/lib/weeklyReviewViewModel";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import SectionLabel from "@/components/ui/SectionLabel";
import { Spinner } from "@/components/ui/Spinner";

function DirectionIcon({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "down")
    return <TrendingDown className="size-4" aria-hidden="true" />;
  if (direction === "up")
    return <TrendingUp className="size-4" aria-hidden="true" />;
  return <Minus className="size-4" aria-hidden="true" />;
}

/**
 * Weekly Review (Rev1) — the Sunday recap. Passive narration of what the
 * engines did over the last completed Sun–Sat week + a static preview of
 * the week ahead. All content rules live in weeklyReviewViewModel; this
 * page is layout only.
 */
export default function WeeklyReview() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { loading, review, weekKey } = useWeeklyReview();

  // D16 — the personal "why", resurfaced. Empty/whitespace = no why set.
  const trainingWhy = profile?.trainingWhy?.trim();

  // Opening the page IS the "viewed" event — it retires the Home entry.
  const { dismiss } = useDismissOnce(
    reviewViewedKey(user?.uid ?? "anon", weekKey)
  );
  useEffect(() => {
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 min-h-[44px] -my-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <div>
          <h1 className="text-xl font-extrabold text-foreground">
            Weekly Review
          </h1>
          {review && (
            <p className="text-xs text-muted-foreground mt-1">
              Last week ·{" "}
              <span className="font-mono tabular-nums">
                {formatWeekRange(review.range.start, review.range.end)}
              </span>
            </p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {!loading && !review && (
          <div className="p-4 rounded-2xl bg-card border border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your first review appears after your first week with a logged
              workout, run, meal or weigh-in.
            </p>
          </div>
        )}

        {!loading && review?.kind === "quiet" && (
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-1.5">
            <h2 className="text-base font-bold text-foreground">
              A quiet week
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nothing logged last week — it happens. The week ahead is a fresh
              start.
            </p>
          </div>
        )}

        {!loading && review?.kind === "normal" && (
          <>
            {/* Headline — PI + delta + templated verdict */}
            {review.headline && (
              <div className="p-4 rounded-2xl bg-card border border-border/50">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-mono tabular-nums text-foreground">
                    {review.headline.pi}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Performance Index
                  </span>
                  {review.headline.delta !== null && (
                    <span
                      className={`ml-auto text-xs font-semibold font-mono tabular-nums px-2 py-0.5 rounded-full ${
                        review.headline.delta >= 0
                          ? "text-success bg-success/10"
                          : "text-muted-foreground bg-muted"
                      }`}
                    >
                      {review.headline.delta >= 0 ? "+" : ""}
                      {review.headline.delta}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {review.headline.verdict}
                </p>
              </div>
            )}

            {/* Training — sport-coded lanes */}
            {review.training && (
              <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
                <SectionLabel as="h2">Training</SectionLabel>
                {review.training.lifts && (
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-lifting/10">
                      <Dumbbell
                        className="size-4 text-lifting"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono tabular-nums">
                        {review.training.lifts.done}
                        {review.training.lifts.planned !== null &&
                          ` of ${review.training.lifts.planned}`}{" "}
                        <span className="font-sans font-normal text-muted-foreground">
                          lifts
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground font-mono tabular-nums">
                        {review.training.lifts.tonnageKg.toLocaleString()} kg
                        total volume
                      </p>
                    </div>
                  </div>
                )}
                {review.training.runs && (
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-running/10">
                      <Footprints
                        className="size-4 text-running"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground font-mono tabular-nums">
                        {review.training.runs.km} km
                        {review.training.runs.planned !== null && (
                          <span className="font-sans font-normal text-muted-foreground">
                            {" "}
                            · {review.training.runs.count} of{" "}
                            {review.training.runs.planned} runs
                          </span>
                        )}
                        {review.training.runs.planned === null && (
                          <span className="font-sans font-normal text-muted-foreground">
                            {" "}
                            · {review.training.runs.count}{" "}
                            {review.training.runs.count === 1 ? "run" : "runs"}
                          </span>
                        )}
                      </p>
                      {review.training.runs.longestKm !== null && (
                        <p className="text-xs text-muted-foreground font-mono tabular-nums">
                          longest {review.training.runs.longestKm} km
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {review.training.prsHit !== null &&
                  review.training.prsHit > 0 && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-success">
                      <Trophy className="size-3.5" aria-hidden="true" />
                      <span className="font-mono tabular-nums">
                        {review.training.prsHit}
                      </span>{" "}
                      {review.training.prsHit === 1 ? "PR" : "PRs"} this week
                    </div>
                  )}
              </div>
            )}

            {/* Nutrition — adherence-neutral */}
            {review.nutrition && (
              <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
                <SectionLabel as="h2">Nutrition</SectionLabel>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-nutrition/10">
                    <UtensilsCrossed
                      className="size-4 text-nutrition"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground font-mono tabular-nums">
                      {review.nutrition.daysLogged}{" "}
                      <span className="font-sans font-normal text-muted-foreground">
                        {review.nutrition.daysLogged === 1 ? "day" : "days"}{" "}
                        logged
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground font-mono tabular-nums">
                      avg {review.nutrition.avgCalories.toLocaleString()} kcal
                      {review.nutrition.target !== null &&
                        ` · target ${review.nutrition.target.toLocaleString()}`}
                    </p>
                  </div>
                </div>
                {review.nutrition.retuned && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles
                      className="size-3.5 text-primary"
                      aria-hidden="true"
                    />
                    Your expenditure estimate updated this week.
                  </div>
                )}
              </div>
            )}

            {/* Body — trend only; respects hide-the-number */}
            {review.body && (
              <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
                <SectionLabel as="h2">Body</SectionLabel>
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                    <Scale className="size-4 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <DirectionIcon direction={review.body.direction} />
                      {review.body.hidden ? (
                        <span>
                          Trend{" "}
                          {review.body.direction === "stable"
                            ? "holding steady"
                            : `moving ${review.body.direction}`}
                        </span>
                      ) : (
                        <span className="font-mono tabular-nums">
                          {review.body.deltaKg! > 0 ? "+" : ""}
                          {review.body.deltaKg} kg{" "}
                          <span className="font-sans font-normal text-muted-foreground">
                            trend this week
                          </span>
                        </span>
                      )}
                    </p>
                    {review.body.projectionDate && (
                      <p className="text-xs text-muted-foreground">
                        On pace for your goal by{" "}
                        <span className="font-mono tabular-nums">
                          {review.body.projectionDate}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* The week ahead — static plan preview (current engine week) */}
        {!loading && review && (
          <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-2">
            <SectionLabel as="h2">The week ahead</SectionLabel>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                <CalendarRange
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="text-sm text-foreground">
                  {review.weekAhead.lifts !== null && (
                    <span className="font-mono tabular-nums font-semibold">
                      {review.weekAhead.lifts}{" "}
                      <span className="font-sans font-normal text-muted-foreground">
                        {review.weekAhead.lifts === 1 ? "lift" : "lifts"}
                      </span>
                    </span>
                  )}
                  {review.weekAhead.lifts !== null &&
                    review.weekAhead.runs !== null && (
                      <span className="text-muted-foreground"> · </span>
                    )}
                  {review.weekAhead.runs !== null && (
                    <span className="font-mono tabular-nums font-semibold">
                      {review.weekAhead.runs}{" "}
                      <span className="font-sans font-normal text-muted-foreground">
                        {review.weekAhead.runs === 1 ? "run" : "runs"}
                      </span>
                    </span>
                  )}
                  {review.weekAhead.lifts === null &&
                    review.weekAhead.runs === null && (
                      <span className="text-muted-foreground">
                        Train when it suits you — log it and it counts.
                      </span>
                    )}
                </p>
                {review.weekAhead.phaseNote && (
                  <p className="text-xs text-muted-foreground">
                    {review.weekAhead.phaseNote}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* D16 — "Your why" reminder. Only when a review exists (so it lands
            in the recap, not on an empty first-week state) and the user set
            one. Calm, brand-tinted, verbatim quote of their reason. */}
        {!loading && review && trainingWhy && (
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-1.5">
            <SectionLabel as="h2">Your why</SectionLabel>
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Heart className="size-4 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug">
                  &ldquo;{trainingWhy}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The reason you started — still worth it.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
