import { motion } from "framer-motion";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import ActionPills from "@/components/home/ActionPills";
import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import HealthScoreCard from "@/components/home/HealthScoreCard";
import WaterCard from "@/components/home/WaterCard";
import WeightStepsTiles from "@/components/home/WeightStepsTiles";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0, 0, 0.2, 1] as const } } };

export default function StackedCTACards({ nextWorkout, todayType, navigate, waterGlasses, waterTarget, onAddWater, onRemoveWater, lastWeight, weightUnit, onLogWeight, lastWeightDate, todayRun, healthScore, prevHealthScore }: {
  nextWorkout: { dayName: string; dayType: string; exercises: { name: string }[] } | null;
  todayType: "lift" | "run" | "both" | "rest";
  navigate: (p: string) => void;
  waterGlasses: number;
  waterTarget: number;
  onAddWater: () => void;
  onRemoveWater: () => void;
  lastWeight: string | null;
  weightUnit: string;
  onLogWeight: () => void;
  lastWeightDate: string;
  todayRun: ScheduledRunDay | null;
  healthScore: number | null;
  prevHealthScore: number | null;
}) {
  const showLift = (todayType === "lift" || todayType === "both") && nextWorkout;
  const showRun = todayType === "run" || todayType === "both";

  return (
    <motion.div className="space-y-2" initial="hidden" animate="visible" variants={stagger}>
      <motion.div variants={fadeUp}>
        <ActionPills showRun={showRun} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <HealthScoreCard healthScore={healthScore} prevHealthScore={prevHealthScore} />
      </motion.div>
      {showLift && nextWorkout && (
        <motion.div variants={fadeUp}>
          <LiftCTACard nextWorkout={nextWorkout} navigate={navigate} />
        </motion.div>
      )}
      {showRun && (
        <motion.div variants={fadeUp}>
          <RunCTACard todayRun={todayRun} navigate={navigate} />
        </motion.div>
      )}
      <motion.div variants={fadeUp} className="space-y-3">
        <WaterCard waterGlasses={waterGlasses} waterTarget={waterTarget} onAddWater={onAddWater} onRemoveWater={onRemoveWater} />
      </motion.div>
      <motion.div variants={fadeUp}>
        <WeightStepsTiles lastWeight={lastWeight} weightUnit={weightUnit} onLogWeight={onLogWeight} lastWeightDate={lastWeightDate} />
      </motion.div>
    </motion.div>
  );
}
