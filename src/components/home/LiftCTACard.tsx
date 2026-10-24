import { useMemo } from "react";
import { Play } from "lucide-react";
import InlineNumerals from "@/components/ui/InlineNumerals";
import MetaLine from "@/components/ui/MetaLine";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import { cardClasses } from "@/components/ui/cardClasses";
import { formArtCutoutUrl, sessionLeadArt } from "@/lib/formArtCutouts";
import {
  cardSessionMinutes,
  type PricedExercise,
} from "@/features/program/expressSession";
import type { RestContext } from "@/features/program/restTime";
import { liftCardTitle, liftDayLine, liftDayTitle } from "@/lib/liftDayLabel";

type LiftCardExercise = Partial<PricedExercise> & { name: string };

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
  rest,
  dayLabel,
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
  /** How the session's timer will rest, so the minutes price it. */
  rest?: RestContext;
  /** The day as Train names it in its week ("Pull B", `liftDayNameIn`).
   *  Without it a generated day is named by its type alone. */
  dayLabel?: string;
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
  const { category } = liftDayTitle(nextWorkout.dayName);
  /* A generated day is titled as Train names it in its week ("Pull B");
     its name carries no category, so the eyebrow says "Planned for today",
     which is what this surface knows and reads as plan beside Train's
     cursor rather than contradicting it (ADR-0002: Home resolves a lift by
     weekday, Train by rotation; liftCardRegister.test.tsx). A custom name
     with a dash keeps its first half above. No week number or rotation
     count: Home shows the session and its dose, and the rest lives in the
     day's details (owner direction). */
  const title = liftCardTitle(nextWorkout.dayName, dayLabel);
  const eyebrow = eyebrowLabel ?? category ?? "Planned for today";
  const minutes = useMemo(
    () => cardSessionMinutes(nextWorkout.exercises, rest),
    [nextWorkout.exercises, rest]
  );
  const art = useMemo(
    () => sessionLeadArt(nextWorkout.exercises)?.cutout ?? null,
    [nextWorkout.exercises]
  );

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
        aria-label={`Open ${dayLabel ?? liftDayLine(nextWorkout.dayName)} in Train`}
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
          className="exercise-drawing pointer-events-none absolute right-2 top-3 z-0 h-[136px] w-[42%] object-contain object-right-top @max-[14em]:hidden"
        />
      )}
      <div
        className={
          "pointer-events-none relative z-10 px-5 pt-5 " +
          (art ? "pr-[46%] @max-[14em]:pr-5" : "")
        }
      >
        <p className="text-sm font-bold text-lifting-strong">
          <InlineNumerals>{eyebrow}</InlineNumerals>
        </p>
        <p className="mt-1 text-h2 font-extrabold leading-tight tracking-tight text-foreground text-balance">
          <InlineNumerals>{title}</InlineNumerals>
        </p>
        {/* The dose and the day's muscles, each a fact line whose
            separators never end or open a line ("3 exercises ·" alone
            on a 375px phone), and whose facts each stay whole. */}
        <MetaLine
          className="mt-2 font-medium"
          items={[
            `${count} ${count === 1 ? "exercise" : "exercises"}`,
            ...(minutes !== null ? [`about ${minutes} min`] : []),
          ]}
        />
        {muscleGroups && (
          <MetaLine className="font-medium" items={muscleGroups.split(" · ")} />
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
