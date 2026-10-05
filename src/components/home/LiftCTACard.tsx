import { useMemo } from "react";
import { Play } from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { cardClasses } from "@/components/ui/cardClasses";
import { formArtCutoutUrl, getFormArtCutout } from "@/lib/formArtCutouts";
import { estimateSessionMinutes } from "@/features/program/expressSession";
import { liftDayTitle } from "@/lib/liftDayLabel";

interface LiftCardExercise {
  name: string;
  exerciseId?: string;
  sets?: number;
  restSeconds?: number;
  weight?: number;
}

/**
 * Today's lift, as Home's lead card (DS3).
 *
 * Two actions, two controls. Start begins the session: it deep-links to
 * the day with `start=1`, and Train starts it the way its own Start does.
 * Anywhere else on the card opens the day in Train to look it over first.
 * A finished or skipped day has no Start; the card says what happened and
 * still opens the day.
 *
 * The drawing is the first exercise in the day that has released art,
 * cut out of its black backdrop (`formArtCutouts`). A day with none shows
 * no picture rather than a stand-in.
 */
export default function LiftCTACard({
  nextWorkout,
  navigate,
  muscleGroups,
  dayIndex = null,
  isStartable = true,
  status,
  eyebrowLabel,
}: {
  nextWorkout: {
    completed?: boolean;
    skipped?: boolean;
    dayName: string;
    dayType: string;
    exercises: LiftCardExercise[];
  };
  navigate: (p: string) => void;
  muscleGroups?: string;
  /** HOME-ACTION-01: index into programState.workouts for the exact
   *  Programme day this card represents, so both actions open that day
   *  (`?day=N`) instead of a bare `/program`. Null → bare `/program`. */
  dayIndex?: number | null;
  /** HOME-ACTION-01: false when the lift slot is already completed/skipped
   *  (terminal). The card names its status and offers no Start. */
  isStartable?: boolean;
  status?: "none" | "planned" | "completed" | "skipped";
  /** Replaces the day's category above the title, for a card that is not
   *  today's planned session (a new person's first workout on a rest day). */
  eyebrowLabel?: string;
}) {
  const dayTarget =
    typeof dayIndex === "number" ? `/program?day=${dayIndex}` : "/program";
  const startTarget =
    typeof dayIndex === "number" ? `${dayTarget}&start=1` : dayTarget;
  const state =
    status ??
    (nextWorkout.completed
      ? "completed"
      : nextWorkout.skipped
        ? "skipped"
        : isStartable
          ? "planned"
          : "none");
  const statusLabel =
    state === "completed"
      ? "Completed"
      : state === "skipped"
        ? "Skipped"
        : "Needs review";

  const count = nextWorkout.exercises.length;
  const { category, title } = liftDayTitle(nextWorkout.dayName);
  /* The eyebrow is the day's category ("Pull"), a fact about the plan.
     A name without one keeps "Planned for today", which is what this
     surface knows and reads as plan beside Train's cursor rather than
     contradicting it (ADR-0002: Home resolves a lift by weekday, Train by
     rotation; liftCardRegister.test.tsx). No week or rotation position:
     Home shows the session and its dose, and the rest lives in the day's
     details (owner direction, 2026-09-09). */
  const eyebrow = eyebrowLabel ?? category ?? "Planned for today";
  const minutes = useMemo(() => {
    const priced = nextWorkout.exercises.filter(
      (ex): ex is LiftCardExercise & { sets: number } =>
        typeof ex.sets === "number" && ex.sets > 0
    );
    return priced.length === count && count > 0
      ? estimateSessionMinutes(priced)
      : null;
  }, [nextWorkout.exercises, count]);
  const art = useMemo(() => {
    for (const ex of nextWorkout.exercises) {
      const cutout = ex.exerciseId ? getFormArtCutout(ex.exerciseId) : null;
      if (cutout) return cutout;
    }
    return null;
  }, [nextWorkout.exercises]);

  return (
    <div
      className={cardClasses({
        tone: "tinted",
        padded: false,
        className: "@container relative overflow-hidden bg-lifting/12",
      })}
    >
      {/* The card-wide preview. It sits beneath the content, which lets
          taps through, so every part of the card that is not Start opens
          the day. A button inside a button would be invalid, which is why
          this is a sibling rather than the card itself. */}
      <button
        type="button"
        onClick={function () {
          haptic();
          trackHomeEvent("home_card_tapped", { card: "today_workout" });
          navigate(dayTarget);
        }}
        aria-label={`Open ${nextWorkout.dayName} in Train`}
        className="absolute inset-0 z-0 rounded-[inherit] motion-safe:active:bg-lifting/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
      />
      {/* The drawing gives the text the card's width once the card is
          under 14em (larger text on the phone): beside it, "about 43 min"
          and the day's name ran past the card at double size. */}
      {art && (
        <img
          src={formArtCutoutUrl(art)}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className="pointer-events-none absolute right-2 top-3 z-0 hidden h-[136px] w-[42%] object-contain object-right-top @min-[14em]:block"
        />
      )}
      <div
        className={
          "pointer-events-none relative z-10 px-5 pt-5 " +
          (art ? "@min-[14em]:pr-[46%]" : "")
        }
      >
        <p className="text-sm font-bold text-lifting-strong">
          <InlineNumerals>{eyebrow}</InlineNumerals>
        </p>
        <p className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground text-balance">
          <InlineNumerals>{title}</InlineNumerals>
        </p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          <InlineNumerals>
            {`${count} ${count === 1 ? "exercise" : "exercises"}`}
          </InlineNumerals>
          {minutes !== null && (
            <>
              {" · "}
              {/* One unit when the line wraps: on a 375px phone the text
                  column beside the drawing broke "about 43" from "min". */}
              <span className="whitespace-nowrap">
                about <span className="font-mono tabular-nums">{minutes}</span>{" "}
                min
              </span>
            </>
          )}
        </p>
        {muscleGroups && (
          <p className="text-sm font-medium text-muted-foreground">
            {muscleGroups}
          </p>
        )}
      </div>
      {/* The action row lets taps through to the preview like the rest of
          the content, so its padding and a status pill open the day. Start
          is the one control that takes its own taps. */}
      <div className="pointer-events-none relative z-10 px-5 pb-5 pt-4">
        {state === "planned" ? (
          <Button
            variant="primary"
            size="lg"
            className="pointer-events-auto w-full"
            onClick={function () {
              haptic();
              trackHomeEvent("home_card_tapped", { card: "today_workout" });
              navigate(startTarget);
            }}
          >
            <Play className="size-4 fill-current" aria-hidden="true" />
            Start workout
          </Button>
        ) : (
          // HOME-ACTION-01: a completed/skipped lift is not launchable —
          // say what happened. The card behind still opens the day.
          <p className="pointer-events-none inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground">
            {statusLabel}
          </p>
        )}
      </div>
    </div>
  );
}
