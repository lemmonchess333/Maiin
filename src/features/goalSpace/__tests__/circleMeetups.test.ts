/**
 * Run26 call 4 — a Circle's meet-ups, on the phone: what a member sees
 * (not yet over, from a current member, soonest first), when they see it
 * starting (their own zone: an organiser in London and a member in New
 * York read the same instant two ways), who they read as going, and what
 * the plan sheet refuses before anything is sent.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  MEETUP_MAX_AHEAD_MS,
  MEETUP_SHOWN_AFTER_START_MS,
  defaultMeetupSport,
  goingLine,
  goingMembers,
  meetupPlanProblem,
  meetupWhen,
  parseCircleMeetup,
  startsAtFromInputs,
  upcomingMeetups,
  type CircleMeetup,
} from "../circleMeetups";
import type { GoalSpaceMember } from "../goalSpaceTypes";

const HOUR = 3_600_000;
const startingTz = process.env.TZ;

/** Run `fn` as a phone in `zone`. Node reads TZ afresh when it is set. */
function inZone<T>(zone: string, fn: () => T): T {
  process.env.TZ = zone;
  return fn();
}

afterEach(() => {
  if (startingTz === undefined) delete process.env.TZ;
  else process.env.TZ = startingTz;
});

function member(uid: string, displayName = uid): GoalSpaceMember {
  return { uid, displayName, photoURL: null, role: "member", joinedAt: 0 };
}

function meetup(over: Partial<CircleMeetup> = {}): CircleMeetup {
  return {
    id: "m1",
    organiserUid: "maya",
    sport: "run",
    title: "Saturday long run",
    place: "Tooting Lido gate",
    note: null,
    paceGroups: null,
    repeat: null,
    startsAt: 0,
    timeZone: "Europe/London",
    going: ["maya"],
    createdAt: 0,
    ...over,
  };
}

describe("the time a meet-up starts", () => {
  it("is one instant, read in each member's own zone", () => {
    // The organiser, in London, plans Saturday 21 November at 02:00.
    const startsAt = inZone("Europe/London", () =>
      startsAtFromInputs("2026-11-21", "02:00")
    );
    expect(startsAt).toBe(Date.UTC(2026, 10, 21, 2, 0));
    expect(inZone("Europe/London", () => meetupWhen(startsAt!))).toBe(
      "Sat 21 Nov · 02:00"
    );
    // A member in New York reads the same instant as Friday evening.
    expect(inZone("America/New_York", () => meetupWhen(startsAt!))).toBe(
      "Fri 20 Nov · 21:00"
    );
    // And one in Auckland as Saturday afternoon.
    expect(inZone("Pacific/Auckland", () => meetupWhen(startsAt!))).toBe(
      "Sat 21 Nov · 15:00"
    );
  });

  it("refuses a day or a time that is missing or not real", () => {
    for (const [day, time] of [
      ["", "08:00"],
      ["2026-11-21", ""],
      ["2026-02-30", "08:00"],
      ["2026-11-21", "24:00"],
      ["21/11/2026", "08:00"],
    ]) {
      expect(startsAtFromInputs(day, time)).toBeNull();
    }
  });
});

describe("upcomingMeetups", () => {
  const now = Date.UTC(2026, 10, 18, 12, 0);
  const members = new Set(["maya", "sam"]);

  it("keeps the ones not yet over, from current members, soonest first", () => {
    const list = [
      meetup({ id: "later", startsAt: now + 48 * HOUR }),
      meetup({ id: "soon", startsAt: now + 2 * HOUR }),
      meetup({ id: "running-now", startsAt: now - HOUR }),
      meetup({
        id: "over",
        startsAt: now - MEETUP_SHOWN_AFTER_START_MS - 1,
      }),
      meetup({ id: "leaver", organiserUid: "gone", startsAt: now + HOUR }),
    ];
    expect(upcomingMeetups(list, members, now).map((m) => m.id)).toEqual([
      "running-now",
      "soon",
      "later",
    ]);
  });
});

describe("who is going", () => {
  const members = [
    member("you"),
    member("maya", "Maya"),
    member("sam", "Sam"),
    member("ali", "Ali"),
  ];

  it("names you first, then the others in the order they said so", () => {
    const m = meetup({ going: ["maya", "you", "sam"] });
    expect(goingLine(goingMembers(m, members), "you")).toBe(
      "You, Maya and Sam are going"
    );
  });

  it("reads one other person, and you alone, in the right number", () => {
    expect(goingLine([member("maya", "Maya")], "you")).toBe("Maya is going");
    expect(goingLine([member("you")], "you")).toBe("You are going");
  });

  it("counts past three names", () => {
    const m = meetup({ going: ["maya", "sam", "ali", "you"] });
    expect(goingLine(goingMembers(m, members), "you")).toBe(
      "You, Maya and 2 more are going"
    );
  });

  it("leaves out anyone no longer in the Circle", () => {
    const m = meetup({ going: ["maya", "left-the-circle"] });
    expect(goingMembers(m, members).map((g) => g.uid)).toEqual(["maya"]);
  });
});

describe("meetupPlanProblem", () => {
  const now = Date.UTC(2026, 10, 18, 12, 0);
  const plan = {
    title: "Saturday long run",
    place: "Tooting Lido gate",
    note: null,
    startsAt: now + 24 * HOUR,
  };

  it("passes a complete plan", () => {
    expect(meetupPlanProblem(plan, now)).toBeNull();
  });

  it("says what is missing, one thing at a time", () => {
    expect(meetupPlanProblem({ ...plan, title: " " }, now)).toBe(
      "Give it a name."
    );
    expect(meetupPlanProblem({ ...plan, place: "" }, now)).toBe(
      "Say where to meet."
    );
    expect(meetupPlanProblem({ ...plan, startsAt: null }, now)).toBe(
      "Choose a day and a time."
    );
    expect(meetupPlanProblem({ ...plan, startsAt: now - 1 }, now)).toBe(
      "Choose a time that hasn’t passed."
    );
    expect(
      meetupPlanProblem(
        { ...plan, startsAt: now + MEETUP_MAX_AHEAD_MS + 1 },
        now
      )
    ).toBe("Plan it within the next two months.");
  });
});

describe("parseCircleMeetup", () => {
  it("reads a stored meet-up and refuses one missing what it needs", () => {
    const stored = {
      id: "m1",
      organiserUid: "maya",
      sport: "lift",
      title: "Thursday legs",
      place: "PureGym Balham",
      note: "",
      startsAt: 1,
      timeZone: "Europe/London",
      going: ["maya", 7],
      createdAt: 1,
    };
    expect(parseCircleMeetup(stored)).toMatchObject({
      sport: "lift",
      note: null,
      going: ["maya"],
    });
    expect(parseCircleMeetup({ ...stored, sport: "swim" })).toBeNull();
    expect(parseCircleMeetup({ ...stored, startsAt: "soon" })).toBeNull();
    expect(parseCircleMeetup(null)).toBeNull();
  });
});

describe("defaultMeetupSport", () => {
  it("starts a strength block on a lift and every other Circle on a run", () => {
    expect(defaultMeetupSport("strength_block")).toBe("lift");
    expect(defaultMeetupSport("race")).toBe("run");
    expect(defaultMeetupSport("hybrid")).toBe("run");
  });
});
