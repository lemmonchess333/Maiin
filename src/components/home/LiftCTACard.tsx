import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, Play } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export default function LiftCTACard({
  nextWorkout,
  navigate,
  muscleGroups,
  isFirst = false,
  dayIndex = null,
  isStartable = true,
}: {
  nextWorkout: {
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
   *  (terminal). The pill reads "Done" and the tap opens the day to review
   *  rather than framing a finished session as launchable. */
  isStartable?: boolean;
}) {
  // Deep-link to the exact Programme day; both startable and terminal
  // slots open there (the pill signals which). Bare /program only when
  // the resolver couldn't map an index.
  const target =
    typeof dayIndex === "number" ? `/program?day=${dayIndex}` : "/program";
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={function () {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "today_workout" });
        navigate(target);
      }}
      className="w-full rounded-xl bg-lifting/8 text-left p-4"
    >
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg flex items-center justify-center bg-lifting/9">
          <Dumbbell className="size-5 text-lifting" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-0.5 text-lifting-strong">
            {isFirst ? "Your first workout" : "Today · Lift day"}
          </p>
          <p className="text-sm font-bold text-foreground truncate">
            {nextWorkout.dayName}
          </p>
          <p className="text-micro text-muted-foreground capitalize">
            {muscleGroups ||
              `${nextWorkout.dayType} · ${nextWorkout.exercises.length} exercises`}
          </p>
        </div>
        {isStartable ? (
          <div
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${THEME.lifting}, ${THEME.liftingLight})`,
              color: "white",
            }}
          >
            <Play className="size-3" fill="white" />
            Start
          </div>
        ) : (
          // HOME-ACTION-01: a completed/skipped lift is not launchable —
          // show a calm "Done" chip instead of a Start button.
          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-muted text-muted-foreground">
            Done
          </div>
        )}
      </div>
    </motion.button>
  );
}
