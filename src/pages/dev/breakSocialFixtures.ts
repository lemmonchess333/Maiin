/*
 * DEV/TEST-ONLY data for the break-social lab (BreakSocialLab.tsx).
 *
 * Two kinds of data for the same surfaces. "demo" is what the app is
 * usually looked at with: short names, small counts, every field filled.
 * "worst" is what real people produce, each value plausible or at the
 * limit the server accepts. Display names reach 100 characters through
 * the rules and the fan-out (`firestore.rules`, `functions/lib/socialFanout.js`)
 * even though the app's own form stops at 30, and a Google or Apple
 * account brings its own name. The failures are spread across the rows,
 * the way real data spreads them.
 *
 * Kept as the regression fixture: the next change to these components can
 * be checked against it at /dev/break-social.
 */
import type { FeedItem } from "@/hooks/useSocialFeed";

export type BreakDataset = "demo" | "worst" | "one";

const DAY = 86_400_000;

/** A Firestore-shaped timestamp, `ms` from now (negative is the past). */
function at(ms: number): { toDate: () => Date } {
  const date = new Date(Date.now() + ms);
  return { toDate: () => date };
}

/** A closed loop near Richmond Park, enough points for the route scene. */
function loop(scale = 1): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    points.push({
      lat: 51.443 + 0.012 * scale * Math.sin(t),
      lon: -0.274 + 0.02 * scale * Math.cos(t) * (1 + 0.3 * Math.sin(2 * t)),
    });
  }
  return points;
}

function lift(name: string, setCount: number, targetReps: number, kg: number) {
  return {
    name,
    summary: `${setCount} x ${targetReps} ${kg} kg`,
    setCount,
    targetReps,
    targetWeightKg: kg,
  };
}

const DEMO: FeedItem[] = [
  {
    id: "demo-run",
    activityId: "demo-run",
    authorId: "demo-jane",
    authorName: "Jane Smith",
    type: "run",
    summary: "Ran 5.2 km",
    createdAt: at(-2 * 3_600_000),
    kudosCount: 4,
    activity: {
      authorId: "demo-jane",
      activityTitle: "Morning run",
      distance: 5200,
      avgPace: 330,
      duration: 1716,
      elevationGain: 42,
      routePreview: loop(),
      commentCount: 2,
    },
  },
  {
    id: "demo-lift",
    activityId: "demo-lift",
    authorId: "demo-tom",
    authorName: "Tom Lee",
    type: "workout",
    summary: "Upper body",
    createdAt: at(-5 * 3_600_000),
    kudosCount: 7,
    activity: {
      authorId: "demo-tom",
      activityTitle: "Upper body",
      totalVolume: 6420,
      exerciseCount: 3,
      duration: 3120,
      muscleGroups: ["horizontal_push", "vertical_pull"],
      exercises: [
        lift("Bench Press", 3, 8, 60),
        lift("Pull-up", 3, 8, 0),
        lift("Overhead Press", 3, 10, 35),
      ],
      commentCount: 1,
    },
  },
  {
    id: "demo-pr",
    activityId: "demo-pr",
    authorId: "demo-ana",
    authorName: "Ana Ruiz",
    type: "workout",
    summary: "Lower body",
    createdAt: at(-DAY),
    kudosCount: 12,
    prHit: true,
    prExercise: "Squat",
    prWeight: 100,
    activity: {
      authorId: "demo-ana",
      activityTitle: "Lower body",
      totalVolume: 8800,
      exerciseCount: 3,
      prCount: 1,
      duration: 3600,
      exercises: [
        lift("Squat", 5, 5, 100),
        lift("Romanian Deadlift", 3, 8, 80),
        lift("Walking Lunge", 3, 12, 20),
      ],
      commentCount: 3,
    },
  },
];

const WORST: FeedItem[] = [
  {
    // An ultra: every run figure at its widest, a caption carrying a link,
    // a milestone line from a long challenge name, and counts past 1,000.
    id: "worst-ultra",
    activityId: "worst-ultra",
    authorId: "worst-aleksandra",
    authorName: "Aleksandra Wiśniewska-Kowalczyk",
    authorPhotoURL: "https://example.com/avatars/does-not-exist.jpg",
    type: "run",
    summary: "Ran 100.4 km",
    createdAt: at(-3 * 365 * DAY),
    kudosCount: 1284,
    challengeMilestone:
      "Completed the October 1,000 km Club challenge: 1,000 km in 31 days",
    activity: {
      authorId: "worst-aleksandra",
      activityTitle:
        "Sunday long run: Teddington Lock to Tower Bridge along the Thames Path and back again",
      caption:
        "Route for anyone asking: https://example.com/routes/thames-path/teddington-to-tower-bridge-and-back?units=km",
      distance: 100_420,
      avgPace: 451,
      duration: 45_296,
      elevationGain: 2845,
      routePreview: loop(2),
      commentCount: 1284,
    },
  },
  {
    // Twelve exercises with long names, a PR weight converted from 315 lb,
    // the biggest volume, one of everything else.
    id: "worst-lift",
    activityId: "worst-lift",
    authorId: "worst-jo",
    authorName: "Jo",
    type: "workout",
    summary: "Full body",
    createdAt: at(0),
    kudosCount: 1,
    prHit: true,
    prExercise: "Barbell Romanian Deadlift with Deficit",
    prWeight: 142.8816,
    activity: {
      authorId: "worst-jo",
      totalVolume: 128_450,
      exerciseCount: 12,
      prCount: 12,
      duration: 9_540,
      muscleGroups: [
        "horizontal_push",
        "vertical_push",
        "horizontal_pull",
        "vertical_pull",
        "squat",
        "hinge",
        "lunge",
        "core",
      ],
      exercises: [
        lift(
          "Single-Arm Dumbbell Bulgarian Split Squat (Paused)",
          5,
          12,
          102.5
        ),
        lift("Barbell Romanian Deadlift with Deficit", 4, 8, 142.8816),
        lift("Seated Cable Row", 3, 15, 1250),
        ...Array.from({ length: 9 }, (_, i) =>
          lift(`Accessory ${i + 1}`, 3, 12, 20)
        ),
      ],
      commentCount: 1,
    },
  },
  {
    // Escaping and an emoji-first name, a run under a kilometre, a time a
    // few minutes ahead of this phone's clock.
    id: "worst-escape",
    activityId: "worst-escape",
    authorId: "worst-fox",
    authorName: "🦊 Fox",
    type: "run",
    summary: "Ran 0.4 km",
    createdAt: at(3 * 60_000),
    kudosCount: 0,
    activity: {
      authorId: "worst-fox",
      activityTitle: "<script>alert(1)</script> &amp; **tempo**",
      distance: 400,
      avgPace: 312,
      duration: 125,
      routePreview: loop(0.2),
      commentCount: 0,
    },
  },
  {
    // A CJK name and a German compound title: no spaces to break at.
    id: "worst-compound",
    activityId: "worst-compound",
    authorId: "worst-wang",
    authorName: "王秀英",
    type: "workout",
    summary: "Oberkörper",
    createdAt: at(-12 * DAY),
    kudosCount: 0,
    activity: {
      authorId: "worst-wang",
      activityTitle: "Oberkörperkrafttrainingseinheitswiederholung",
      totalVolume: 3200,
      exerciseCount: 1,
      prCount: 1,
      duration: 1800,
      exercises: [lift("Bankdrücken", 5, 5, 80)],
      commentCount: 0,
    },
  },
  {
    // A Google account's full name, a caption with blank lines, and no
    // title at all (the summary stands in).
    id: "worst-hybrid",
    activityId: "worst-hybrid",
    authorId: "worst-christopher",
    authorName: "Christopher Alexander Montgomery III",
    type: "workout",
    summary:
      "Brick session: 8 km easy run straight into a full-body circuit at the outdoor gym",
    createdAt: at(-11 * 30 * DAY),
    kudosCount: 99,
    activity: {
      authorId: "worst-christopher",
      caption: "Line one\nLine two\n\n\nLine five",
      distance: 8000,
      avgPace: 345,
      duration: 4500,
      routePreview: loop(0.8),
      totalVolume: 4100,
      exerciseCount: 4,
      exercises: [
        lift("Kettlebell Swing", 5, 20, 24),
        lift("Push-up", 5, 20, 0),
        lift("Goblet Squat", 5, 15, 24),
        lift("Plank", 3, 1, 0),
      ],
      commentCount: 100,
    },
  },
  {
    // Right-to-left name and title.
    id: "worst-rtl",
    activityId: "worst-rtl",
    authorId: "worst-noor",
    authorName: "نور الهدى عبد الرحمن",
    type: "run",
    summary: "Ran 10 km",
    createdAt: at(-40 * 60_000),
    kudosCount: 10_000,
    activity: {
      authorId: "worst-noor",
      activityTitle: "جري الصباح على الكورنيش",
      distance: 10_000,
      avgPace: 300,
      duration: 3000,
      elevationGain: 12,
      routePreview: loop(),
      commentCount: 9,
    },
  },
  {
    // Stacked diacritics, and the longest name the server stores.
    id: "worst-long-name",
    activityId: "worst-long-name",
    authorId: "worst-hang",
    authorName:
      "Đặng Thị Ngọc Hân Nguyễn-Trần Phương Thảo Lê Hoàng Bảo Ngọc Phạm Thị Thu Hương Võ Minh Khôi Đỗ Anh",
    type: "run",
    summary: "Ran 21.1 km",
    createdAt: at(-6 * DAY),
    kudosCount: 2,
    activity: {
      authorId: "worst-hang",
      activityTitle: "Half marathon",
      distance: 21_097,
      avgPace: 285,
      duration: 6013,
      routePreview: loop(1.3),
      commentCount: 1,
    },
  },
];

/** Every count at exactly one, for plurals. */
const ONE: FeedItem[] = [
  {
    id: "one-lift",
    activityId: "one-lift",
    authorId: "one-sam",
    authorName: "Sam",
    type: "workout",
    summary: "One lift",
    createdAt: at(-60_000),
    kudosCount: 1,
    prHit: true,
    prExercise: "Deadlift",
    prWeight: 140,
    activity: {
      authorId: "one-sam",
      activityTitle: "Deadlift day",
      totalVolume: 700,
      exerciseCount: 1,
      prCount: 1,
      duration: 60,
      exercises: [lift("Deadlift", 1, 5, 140)],
      commentCount: 1,
    },
  },
];

export const FEED: Record<BreakDataset, FeedItem[]> = {
  demo: DEMO,
  worst: WORST,
  one: ONE,
};

export interface BoardRow {
  rank: number;
  uid: string;
  name: string;
  photoURL?: string;
  value: number;
  unit: string;
  isSelf: boolean;
  selfInitial?: string;
}

export const BOARD: Record<BreakDataset, BoardRow[]> = {
  demo: [
    {
      rank: 1,
      uid: "b1",
      name: "Jane Smith",
      value: 42,
      unit: "km",
      isSelf: false,
    },
    {
      rank: 2,
      uid: "b2",
      name: "Tom Lee",
      value: 38,
      unit: "km",
      isSelf: false,
    },
    {
      rank: 3,
      uid: "b3",
      name: "Ana Ruiz",
      value: 31,
      unit: "km",
      isSelf: true,
      selfInitial: "A",
    },
    {
      rank: 4,
      uid: "b4",
      name: "Sam Park",
      value: 27,
      unit: "km",
      isSelf: false,
    },
  ],
  // A 1,284-athlete cohort: the neighbourhood around you sits in the
  // thousands, so the rank column holds four digits.
  worst: [
    {
      rank: 1279,
      uid: "w1",
      name: "Christopher Alexander Montgomery III",
      value: 1_284_567,
      unit: "pts",
      isSelf: false,
    },
    {
      rank: 1280,
      uid: "w2",
      name: "Jo",
      photoURL: "https://example.com/avatars/does-not-exist.jpg",
      value: 999,
      unit: "pts",
      isSelf: false,
    },
    {
      rank: 1281,
      uid: "w3",
      name: "Aleksandra Wiśniewska-Kowalczyk",
      value: 12_480,
      unit: "pts",
      isSelf: true,
      selfInitial: "A",
    },
    {
      rank: 1282,
      uid: "w4",
      name: "🦊 Fox",
      value: 0,
      unit: "pts",
      isSelf: false,
    },
    {
      rank: 1283,
      uid: "w5",
      name: "王秀英",
      value: 7,
      unit: "pts",
      isSelf: false,
    },
    {
      rank: 1284,
      uid: "w6",
      name: "نور الهدى عبد الرحمن",
      value: 1,
      unit: "pts",
      isSelf: false,
    },
  ],
  one: [
    {
      rank: 1,
      uid: "o1",
      name: "Sam",
      value: 1,
      unit: "km",
      isSelf: true,
      selfInitial: "S",
    },
  ],
};
