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
import type { LiftUnit } from "@/lib/liftLoad";
import { heroLead, type HeroLine } from "@/lib/homeHero";

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
 * Today's session as Home's hero (DS4), with the stack's other pieces:
 * a session under way that is not today's leads on a strip of its own, so
 * it is the first thing seen; on a day with two sessions the second is a
 * compact card under the hero; a lifting day with no workout linked says
 * so. Water, weight and food live further down Home: they are the day's
 * vitals, not its session.
 *
 * Which sessions show, and what each says, is decided by `todaySession`;
 * this draws the answer, and `heroLead` (homeHero.ts) gives the same lead
 * for the kicker. Each piece carries the `data-guide-stop` the
 * first-visit walk points at (`todayCardTarget` in firstGuide.ts names the
 * same three).
 */
export default function StackedCTACards({
  session,
  navigate,
  unit,
  liftUnit = "kg",
  freeRunLine = null,
}: {
  /** Today's session, as `todaySession` decided it. */
  session: TodaySession;
  navigate: (p: string) => void;
  /** The reader's unit: a long run is named in it. */
  unit: DistanceUnit;
  /** The lifter's unit, for the hero line's loads. */
  liftUnit?: LiftUnit;
  /** A free run's line, the week's distance (`freeRunHeroLine`), drawn
   *  when the hero is a run with no plan behind it. */
  freeRunLine?: HeroLine | null;
}) {
  const { lift, run, rest } = session;
  // On a day with both, the run leads when running is the person's aim,
  // when the lift has no workout to draw, and when the lift is done and
  // the run is not (`heroLead`, which the label beside the date reads too).
  const runLeads = !!run && heroLead(session) === "run";
  const runCard = run && (
    <motion.div key="run" variants={fadeUp} data-guide-stop="today-run">
      <RunCTACard
        todayRun={run.runDay}
        racePace={run.racePace}
        completed={run.completed}
        navigate={navigate}
        dose={run.dose}
        unit={unit}
        inProgress={run.inProgress}
        startTarget={run.startTarget}
        easyPaceSPerKm={run.easyPaceSPerKm}
        intervalPaceSPerKm={run.intervalPaceSPerKm}
        freeLine={freeRunLine}
        variant={runLeads ? "hero" : "compact"}
      />
    </motion.div>
  );
  const liftCard = lift?.workout ? (
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
        unit={liftUnit}
        variant={runLeads ? "compact" : "hero"}
      />
    </motion.div>
  ) : lift ? (
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
  ) : null;

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
      {runLeads ? (
        <>
          {runCard}
          {liftCard}
        </>
      ) : (
        <>
          {liftCard}
          {runCard}
        </>
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
          {/* Rest-day hero. Previously neither lift nor run rendered on
              rest days and the page looked half-empty — users couldn't
              distinguish "scheduled rest" from "something broke". The
              first-workout and free-run offers say what they are in the
              kicker beside the date (`heroKicker`). */}
          {rest.kind === "first-workout" ? (
            <LiftCTACard
              nextWorkout={rest.workout}
              dayLabel={rest.name}
              rest={session.restContext}
              navigate={navigate}
              muscleGroups={rest.muscleGroups}
              dayTarget={rest.dayTarget}
              startTarget={rest.startTarget}
              inProgress={rest.inProgress}
              unit={liftUnit}
            />
          ) : rest.kind === "free-run" ? (
            <RunCTACard
              todayRun={null}
              navigate={navigate}
              unit={unit}
              inProgress={rest.inProgress}
              startTarget={rest.startTarget}
              freeLine={freeRunLine}
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
