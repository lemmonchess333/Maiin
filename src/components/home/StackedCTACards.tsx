import { motion, AnimatePresence } from "framer-motion";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import WaterCard from "@/components/home/WaterCard";
import WeightStepsTiles from "@/components/home/WeightStepsTiles";
import WelcomeBackCard from "@/components/home/WelcomeBackCard";

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0, 0, 0.2, 1] as const } } };

export type UserSegment = "new" | "active" | "returning" | "casual";

export default function StackedCTACards({ nextWorkout, todayType, navigate, waterGlasses, waterTarget, onAddWater, onRemoveWater, lastWeight, weightUnit, onLogWeight, lastWeightDate, todayRun, userSegment, muscleGroups }: {
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
  userSegment: UserSegment;
  muscleGroups?: string;
}) {
  const showLift = (todayType === "lift" || todayType === "both") && nextWorkout;
  const showRun = todayType === "run" || todayType === "both";

  const liftCard = showLift && nextWorkout ? (
    <motion.div key="lift" variants={fadeUp}>
      <LiftCTACard nextWorkout={nextWorkout} navigate={navigate} muscleGroups={muscleGroups} />
    </motion.div>
  ) : null;
  const runCard = showRun ? (
    <motion.div key="run" variants={fadeUp}>
      <RunCTACard todayRun={todayRun} navigate={navigate} />
    </motion.div>
  ) : null;
  const waterCard = (
    <motion.div key="water" variants={fadeUp} className="space-y-3">
      <WaterCard waterGlasses={waterGlasses} waterTarget={waterTarget} onAddWater={onAddWater} onRemoveWater={onRemoveWater} />
    </motion.div>
  );
  const weightTiles = (
    <motion.div key="weight" variants={fadeUp}>
      <WeightStepsTiles lastWeight={lastWeight} weightUnit={weightUnit} onLogWeight={onLogWeight} lastWeightDate={lastWeightDate} />
    </motion.div>
  );

  return (
    <motion.div className="space-y-3" initial="hidden" animate="visible" variants={stagger}>
      {userSegment === "returning" && (
        <motion.div variants={fadeUp}>
          <AnimatePresence>
            <WelcomeBackCard />
          </AnimatePresence>
        </motion.div>
      )}
      {liftCard}
      {runCard}
      {waterCard}
      {weightTiles}
    </motion.div>
  );
}
