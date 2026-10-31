import { motion } from "framer-motion";
import type { TodaySession } from "@/lib/todaySession";
import LiftCTACard from "@/components/home/LiftCTACard";
import RunCTACard from "@/components/home/RunCTACard";
import RestDayCard from "@/components/home/RestDayCard";
import FirstMealCard from "@/components/home/FirstMealCard";
import InProgressStrip from "@/components/session/InProgressStrip";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { haptic } from "@/lib/haptic";
import { track as trackHomeEvent } from "@/lib/homeAnalytics";
import type { DistanceUnit } from "@/lib/distanceUnits";

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
 * Today's session stack (home-declutter 4a, locked 2026-07-20; DS3 cards):
 * lift / run / rest cards ONLY — the page's primary action, rendered
 * directly under the week strip. Water and weight/steps moved out to Home
 * below the energy row (they're vitals, not the day's mission), and
 * the WelcomeBackCard was deleted outright (returned daily, carried
 * no action — one voice per screen).
 *
 * Which cards show, and what each says, is decided by `todaySession`; this
 * draws its answer. A session under way that is not today's card leads the
 * stack on a strip of its own, so it is the first thing seen. Each card carries the `data-guide-stop` the first-visit
 * walk points at (`todayCardTarget` in firstGuide.ts names the same three).
 */
export default function StackedCTACards({
  session,
  navigate,
  unit,
}: {
  /** Today's session, as `todaySession` decided it. */
  session: TodaySession;
  navigate: (p: string) => void;
  /** The reader's unit: a long run is named in it. */
  unit: DistanceUnit;
}) {
  const { lift, run, rest } = session;

  return (
    <motion.div
      className="space-y-3"
      initial={false}
      animate="visible"
      variants={stagger}
    >
      {session.inProgressElsewhere?.map((strip) => (
        <motion.div key={`in-progress-${strip.sport}`} variants={fadeUp}>
          <InProgressStrip
            session={strip}
            onResume={() => {
              trackHomeEvent("home_card_tapped", {
                card: strip.sport === "run" ? "today_run" : "today_workout",
                action: strip.reviewPending ? "review" : "resume",
              });
              navigate(strip.resumeTarget);
            }}
          />
        </motion.div>
      ))}
      {lift?.workout && (
        <motion.div key="lift" variants={fadeUp} data-guide-stop="today-lift">
          <LiftCTACard
            nextWorkout={lift.workout}
            dayLabel={lift.name ?? undefined}
            rest={session.restContext}
            navigate={navigate}
            muscleGroups={lift.muscleGroups}
            dayTarget={lift.dayTarget}
            startTarget={lift.startTarget}
            isStartable={lift.isStartable}
            status={lift.status}
            inProgress={lift.inProgress}
          />
        </motion.div>
      )}
      {lift && !lift.workout && (
        <motion.div key="lift-recovery" variants={fadeUp}>
          {/* Legacy schedules can outnumber the programme's workouts.
              Keep the next-session choice with Programme's rotation
              (ADR-0002), without deep-linking to an overflow index. */}
          <Banner
            variant="neutral"
            title="Check your lifting plan"
            description="Today is a lifting day, but no workout is linked. Open your programme to review your weekly layout."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  haptic();
                  trackHomeEvent("home_card_tapped", {
                    card: "today_workout",
                    action: "details",
                  });
                  navigate("/program");
                }}
              >
                Open programme
              </Button>
            }
          />
        </motion.div>
      )}
      {run && (
        <motion.div key="run" variants={fadeUp} data-guide-stop="today-run">
          <RunCTACard
            todayRun={run.runDay}
            racePace={run.racePace}
            completed={run.completed}
            navigate={navigate}
            isFirst={run.isFirst}
            dose={run.dose}
            unit={unit}
            inProgress={run.inProgress}
            startTarget={run.startTarget}
          />
        </motion.div>
      )}
      {rest && (
        <motion.div
          key="rest"
          variants={fadeUp}
          data-guide-stop={
            rest.kind === "first-workout"
              ? "today-lift"
              : rest.kind === "free-run"
                ? "today-run"
                : "today-rest"
          }
        >
          {/* Rest-day cue. Previously neither lift nor run rendered on rest
              days and the page looked half-empty — users couldn't
              distinguish "scheduled rest" from "something broke". */}
          {rest.kind === "first-workout" ? (
            <LiftCTACard
              nextWorkout={rest.workout}
              dayLabel={rest.name}
              rest={session.restContext}
              navigate={navigate}
              dayTarget={rest.dayTarget}
              startTarget={rest.startTarget}
              eyebrowLabel="Your first workout"
              inProgress={rest.inProgress}
            />
          ) : rest.kind === "free-run" ? (
            <RunCTACard
              todayRun={null}
              navigate={navigate}
              eyebrowLabel="Run when it suits you"
              unit={unit}
              inProgress={rest.inProgress}
              startTarget={rest.startTarget}
            />
          ) : rest.kind === "first-meal" ? (
            <FirstMealCard navigate={navigate} />
          ) : (
            <RestDayCard tomorrow={rest.tomorrow} navigate={navigate} />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
