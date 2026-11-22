/**
 * Meet-ups in a Circle (Run26 call 4): a member plans a run or a lift with
 * a time and a place, and the other members say whether they're in. It is
 * the weekly club run Strava's group events carry, kept inside a Circle,
 * where a time and a place reach only the people the organiser invited
 * (GsPb1: invite-only, at most eight).
 *
 * GsPb1's fence holds: the place is the words the organiser types, never
 * coordinates; nothing here is anyone's distance, pace or load; and no
 * name is copied, so every name shown comes from the Circle's own member
 * docs, which follow the profile (identity resync).
 *
 * The server writes every meet-up (`circleMeetup` callable,
 * functions/lib/circleMeetups.js); the bounds below are its, pinned equal
 * by circleMeetups.cross.test.ts. A meet-up is stored as the instant it
 * starts and the organiser's time zone, and each member sees it in their
 * own phone's time.
 *
 * Run27 call 10 adds what Strava's club events carry, without a map: a
 * run's pace groups as typed words, a weekly repeat (the server plans the
 * next one when this one is over, at the same time of day in the
 * organiser's zone, with everyone but the organiser to say again), and a
 * reminder about 24 hours before to everyone in, which the server sends.
 */
import {
  formatShortWeekdayDayMonth,
  formatTimeOfDay,
} from "@/utils/formatters";
import type { GoalSpaceMember, GoalSpaceType } from "./goalSpaceTypes";

export const MEETUP_SPORTS = ["run", "lift"] as const;
export type MeetupSport = (typeof MEETUP_SPORTS)[number];

export const MEETUP_TITLE_MAX = 60;
export const MEETUP_PLACE_MAX = 80;
export const MEETUP_NOTE_MAX = 200;

/** A run's pace groups, on one line (Run27 call 10). A Tropos heuristic:
 *  Strava allows four groups, and "5:00, 5:30, 6:00 and 6:30 /km" with a
 *  word for each still fits. */
export const MEETUP_PACE_GROUPS_MAX = 80;

/** How a meet-up may repeat (Run27 call 10). */
export const MEETUP_REPEATS = ["weekly"] as const;
export type MeetupRepeat = (typeof MEETUP_REPEATS)[number];

/** How long before its start the server reminds everyone in: Strava's
 *  "24 hours before the start time of the event". */
export const MEETUP_REMINDER_LEAD_MS = 86_400_000;

/** How far ahead a meet-up may be planned. A Tropos heuristic: two months
 *  covers a block's long runs without a list of far-off plans. */
export const MEETUP_MAX_AHEAD_MS = 60 * 86_400_000;

/** How long after its start a meet-up still shows, and can still be
 *  joined. A Tropos heuristic: three hours covers a long run and the
 *  coffee after it. */
export const MEETUP_SHOWN_AFTER_START_MS = 3 * 3_600_000;

/** How many meet-ups a Circle may have ahead at once (a Tropos heuristic:
 *  two a week for a month). The list reads no more than this. */
export const MEETUPS_AHEAD_MAX = 8;

export interface CircleMeetup {
  id: string;
  organiserUid: string;
  sport: MeetupSport;
  title: string;
  place: string;
  note: string | null;
  /** A run's pace groups as typed, or null. */
  paceGroups: string | null;
  /** "weekly" when it repeats, else null. */
  repeat: MeetupRepeat | null;
  /** The instant it starts, in ms. */
  startsAt: number;
  /** The organiser's IANA zone when they planned it. */
  timeZone: string;
  /** Member uids, the organiser first. */
  going: string[];
  createdAt: number;
}

/** What the plan sheet sends: the typed words, the instant and whether it
 *  repeats. */
export interface MeetupPlan {
  sport: MeetupSport;
  title: string;
  place: string;
  note: string | null;
  paceGroups: string | null;
  repeat: MeetupRepeat | null;
  startsAt: number;
  timeZone: string;
}

export function parseCircleMeetup(data: unknown): CircleMeetup | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (
    typeof d.id !== "string" ||
    typeof d.organiserUid !== "string" ||
    !MEETUP_SPORTS.includes(d.sport as MeetupSport) ||
    typeof d.title !== "string" ||
    typeof d.place !== "string" ||
    typeof d.startsAt !== "number" ||
    !Number.isFinite(d.startsAt) ||
    typeof d.timeZone !== "string"
  ) {
    return null;
  }
  return {
    id: d.id,
    organiserUid: d.organiserUid,
    sport: d.sport as MeetupSport,
    title: d.title.slice(0, MEETUP_TITLE_MAX),
    place: d.place.slice(0, MEETUP_PLACE_MAX),
    note:
      typeof d.note === "string" && d.note.length > 0
        ? d.note.slice(0, MEETUP_NOTE_MAX)
        : null,
    // A lift has no pace groups, whatever is stored.
    paceGroups:
      d.sport === "run" &&
      typeof d.paceGroups === "string" &&
      d.paceGroups.length > 0
        ? d.paceGroups.slice(0, MEETUP_PACE_GROUPS_MAX)
        : null,
    repeat: MEETUP_REPEATS.includes(d.repeat as MeetupRepeat)
      ? (d.repeat as MeetupRepeat)
      : null,
    startsAt: d.startsAt,
    timeZone: d.timeZone,
    going: Array.isArray(d.going)
      ? d.going.filter((s): s is string => typeof s === "string")
      : [],
    createdAt: typeof d.createdAt === "number" ? d.createdAt : 0,
  };
}

/**
 * The meet-ups a member sees: not yet over, planned by someone still in
 * the Circle (a leaver's are deleted, and this holds until they are),
 * soonest first.
 */
export function upcomingMeetups(
  meetups: readonly CircleMeetup[],
  memberUids: ReadonlySet<string>,
  now: number
): CircleMeetup[] {
  return meetups
    .filter(
      (m) =>
        m.startsAt + MEETUP_SHOWN_AFTER_START_MS > now &&
        memberUids.has(m.organiserUid)
    )
    .sort((a, b) => a.startsAt - b.startsAt);
}

/** "Sat 21 Nov · 08:00": the day and the time, in this phone's zone. */
export function meetupWhen(startsAt: number): string {
  const d = new Date(startsAt);
  return `${formatShortWeekdayDayMonth(d)} · ${formatTimeOfDay(d)}`;
}

/** Who is going, as current members in the list's order. */
export function goingMembers(
  meetup: CircleMeetup,
  members: readonly GoalSpaceMember[]
): GoalSpaceMember[] {
  const byUid = new Map(members.map((m) => [m.uid, m]));
  return meetup.going
    .map((uid) => byUid.get(uid))
    .filter((m): m is GoalSpaceMember => m !== undefined);
}

/**
 * "You, Maya and Sam are going", "Maya is going": the names of who is in,
 * you first, as one line. Past three names the rest is a count.
 */
export function goingLine(
  going: readonly GoalSpaceMember[],
  viewerUid: string
): string {
  if (going.length === 0) return "Nobody has said they’re in yet";
  const you = going.some((m) => m.uid === viewerUid);
  const names = [
    ...(you ? ["You"] : []),
    ...going.filter((m) => m.uid !== viewerUid).map((m) => m.displayName),
  ];
  const shown = names.length > 3 ? names.slice(0, 2) : names;
  const rest = names.length - shown.length;
  const list =
    rest > 0
      ? `${shown.join(", ")} and ${rest} more`
      : shown.length === 1
        ? shown[0]
        : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  const many = names.length > 1 || you;
  return `${list} ${many ? "are" : "is"} going`;
}

/** The sport a new meet-up starts on, from the Circle's goal. */
export function defaultMeetupSport(type: GoalSpaceType): MeetupSport {
  return type === "strength_block" ? "lift" : "run";
}

/** This phone's IANA zone, as the organiser's. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The instant a day and a time from the plan sheet's inputs name, in this
 * phone's zone ("2026-11-21" and "08:00"), or null when either is missing
 * or not a real date and time.
 */
export function startsAtFromInputs(
  dateKey: string,
  time: string
): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!day || !clock) return null;
  const [y, mo, d] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const [h, mi] = [Number(clock[1]), Number(clock[2])];
  if (h > 23 || mi > 59) return null;
  const at = new Date(y, mo - 1, d, h, mi);
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d)
    return null;
  return at.getTime();
}

/** Every piece of a plan the organiser typed, for the word filter, which
 *  the server holds them to as well. */
export function meetupTypedWords(
  plan: Pick<MeetupPlan, "title" | "place" | "note" | "paceGroups">
): string[] {
  return [plan.title, plan.place, plan.note ?? "", plan.paceGroups ?? ""];
}

/** What calling a meet-up off says first: who is told, and for a weekly
 *  one, that the series ends with it. */
export function callOffLine(meetup: Pick<CircleMeetup, "repeat">): string {
  return meetup.repeat === "weekly"
    ? "Call it off? Anyone who’s in will be told, and it won’t repeat."
    : "Call it off? Anyone who said they’re in will be told.";
}

/** Why a plan cannot be sent yet, in the sheet's words, or null. */
export function meetupPlanProblem(
  plan: Pick<MeetupPlan, "title" | "place" | "note"> & {
    startsAt: number | null;
  },
  now: number
): string | null {
  if (plan.title.trim().length === 0) return "Give it a name.";
  if (plan.place.trim().length === 0) return "Say where to meet.";
  if (plan.startsAt === null) return "Choose a day and a time.";
  if (plan.startsAt < now) return "Choose a time that hasn’t passed.";
  if (plan.startsAt > now + MEETUP_MAX_AHEAD_MS)
    return "Plan it within the next two months.";
  return null;
}
