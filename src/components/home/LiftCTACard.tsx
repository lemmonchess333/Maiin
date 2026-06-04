import { THEME } from "@/lib/theme";
import { m as motion } from "framer-motion";
import { Dumbbell, Play } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export default function LiftCTACard({
  nextWorkout,
  navigate,
  muscleGroups,
  isFirst = false,
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
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={function () {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "today_workout" });
        navigate("/program");
      }}
      className="w-full rounded-xl bg-card text-left p-4"
      style={{ backgroundColor: THEME.lifting + "14" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: THEME.lifting + "18" }}
        >
          <Dumbbell className="size-5" style={{ color: THEME.lifting }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-semibold mb-0.5"
            style={{ color: THEME.lifting }}
          >
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
        <div
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm"
          style={{
            background: `linear-gradient(135deg, ${THEME.lifting}, ${THEME.liftingLight})`,
            color: "white",
          }}
        >
          <Play className="size-3" fill="white" />
          View
        </div>
      </div>
    </motion.button>
  );
}
