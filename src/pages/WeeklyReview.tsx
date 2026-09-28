import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { storedKmLabel } from "@/lib/runLabels";
import { distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { useWeeklyReview, reviewViewedKey } from "@/hooks/useWeeklyReview";
import {
  formatWeekRange,
  type WeekBest,
  type WeeklyReview as Review,
} from "@/lib/weeklyReviewViewModel";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatDayMonth } from "@/utils/formatters";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { categoryFigureUri } from "@/lib/muscleFigureSvg";
import { getExerciseById } from "@/lib/exercises";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import MomentumCheckinCard from "@/components/review/MomentumCheckinCard";
import RecapStory, { type RecapSlide } from "@/components/review/RecapStory";
import { CALORIE_UNIT } from "@/utils/formatNutrition";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

/** How long the recap's counts take: the Food ring's count, not the
 *  counter's slower default, so they land before the eye moves on. */
const COUNT_SECONDS = 0.6;

/** One of the week's numbers, big, over the words that say what it is,
 *  with a rule in the colour of its job (DS3's recap card). */
function StatRow({
  rule,
  value,
  caption,
  numeral = true,
  children,
}: {
  /** A background utility for the rule: `bg-lifting`, `bg-running`… */
  rule: string;
  /** The figure, or its count-up (`AnimatedNumber`). */
  value: ReactNode;
  caption: string;
  /** False for a word ("Steady"), which does not take the numeral face. */
  numeral?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn("w-1 shrink-0 rounded-full", rule)}
      />
      <div className="min-w-0 py-0.5">
        <p
          className={cn(
            "text-display font-extrabold leading-none text-foreground",
            numeral && "font-mono tabular-nums"
          )}
        >
          {value}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">{caption}</p>
        {children}
      </div>
    </div>
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** "2 of 3 lifts and 2 runs": the planned count only where a plan exists. */
function sessionsCaption(training: NonNullable<Review["training"]>): string {
  const parts: string[] = [];
  const { lifts, runs } = training;
  if (lifts) {
    parts.push(
      `${lifts.done}${lifts.planned !== null ? ` of ${lifts.planned}` : ""} ${plural(lifts.planned ?? lifts.done, "lift", "lifts")}`
    );
  }
  if (runs) {
    parts.push(
      `${runs.count}${runs.planned !== null ? ` of ${runs.planned}` : ""} ${plural(runs.planned ?? runs.count, "run", "runs")}`
    );
  }
  const total = (lifts?.done ?? 0) + (runs?.count ?? 0);
  return `${plural(total, "session", "sessions")}, ${parts.join(" and ")}`;
}

function YourWeek({
  review,
  next,
  nextLabel,
  onOpenVault,
}: {
  review: Review;
  next: () => void;
  nextLabel: string;
  onOpenVault: (() => void) | null;
}) {
  const unit = useDistanceUnit();
  const { training, nutrition, body, headline } = review;
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-h1 font-extrabold text-foreground">Your week</h2>
      <div className="mt-6 space-y-6">
        {training && (training.lifts || training.runs) && (
          <StatRow
            rule="bg-lifting"
            /* The week's three counts count up as the recap opens (DS3):
               the moment the numbers are the news. Plain text under
               Reduce Motion, from the first paint. */
            value={
              <AnimatedNumber
                value={
                  (training.lifts?.done ?? 0) + (training.runs?.count ?? 0)
                }
                duration={COUNT_SECONDS}
              />
            }
            caption={sessionsCaption(training)}
          />
        )}
        {training?.lifts && (
          <StatRow
            rule="bg-lifting"
            value={
              <AnimatedNumber
                value={training.lifts.tonnageKg}
                duration={COUNT_SECONDS}
              />
            }
            caption="kg lifted"
          />
        )}
        {training?.runs && (
          <StatRow
            rule="bg-running"
            /* Stored KILOMETRES, shown in the reader's unit at every
               step of the count. */
            value={
              <AnimatedNumber
                value={training.runs.km}
                format={(km) => storedKmLabel(km, unit, false, 1)}
                duration={COUNT_SECONDS}
              />
            }
            caption={
              `${distanceUnitLabel(unit)} run` +
              (training.runs.longestKm !== null
                ? `, longest ${storedKmLabel(training.runs.longestKm, unit, true, 1)}`
                : "")
            }
          />
        )}
        {nutrition && (
          <StatRow
            rule="bg-nutrition"
            value={`${nutrition.daysLogged} of 7`}
            caption={`${plural(nutrition.daysLogged, "day", "days")} with food logged`}
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-mono tabular-nums">
                {nutrition.avgCalories.toLocaleString()}
              </span>{" "}
              {CALORIE_UNIT} a day on average
              {nutrition.target !== null && (
                <>
                  , target{" "}
                  <span className="font-mono tabular-nums">
                    {nutrition.target.toLocaleString()}
                  </span>
                </>
              )}
            </p>
            {nutrition.retuned && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Sparkles
                  className="size-3.5 text-lifting-strong"
                  aria-hidden="true"
                />
                Your expenditure estimate updated this week.
              </p>
            )}
          </StatRow>
        )}
        {body && (
          <StatRow
            rule="bg-muted-foreground"
            numeral={!body.hidden}
            /* Hide-the-number: the direction in words, never a figure. */
            value={
              body.hidden || body.deltaKg === null
                ? body.direction === "stable"
                  ? "Steady"
                  : body.direction === "down"
                    ? "Down"
                    : "Up"
                : `${body.deltaKg > 0 ? "+" : ""}${body.deltaKg}`
            }
            caption={
              body.hidden || body.deltaKg === null
                ? "weight trend this week"
                : "kg, weight trend this week"
            }
          >
            {body.projectionDate && (
              <p className="text-sm text-muted-foreground">
                On pace for your goal by{" "}
                <span className="font-mono tabular-nums">
                  {body.projectionDate}
                </span>
              </p>
            )}
            {/* BODY-VAULT-01 — private handoff into the Progress Vault on
                the owner's profile. Plain navigation: carries no number,
                photo, note or body value. */}
            {onOpenVault && (
              <button
                type="button"
                onClick={onOpenVault}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-lifting-strong"
              >
                Progress Vault
              </button>
            )}
          </StatRow>
        )}
      </div>
      <div className="mt-auto space-y-3 pt-8">
        {headline && (
          <div className="space-y-1">
            <p className="text-sm text-foreground">
              <span className="font-mono tabular-nums font-bold">
                {headline.pi}
              </span>{" "}
              performance
              {headline.delta !== null && headline.delta !== 0 && (
                <>
                  , {headline.delta > 0 ? "up" : "down"}{" "}
                  <span className="font-mono tabular-nums">
                    {Math.abs(headline.delta)}
                  </span>
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{headline.verdict}</p>
          </div>
        )}
        <Button variant="secondary" fullWidth onClick={next}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

/** The best's exercise, drawn: its cut-out drawing, else the muscles its
 *  category works, else a trophy. Decorative: the name is beside it. */
function BestArt({ exerciseId }: { exerciseId: string | null }) {
  const cutout = exerciseId ? getFormArtCutout(exerciseId) : null;
  if (cutout) {
    return (
      <img
        src={formArtCutoutUrl(cutout)}
        alt=""
        draggable={false}
        decoding="async"
        className="h-52 w-auto max-w-full object-contain"
      />
    );
  }
  const figure = categoryFigureUri(
    getExerciseById(exerciseId ?? "")?.category ?? ""
  );
  if (figure) {
    return (
      <img src={figure} alt="" draggable={false} className="h-44 w-auto" />
    );
  }
  return (
    <Trophy className="size-16 text-achievement-strong" aria-hidden="true" />
  );
}

function BestMoment({
  best,
  count,
  next,
}: {
  best: WeekBest;
  /** Every new best the week fired, this one included. */
  count: number;
  next: () => void;
}) {
  const more = Math.max(0, count - 1);
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-sm font-semibold text-achievement-strong">
        Best moment
      </h2>
      <div className="mt-4 flex min-h-44 items-center justify-center">
        <BestArt exerciseId={best.exerciseId} />
      </div>
      <div className="mt-4 space-y-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-achievement/15 px-3 py-1 text-sm font-semibold text-achievement-strong">
          <Trophy className="size-4" aria-hidden="true" />
          New best
        </span>
        <p className="text-h2 font-bold text-foreground">{best.exerciseName}</p>
        <p className="text-foreground">
          <span className="text-display font-extrabold font-mono tabular-nums">
            {best.weight}
          </span>
          <span className="text-xl font-semibold text-muted-foreground">
            {" "}
            kg ×{" "}
          </span>
          <span className="text-display font-extrabold font-mono tabular-nums">
            {best.reps}
          </span>
        </p>
        {best.previous && (
          <p className="text-sm text-muted-foreground">
            Previous best{" "}
            <span className="font-mono tabular-nums">
              {best.previous.weight} kg × {best.previous.reps}
            </span>
            , {formatDayMonth(parseLocalDate(best.previous.date))}
          </p>
        )}
        {more > 0 && (
          <p className="text-sm text-muted-foreground">
            And <span className="font-mono tabular-nums">{more}</span> more{" "}
            {plural(more, "new best", "new bests")} this week
          </p>
        )}
      </div>
      <div className="mt-auto pt-8">
        <Button fullWidth onClick={next}>
          The week ahead
        </Button>
      </div>
    </div>
  );
}

function WeekAhead({
  review,
  trainingWhy,
  uid,
  weekKey,
  onDone,
}: {
  review: Review;
  trainingWhy: string | undefined;
  uid: string | null;
  weekKey: string;
  onDone: () => void;
}) {
  const { lifts, runs, phaseNote } = review.weekAhead;
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-h1 font-extrabold text-foreground">The week ahead</h2>
      <div className="mt-6 space-y-6">
        {lifts !== null || runs !== null ? (
          <div className="space-y-1">
            <p className="text-h2 font-bold text-foreground">
              {lifts !== null && (
                <>
                  <span className="font-mono tabular-nums">{lifts}</span>{" "}
                  {plural(lifts, "lift", "lifts")}
                </>
              )}
              {lifts !== null && runs !== null && (
                <span className="text-muted-foreground"> · </span>
              )}
              {runs !== null && (
                <>
                  <span className="font-mono tabular-nums">{runs}</span>{" "}
                  {plural(runs, "run", "runs")}
                </>
              )}
            </p>
            {phaseNote && (
              <p className="text-sm text-muted-foreground">{phaseNote}</p>
            )}
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            Train when it suits you — log it and it counts.
          </p>
        )}

        {/* D16 — the personal "why", resurfaced in the user's own words. */}
        {trainingWhy && (
          <div className="space-y-1.5">
            <SectionHeading size="compact">Why you train</SectionHeading>
            <p className="text-lg font-semibold leading-snug text-foreground">
              &ldquo;{trainingWhy}&rdquo;
            </p>
            <p className="text-sm text-muted-foreground">
              You wrote this when you started.
            </p>
          </div>
        )}

        {/* CHECKIN-01 — disappears for the week once answered or dismissed. */}
        {uid && <MomentumCheckinCard uid={uid} weekKey={weekKey} />}
      </div>
      <div className="mt-auto pt-8">
        <Button fullWidth onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * Weekly Review (Rev1) — the Sunday recap, told as cards (DS3): the week
 * in numbers, its best moment when a new best was set, and the week
 * ahead. All content rules live in weeklyReviewViewModel; this page is
 * layout only.
 */
export default function WeeklyReview() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { loading, review, weekKey } = useWeeklyReview();

  // D16 — the personal "why", resurfaced. Empty/whitespace = no why set.
  const trainingWhy = profile?.trainingWhy?.trim() || undefined;

  // Opening the page IS the "viewed" event — it retires the Home entry.
  const { dismiss } = useDismissOnce(reviewViewedKey(weekKey));
  useEffect(() => {
    dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: opening the page IS the viewed event; `dismiss` takes a new identity per render and must not re-fire
  }, []);

  /* Back to wherever the recap was opened from; opened directly (a
     notification, a bookmark), there is nowhere to go back to, so Home. */
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true });
  };

  const eyebrow = review
    ? `Last week · ${formatWeekRange(review.range.start, review.range.end)}`
    : "Last week";

  let slides: RecapSlide[];
  if (loading) {
    slides = [
      {
        key: "loading",
        label: "Loading",
        render: () => (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ),
      },
    ];
  } else if (!review) {
    slides = [
      {
        key: "none",
        label: "Your first review",
        render: () => (
          <div className="flex flex-1 flex-col">
            <h2 className="text-h1 font-extrabold text-foreground">
              Your first review
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Your first review appears after your first week with a logged
              workout, run, meal or weigh-in.
            </p>
            <div className="mt-auto pt-8">
              <Button fullWidth onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ),
      },
    ];
  } else {
    const best =
      review.kind === "normal" ? (review.training?.best ?? null) : null;
    const ahead: RecapSlide = {
      key: "ahead",
      label: "The week ahead",
      render: () => (
        <WeekAhead
          review={review}
          trainingWhy={trainingWhy}
          uid={user?.uid ?? null}
          weekKey={weekKey}
          onDone={close}
        />
      ),
    };
    if (review.kind === "quiet") {
      slides = [
        {
          key: "quiet",
          label: "A quiet week",
          render: (next) => (
            <div className="flex flex-1 flex-col">
              <h2 className="text-h1 font-extrabold text-foreground">
                A quiet week
              </h2>
              <p className="mt-3 text-base text-muted-foreground">
                Nothing logged last week — it happens. The week ahead is a fresh
                start.
              </p>
              <div className="mt-auto pt-8">
                <Button variant="secondary" fullWidth onClick={next}>
                  The week ahead
                </Button>
              </div>
            </div>
          ),
        },
        ahead,
      ];
    } else {
      slides = [
        {
          key: "week",
          label: "Your week",
          render: (next) => (
            <YourWeek
              review={review}
              next={next}
              nextLabel={best ? "Your best moment" : "The week ahead"}
              onOpenVault={user ? () => navigate(`/user/${user.uid}`) : null}
            />
          ),
        },
        ...(best
          ? [
              {
                key: "best",
                label: "Best moment",
                render: (next: () => void) => (
                  <BestMoment
                    best={best}
                    count={review.training?.prsHit ?? 1}
                    next={next}
                  />
                ),
              },
            ]
          : []),
        ahead,
      ];
    }
  }

  return <RecapStory eyebrow={eyebrow} slides={slides} onClose={close} />;
}
