import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, Play } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function LiftCTACard({ nextWorkout, navigate }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] };
  navigate: (p: string) => void;
}) {
  return (
    <motion.button whileTap={{ scale: 0.97 }}
      onClick={function() { haptic(); navigate("/program"); }}
      className="w-full p-4 rounded-xl bg-card text-left"
      style={{ backgroundColor: THEME.lifting + "08" }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: THEME.iconBg }}>
          <Dumbbell className="w-4 h-4" style={{ color: THEME.lifting }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-micro uppercase tracking-wider mb-0.5" style={{ color: THEME.lifting }}>Today · Lift day</p>
          <p className="text-sm font-semibold text-foreground truncate">{nextWorkout.dayName}</p>
          <p className="text-micro text-muted-foreground capitalize">{nextWorkout.dayType} · {nextWorkout.exercises.length} exercises</p>
        </div>
        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm" style={{ backgroundColor: THEME.lifting, color: "white" }}>
          <Play className="w-3 h-3" fill="white" />View
        </div>
      </div>
    </motion.button>
  );
}
