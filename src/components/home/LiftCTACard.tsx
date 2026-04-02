import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";
import { Dumbbell, Play } from "lucide-react";
import { haptic } from "@/lib/haptic";

export default function LiftCTACard({ nextWorkout, navigate, muscleGroups, isPrimary = true }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] };
  navigate: (p: string) => void;
  muscleGroups?: string;
  isPrimary?: boolean;
}) {
  return (
    <motion.button whileTap={{ scale: 0.97 }}
      onClick={function() { haptic(); navigate("/program"); }}
      className={`w-full rounded-xl bg-card text-left ${isPrimary ? 'p-4' : 'p-3'}`}
      style={{ backgroundColor: THEME.lifting + "14" }}>
      <div className="flex items-center gap-3">
        <div className={`${isPrimary ? 'w-10 h-10' : 'w-8 h-8'} rounded-lg flex items-center justify-center`} style={{ backgroundColor: THEME.lifting + "18" }}>
          <Dumbbell className={isPrimary ? "w-5 h-5" : "w-4 h-4"} style={{ color: THEME.lifting }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-micro uppercase tracking-wider mb-0.5" style={{ color: THEME.lifting }}>Today · Lift day</p>
          <p className={`${isPrimary ? 'text-sm' : 'text-xs'} font-bold text-foreground truncate`}>{nextWorkout.dayName}</p>
          {isPrimary && <p className="text-micro text-muted-foreground capitalize">{muscleGroups || `${nextWorkout.dayType} · ${nextWorkout.exercises.length} exercises`}</p>}
        </div>
        <div className={`flex items-center gap-1.5 ${isPrimary ? 'px-3.5 py-2' : 'px-2.5 py-1.5'} rounded-lg text-xs font-bold shadow-sm`} style={{ background: `linear-gradient(135deg, ${THEME.lifting}, ${THEME.liftingLight})`, color: "white" }}>
          <Play className="w-3 h-3" fill="white" />View
        </div>
      </div>
    </motion.button>
  );
}
