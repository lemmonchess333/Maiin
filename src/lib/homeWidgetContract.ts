/**
 * What the app hands Tropos's Home Screen and Lock Screen widgets (Wid1),
 * and what the widgets hand back.
 *
 * A widget cannot run the web view's code or read Firestore: it reads a
 * snapshot the app writes to the App Group both share, and redraws from
 * it on a timeline. The app writes it whenever what Home draws changes
 * (`useHomeWidgetSnapshot`, from `homeWidgetSnapshot.ts`), through the
 * native plugin `ios/App/App/HomeWidgetsPlugin.swift`; the widgets in
 * `ios/App/LiveActivities/` decode it with the structs in
 * `HomeWidgetSnapshot.swift`. The other way, the food widget's "+" button
 * queues a drink in the App Group (`HomeWidgetStore.swift`), and the app
 * saves it on its next open (`widgetDrinks.ts`).
 *
 * Every word a widget shows for training arrives written by the app, as
 * the Live Activity's figures do, so the widget and Home say the same
 * thing. The numbers it adds to (water) and counts down (calories) arrive
 * as numbers.
 *
 * The key lists below are the JSON's, and `homeWidgetContract.test.ts`
 * holds them to the Swift structs' properties and the builder's output.
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/publicLinks";

/** The App Group the app and the widget extension share. Both App IDs
 *  carry it (App.entitlements, LiveActivities.entitlements), and the
 *  owner assigns it to both in Apple's developer site (docs/ios-release.md). */
export const HOME_WIDGET_APP_GROUP = "group.com.tropos.app";

/** The snapshot's shape. A widget that reads another version draws its
 *  first-use state rather than guess. */
export const HOME_WIDGET_SNAPSHOT_VERSION = 1;

/** W8d: a snapshot older than this is drawn dimmed, with a refresh mark.
 *  The same 24 hours as W6c's stale badge. */
export const HOME_WIDGET_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** A widget's tap opens the app at an address on the app's own origin,
 *  with one of the router's own paths (`widgetLinks.ts` checks it). */
export const HOME_WIDGET_LINK_ORIGIN = PUBLIC_APP_ORIGIN;

/** The app paths a widget may open. */
export const HOME_WIDGET_PATHS = ["/", "/food", "/program"] as const;

/** What a day holds, for its colour: purple lifting, coral running. */
export type WidgetSport = "lift" | "run" | "both" | "rest" | "none";
export const WIDGET_SPORTS: readonly WidgetSport[] = [
  "lift",
  "run",
  "both",
  "rest",
  "none",
];

/**
 * Where the day stands (W8b's states, driven by what was done, never by
 * the clock):
 *
 *   planned   a session to do today ("Today · Upper A")
 *   done      today's sessions are done, or skipped; tomorrow is named
 *   rest      a rest day; the next session is named
 *   no-plan   no plan yet, or a lifting day with no workout linked
 */
export type WidgetDayState = "planned" | "done" | "rest" | "no-plan";
export const WIDGET_DAY_STATES: readonly WidgetDayState[] = [
  "planned",
  "done",
  "rest",
  "no-plan",
];

/** One of the week's seven segments, as Home's strip draws it
 *  (`weekStripDays`), a planned day carrying its sport. */
export type WidgetSegment =
  | "lift-done"
  | "run-done"
  | "both-done"
  | "planned-lift"
  | "planned-run"
  | "planned-both"
  | "missed"
  | "rest"
  | "before";
export const WIDGET_SEGMENTS: readonly WidgetSegment[] = [
  "lift-done",
  "run-done",
  "both-done",
  "planned-lift",
  "planned-run",
  "planned-both",
  "missed",
  "rest",
  "before",
];

/** One day, as the Today widget draws it. Today's, and tomorrow's as far
 *  as the app can see it, so the widget turns over at midnight with the
 *  app asleep. */
export interface WidgetDay {
  /** "yyyy-MM-dd", the person's local day. */
  date: string;
  state: WidgetDayState;
  sport: WidgetSport;
  /** The small line above the title: "Today", "Done today", "Your first
   *  workout". */
  kicker: string;
  /** The session's name as Home's hero names it ("Upper A", "Long 18K"),
   *  or "Rest day". */
  title: string;
  /** Its focus: the muscles in words, a run's distance or shape. May be
   *  empty. */
  focus: string;
  /** "about 45 min", "40 min", or empty. */
  minutes: string;
  /** The next session: "Long 18K tomorrow", "Pull B on Saturday", or
   *  empty. */
  next: string;
  /** The Lock Screen's one line: "Today · Upper A", "Tomorrow · Long 18K". */
  line: string;
  /** A race goal's countdown from this day: "26 days to your marathon",
   *  or empty. */
  race: string;
  /** The app path a tap opens: the session in Train. */
  link: string;
}

export interface WidgetWeek {
  /** The week's first day, "yyyy-MM-dd". */
  start: string;
  /** Seven, Monday first. */
  segments: WidgetSegment[];
  done: number;
  /** The sessions the week plans, or null when it plans none. */
  of: number | null;
  /** As Home says it: "3 of 5 sessions this week". */
  summary: string;
}

export interface WidgetStreak {
  /** The day the figures are for. */
  date: string;
  /** The streak as Home's flame shows it. */
  days: number;
  best: number;
  loggedToday: boolean;
  /** What the flame will show the next day before anything is logged:
   *  the same streak when today is logged (the today/yesterday rule),
   *  otherwise unknown. */
  nextDay: number | null;
}

export interface WidgetFood {
  date: string;
  /** Calories logged today and the day's target (`useEffectiveTargets`). */
  eaten: number;
  target: number;
  /** Grams. A target of 0 is none (an infeasible split, Nutr3). */
  protein: number;
  proteinTarget: number;
}

export interface WidgetWater {
  date: string;
  ml: number;
  targetMl: number;
  /** What one tap of "+" adds: Home's water step (`servingMl`). */
  servingMl: number;
  /** Its name on the button: "Glass", "Bottle", or "330 ml". */
  servingLabel: string;
  /** The drinks the total already counts, so a drink the widget queued
   *  is never added twice once the app has saved it. */
  drinkIds: string[];
}

export interface HomeWidgetSnapshot {
  version: typeof HOME_WIDGET_SNAPSHOT_VERSION;
  /** When the app wrote it, ms. W8d's staleness reads this. */
  writtenAt: number;
  /** A tag for the signed-in account (`widgetAccount`). Each queued drink
   *  carries the tag of the snapshot it was poured against, and the app
   *  saves only its own account's. */
  account: string;
  /** Today, then tomorrow. */
  days: WidgetDay[];
  week: WidgetWeek | null;
  streak: WidgetStreak | null;
  food: WidgetFood | null;
  water: WidgetWater | null;
}

/** A drink the food widget's "+" queued, as `HomeWidgetStore.swift`
 *  writes it. */
export interface WidgetDrink {
  /** A UUID made at the tap: the water receipt's id, so it saves once. */
  id: string;
  account: string;
  /** The local day of the tap, "yyyy-MM-dd". */
  date: string;
  ml: number;
  /** The tap, ms. */
  at: number;
}

export const SNAPSHOT_KEYS = [
  "version",
  "writtenAt",
  "account",
  "days",
  "week",
  "streak",
  "food",
  "water",
] as const satisfies readonly (keyof HomeWidgetSnapshot)[];
export const DAY_KEYS = [
  "date",
  "state",
  "sport",
  "kicker",
  "title",
  "focus",
  "minutes",
  "next",
  "line",
  "race",
  "link",
] as const satisfies readonly (keyof WidgetDay)[];
export const WEEK_KEYS = [
  "start",
  "segments",
  "done",
  "of",
  "summary",
] as const satisfies readonly (keyof WidgetWeek)[];
export const STREAK_KEYS = [
  "date",
  "days",
  "best",
  "loggedToday",
  "nextDay",
] as const satisfies readonly (keyof WidgetStreak)[];
export const FOOD_KEYS = [
  "date",
  "eaten",
  "target",
  "protein",
  "proteinTarget",
] as const satisfies readonly (keyof WidgetFood)[];
export const WATER_KEYS = [
  "date",
  "ml",
  "targetMl",
  "servingMl",
  "servingLabel",
  "drinkIds",
] as const satisfies readonly (keyof WidgetWater)[];
export const DRINK_KEYS = [
  "id",
  "account",
  "date",
  "ml",
  "at",
] as const satisfies readonly (keyof WidgetDrink)[];

/**
 * The account tag a snapshot and its drinks carry: a short hash of the
 * uid (FNV-1a, 32 bits), so the App Group holds no account id. It only
 * tells this phone's accounts apart, which a collision would not matter
 * to: two accounts on one phone, one widget.
 */
export function widgetAccount(uid: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < uid.length; i += 1) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
