import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, Play } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";

export default function LiftCTACard({ nextWorkout, navigate, muscleGroups }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] };
  navigate: (p: string) => void;
  muscleGroups?: string;
}) {
  return (
    <motion.button whileTap={{ scale: 0.97 }}
      onClick={function() {
        haptic();
        trackHomeEvent("home_card_tapped", { card: "today_workout" });
        navigate("/program");
      }}
      className="w-full rounded-xl bg-card text-left p-4"
      style={{ backgroundColor: THEME.lifting + "14" }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: THEME.lifting + "18" }}>
          <Dumbbell className="w-5 h-5" style={{ color: THEME.lifting }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold mb-0.5" style={{ color: THEME.lifting }}>Today · Lift day</p>
          <p className="text-sm font-bold text-foreground truncate">{nextWorkout.dayName}</p>
          <p className="text-micro text-muted-foreground capitalize">{muscleGroups || `${nextWorkout.dayType} · ${nextWorkout.exercises.length} exercises`}</p>
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm" style={{ background: `linear-gradient(135deg, ${THEME.lifting}, ${THEME.liftingLight})`, color: "white" }}>
          <Play className="w-3 h-3" fill="white" />View
        </div>
      </div>
    </motion.button>
  );
}
