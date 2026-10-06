/**
 * The plan's rules, on the sheet behind Train's ⓘ and "Why this session"
 * (Lift4 (3)): each one a thing the engine does, in the words a person
 * reads, and only the ones that apply to them. The numbers come from the
 * engine's own constants, so the sheet cannot promise what the plan does
 * not do.
 *
 * Owner call (4): a lift stuck inside its range gets nothing said; the
 * sheet carries "Stuck on a lift? A variation often gets it moving."
 */
import {
  AUTOMATIC_STEP_SHARE,
  BARBELL_STEP_KG,
  LOWERED_SHARE,
  MISSES_BEFORE_LOWERING,
  SMALL_PLATES_STEP_KG,
} from "@/features/program/loadSteps";
import {
  LIGHTER_WEEK_EVERY,
  lighterWeeksScheduled,
} from "@/features/program/weekPrescription";
import {
  EASE_BACK_SHARE,
  LONG_BREAK_DAYS,
  LONG_BREAK_EASE_BACK_SHARE,
  WELCOME_BACK_DAYS,
} from "@/features/program/liftLayoff";
import type { Experience } from "@/features/program/programTypes";
import type { LiftPurposeProgramme } from "@/lib/liftSessionPurpose";

export interface LiftRule {
  id: string;
  title: string;
  body: string;
}

export interface LiftRulesContext {
  experience?: Experience;
  /** The plan's lift days. */
  liftDays: number;
  /** "I have small plates". */
  smallPlates: boolean;
  /** Whether a race plan runs. */
  racing: boolean;
}

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

const word = (n: number) => WORDS[n] ?? String(n);
const capitalised = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
const percent = (share: number) => `${Math.round(share * 100)}%`;
const weeks = (days: number) => `${word(days / 7)} weeks`;
const ordinal = (n: number) => (n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

/** What the rules read from the person's plan and level. */
export function liftRulesContext(
  programme: LiftPurposeProgramme | null | undefined,
  experience: Experience | undefined
): LiftRulesContext {
  return {
    experience,
    liftDays: programme?.workouts?.length ?? 0,
    smallPlates: programme?.settings?.smallPlates === true,
    racing: programme?.runPlan?.mode === "race_prep",
  };
}

/** The rules that apply to this person, in the order the sheet shows them. */
export function liftRules(ctx: LiftRulesContext): LiftRule[] {
  const step = ctx.smallPlates ? SMALL_PLATES_STEP_KG : BARBELL_STEP_KG;
  const scheduled = lighterWeeksScheduled(ctx.experience, ctx.liftDays);
  const takeOne = "You can take one any time from the ⋯ menu on Train.";
  const rules: LiftRule[] = [
    {
      id: "climb",
      title: "Adding weight",
      body: "When every set hits its target, the weight goes up a step next time. Where the target is a range, such as 8–12 reps, the reps climb to the top first, then the weight goes up and the reps start again at the bottom.",
    },
    {
      id: "steps",
      title: "How big a step is",
      body: `A step is ${step} kg on a barbell, the next pair of dumbbells, or the next weight on a machine. A step of more than ${percent(AUTOMATIC_STEP_SHARE)} of the weight is never taken for you: the range stretches instead, and your plan follows when you lift the heavier weight.`,
    },
    {
      id: "follow",
      title: "The weight you lift",
      body: "Your next session starts from the weight you lifted, heavier or lighter. Any number is one tap from changed.",
    },
    {
      id: "misses",
      title: "Missed reps",
      body: `A session short of its target on every set keeps the weight. ${capitalised(word(MISSES_BEFORE_LOWERING))} in a row make the lift ${percent(LOWERED_SHARE)} lighter, and it climbs back a step a session to where it was. After a long or hard run the day before, a miss on a leg lift counts half.`,
    },
    {
      id: "lighter",
      title: "Lighter weeks",
      body: `${
        !scheduled
          ? ctx.experience === "intermediate" || ctx.experience === "advanced"
            ? `Your plan schedules none on ${word(ctx.liftDays)} lift ${ctx.liftDays === 1 ? "day" : "days"} a week.`
            : "Your plan schedules none while you're new to lifting."
          : ctx.racing
            ? "Your lighter weeks fall on your run plan's easier weeks, with half the sets at the same weights."
            : `Every ${ordinal(LIGHTER_WEEK_EVERY)} week you train is lighter, with half the sets at the same weights.`
      } ${takeOne}`,
    },
  ];
  if (ctx.racing) {
    rules.push({
      id: "race",
      title: "Your race",
      body: "The last two weeks before your race are lighter, race week is one short session with nothing heavy for your legs, and the week after is light. If you chose to lighten your leg sessions while your runs build, your leg lifts have a third fewer sets in the build weeks. You can change that in your run plan.",
    });
  }
  rules.push(
    {
      id: "return",
      title: "Coming back after a break",
      body: `After ${weeks(WELCOME_BACK_DAYS)} or more away, Welcome back offers to ease you back in: ${percent(EASE_BACK_SHARE)} lighter, or ${percent(LONG_BREAK_EASE_BACK_SHARE)} after more than ${weeks(LONG_BREAK_DAYS)}, with a set fewer in your first week, then back up a step a session.`,
    },
    {
      id: "swap",
      title: "Swaps and skips",
      body: "Swap an exercise for today, or skip it, from its menu in a session. When you finish, you choose whether a swap stays in your plan.",
    },
    {
      id: "stuck",
      title: "Stuck on a lift?",
      body: "A variation often gets it moving.",
    }
  );
  return rules;
}
