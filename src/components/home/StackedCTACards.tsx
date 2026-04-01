import { motion } from "framer-motion";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import ActionPills from "@/components/home/ActionPills";
import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import HealthScoreCard from "@/components/home/HealthScoreCard";
import WaterCard from "@/components/home/WaterCard";
import WeightStepsTiles from "@/components/home/WeightStepsTiles";

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
    <div className="space-y-2">
      <ActionPills />
      {showLift && nextWorkout && (
        <LiftCTACard nextWorkout={nextWorkout} navigate={navigate} />
      )}
      {showRun && (
        <RunCTACard todayRun={todayRun} navigate={navigate} />
      )}
      <motion.div key="qt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
        className="space-y-3">
        <HealthScoreCard healthScore={healthScore} prevHealthScore={prevHealthScore} />
        <WaterCard waterGlasses={waterGlasses} waterTarget={waterTarget} onAddWater={onAddWater} onRemoveWater={onRemoveWater} />
        <WeightStepsTiles lastWeight={lastWeight} weightUnit={weightUnit} onLogWeight={onLogWeight} lastWeightDate={lastWeightDate} />
      </motion.div>
    </div>
  );
}
