import InlineNumerals from "@/components/ui/InlineNumerals";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export default function LiftCTACard({
  nextWorkout,
  navigate,
  muscleGroups,
  isFirst = false,
  dayIndex = null,
  isStartable = true,
  status,
}: {
  purpose?: string | null;
  nextWorkout: {
    completed?: boolean;
    skipped?: boolean;
    dayName: string;
    dayType: string;
    exercises: { name: string }[];
  };
  navigate: (p: string) => void;
  muscleGroups?: string;
  /** #972 cold-start framing: frame this as the user's first workout. */
  isFirst?: boolean;
  /** HOME-ACTION-01: index into programState.workouts for the exact
   *  Programme day this CTA represents, so the tap deep-links to that day
   *  (`?day=N`) instead of a bare `/program`. Null → bare `/program`. */
  dayIndex?: number | null;
  /** HOME-ACTION-01: false when the lift slot is already completed/skipped
   *  (terminal). The pill names its status and the tap opens the day to review
   *  rather than framing a finished session as launchable. */
  isStartable?: boolean;
  status?: "none" | "planned" | "completed" | "skipped";
}) {
  // Deep-link to the exact Programme day; both startable and terminal
  // slots open there (the pill signals which). Bare /program only when
  // the resolver couldn't map an index.
  const target =
    typeof dayIndex === "number" ? `/program?day=${dayIndex}` : "/program";
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
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={function () {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "today_workout" });
        navigate(target);
      }}
      type="button"
      className="w-full rounded-xl bg-lifting/8 text-left p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 rounded-lg flex items-center justify-center bg-lifting/9">
          <Dumbbell className="size-5 text-lifting" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Deliberately NOT the run card's "Today · Run day", though the
              two cards are otherwise twins. ADR-0002: runs are date-pinned,
              so naming the day IS the run's identity; lifts are
              split-ordered, and the session that comes next is the Programme
              cursor's call, not this weekday's. Home resolves a lift by
              weekday (liftIndexForDayOfWeek), which is the right thing for a
              calendar surface to draw and the wrong thing to assert as "the
              next session" — tapping through to a day the rotation has not
              reached yet left this card saying "Today" over a session the
              Programme tab called "Upcoming". "Planned for today" is what
              this surface actually knows, and it reads as plan-vs-progress
              beside the cursor rather than as a contradiction. */}
          <p className="text-xs font-semibold mb-0.5 text-lifting-strong">
            {isFirst ? "Your first workout" : "Planned for today"}
          </p>
          <p className="text-base font-bold leading-snug text-foreground">
            <InlineNumerals>{nextWorkout.dayName}</InlineNumerals>
          </p>
          <p className="mt-1 text-micro leading-relaxed text-muted-foreground">
            <InlineNumerals>
              {`${nextWorkout.exercises.length} ${nextWorkout.exercises.length === 1 ? "exercise" : "exercises"}`}
            </InlineNumerals>
            {muscleGroups && <> · {muscleGroups}</>}
          </p>
        </div>
        {state === "planned" ? (
          <div
            className="flex min-h-11 shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${THEME.lifting}, ${THEME.liftingLight})`,
              color: "white",
            }}
          >
            {/* No leading chevron. A right-pointing arrow BEFORE the word
                reads as a stray character rather than an affordance —
                chevrons in this app sit at the far right of a row, never
                inside a pill. The run card's own pill is bare "View run",
                so dropping it also puts the matched pair back in step. */}
            View
          </div>
        ) : (
          // HOME-ACTION-01: a completed/skipped lift is not launchable —
          // show its actual completion status.
          <div className="flex min-h-11 shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-muted text-muted-foreground">
            {statusLabel}
          </div>
        )}
      </div>
    </motion.button>
  );
}
