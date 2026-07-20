import { motion } from "framer-motion";
import type { ScheduledRunDay } from "@/features/program/runScheduler";
import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import RestDayCard from "@/components/home/RestDayCard";
import FirstMealCard from "@/components/home/FirstMealCard";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0, 0, 0.2, 1] as const },
  },
};

/**
 * Today's session stack (home-declutter 4a, locked 2026-07-20):
 * lift / run / rest cards ONLY — the page's primary action, rendered
 * first in the Today group. Water and weight/steps moved out to Home
 * below the energy row (they're vitals, not the day's mission), and
 * the WelcomeBackCard was deleted outright (returned daily, carried
 * no action — one voice per screen).
 */
export default function StackedCTACards({
  nextWorkout,
  liftDayIndex = null,
  liftStartable = true,
  todayType,
  navigate,
  todayRun,
  muscleGroups,
  firstWorkout = false,
  firstRun = false,
  firstMeal = false,
}: {
  nextWorkout: {
    dayName: string;
    dayType: string;
    exercises: { name: string }[];
  } | null;
  /** HOME-ACTION-01: the resolved lift slot's day index + startability,
   *  threaded to LiftCTACard for `?day=N` deep-linking and the Done state. */
  liftDayIndex?: number | null;
  liftStartable?: boolean;
  todayType: "lift" | "run" | "both" | "rest";
  navigate: (p: string) => void;
  todayRun: ScheduledRunDay | null;
  muscleGroups?: string;
  // #972 cold-start framing flags (day-type-aware, per-domain, 14-day window).
  firstWorkout?: boolean;
  firstRun?: boolean;
  firstMeal?: boolean;
}) {
  const showLift =
    (todayType === "lift" || todayType === "both") && nextWorkout;
  const showRun = todayType === "run" || todayType === "both";
  // Rest-day cue. Previously neither lift nor run rendered on rest
  // days and the page looked half-empty — users couldn't distinguish
  // "scheduled rest" from "something broke". RestDayCard fills the
  // slot with an intentional message and keeps the page rhythm.
  const showRest = todayType === "rest";

  return (
    <motion.div
      className="space-y-3"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      {showLift && nextWorkout && (
        <motion.div key="lift" variants={fadeUp}>
          <LiftCTACard
            nextWorkout={nextWorkout}
            navigate={navigate}
            muscleGroups={muscleGroups}
            isFirst={firstWorkout}
            dayIndex={liftDayIndex}
            isStartable={liftStartable}
          />
        </motion.div>
      )}
      {showRun && (
        <motion.div key="run" variants={fadeUp}>
          <RunCTACard
            todayRun={todayRun}
            navigate={navigate}
            isFirst={firstRun}
          />
        </motion.div>
      )}
      {showRest && (
        <motion.div key="rest" variants={fadeUp}>
          {/* #972: on a rest day a new user has no workout to frame, so
              drive the first meal instead (per-domain: gated on meals === 0
              within the window). */}
          {firstMeal ? <FirstMealCard navigate={navigate} /> : <RestDayCard />}
        </motion.div>
      )}
    </motion.div>
  );
}
