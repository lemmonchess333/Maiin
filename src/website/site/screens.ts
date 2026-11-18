/**
 * The app's screens the website shows, each captured on the emulator rig
 * from the demo accounts and never a real person's (src/website/screens/
 * README.md says how, and how to capture them again). `alt` says what the
 * screen shows, for a screen reader.
 */
import feed from "@/website/screens/feed.webp";
import food from "@/website/screens/food.webp";
import home from "@/website/screens/home.webp";
import liftBest from "@/website/screens/lift-best.webp";
import progress from "@/website/screens/progress.webp";
import proPlans from "@/website/screens/pro-plans.webp";
import racePlan from "@/website/screens/race-plan.webp";
import review from "@/website/screens/review.webp";
import run from "@/website/screens/run.webp";
import runBest from "@/website/screens/run-best.webp";
import together from "@/website/screens/together.webp";
import train from "@/website/screens/train.webp";
import workout from "@/website/screens/workout.webp";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

export interface AppScreenImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

/** A screen 440 points wide (the App Store's 6.9-inch frame), cut at the
 *  tab bar's foot so nothing peeks from under it, or 393 by 852; saved 660
 *  pixels wide. */
const TALL = { width: 660, height: 1376 } as const;
const PHONE = { width: 660, height: 1431 } as const;

export const SCREENS = {
  home: {
    src: home,
    ...TALL,
    alt: "Tropos’s Home screen: today’s session, Full Body A, about 59 minutes, with a drawing of a barbell squat and a Start workout button.",
  },
  train: {
    src: train,
    ...TALL,
    alt: "The Train screen: the week’s lifts in order, Full Body A, B and C, with each exercise’s sets, reps and last weights.",
  },
  workout: {
    src: workout,
    width: 660,
    height: 1434,
    alt: "A workout in progress: barbell squat sets with weights and reps filled in, four warm-up sets and two working sets ticked off.",
  },
  food: {
    src: food,
    width: 660,
    height: 1425,
    alt: `The Food screen: 410 ${CALORIE_UNIT} left of 2,200, with protein, carbs and fat left, and four meals logged today.`,
  },
  progress: {
    src: progress,
    ...TALL,
    alt: "Progress: a weekly performance score of 80, and the last 30 days, 25 sessions, 110.9k kg lifted and 134.1 km run.",
  },
  racePlan: {
    src: racePlan,
    ...TALL,
    alt: "The Train screen on a half marathon plan: week 1 of 13, today’s run, Easy 30 with strides, and the plan’s base, build and taper.",
  },
  feed: {
    src: feed,
    ...TALL,
    alt: "The social feed: a friend’s 8.24 km morning run with its route, pace and props, and a lift with two new bests.",
  },
  run: {
    src: run,
    ...TALL,
    alt: "A saved run: an 18 km long run on a map coloured by pace, 1:47:51 at 6:00 per kilometre, with best efforts below.",
  },
  liftBest: {
    src: liftBest,
    ...PHONE,
    alt: "A finished lift: Pull A done, 2,295 kg lifted in 41 minutes, and a new best on the barbell row.",
  },
  runBest: {
    src: runBest,
    ...PHONE,
    alt: "A finished run: 5.00 km in 24:10, the runner’s fastest 5K by 5 minutes 50 seconds.",
  },
  together: {
    src: together,
    ...PHONE,
    alt: "Social’s Together tab: this week’s challenge, the weekly leagues, a Circle, and races and Spaces to join.",
  },
  proPlans: {
    src: proPlans,
    ...PHONE,
    alt: "Choosing a Pro plan: £3.99 a month or £34.99 a year, with the 7-day free trial’s timeline.",
  },
  review: {
    src: review,
    width: 660,
    height: 1271,
    alt: "The weekly review: 4 sessions, 13,360 kg lifted, 13.0 km run and 2 of 7 days with food logged.",
  },
} as const satisfies Record<string, AppScreenImage>;
