/**
 * Run27 call 10 — a meet-up's reminder, its weekly repeat and its pace
 * groups (lib/circleMeetups.js), against the in-memory Firestore and the
 * real notification writer (lib/socialFanout createNotification), so the
 * Circles switch, the block check and the once-only row are the ones that
 * run in production.
 *
 * What it pins: the reminder goes once, about 24 hours before the start,
 * only to members who said they're in, only with the Circles switch on,
 * never for a meet-up called off or already started, and in each reader's
 * own time; a weekly meet-up plans its next once it is over, at the same
 * local time a week on, inside the eight-ahead cap, and stops with the
 * Circle, its organiser or a word the filter now refuses; pace groups are
 * a run's, on one line, through the word filter and its length cap.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  memoryFirestore,
  fieldDelete,
} = require("./helpers/memoryFirestore.cjs");
const meetups = require("../lib/circleMeetups");
const { createNotification } = require("../lib/socialFanout");
const { GoalSpaceError } = require("../lib/goalSpaceMembership");

const {
  MEETUPS_AHEAD_MAX,
  MEETUP_PACE_GROUPS_MAX,
  MEETUP_REMINDER_LEAD_MS,
  MEETUP_REMINDER_MIN_NOTICE_MS,
  MEETUP_SHOWN_AFTER_START_MS,
  normaliseMeetupInput,
  planMeetup,
  cancelMeetup,
  nextWeeklyStart,
  meetupReminderMessage,
  meetupReminderNotifier,
  remindMeetup,
  repeatMeetup,
  sweepMeetups,
} = meetups;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Wednesday 18 November 2026, 12:00 UTC. */
const NOW = Date.UTC(2026, 10, 18, 12, 0);
const ROW = "circle_meetup_reminder_c1_m1";

const PLAN = {
  sport: "run",
  title: "Saturday long run",
  place: "Tooting Lido gate",
  note: null,
  startsAt: NOW + 3 * DAY,
  timeZone: "Europe/London",
};

/** A Circle of four, Maya's run tomorrow with its reminder due now: Maya
 *  and Sam are in, and so is someone who has since left. */
function seed(extra = {}) {
  return {
    "goalSpaces/c1": { ownerId: "owner", active: true, memberCount: 4 },
    "goalSpaces/c1/members/owner": { uid: "owner" },
    "goalSpaces/c1/members/maya": { uid: "maya" },
    "goalSpaces/c1/members/sam": { uid: "sam" },
    "goalSpaces/c1/members/zoe": { uid: "zoe" },
    "users/maya": { timezone: "Europe/London" },
    "users/sam": { timezone: "America/New_York" },
    "goalSpaces/c1/meetups/m1": {
      organiserUid: "maya",
      sport: "run",
      title: "Saturday long run",
      place: "Tooting Lido gate",
      note: null,
      paceGroups: null,
      repeat: null,
      // Thursday 19 November, 11:30 UTC: the reminder fell due half an
      // hour ago.
      startsAt: NOW - 30 * 60_000 + MEETUP_REMINDER_LEAD_MS,
      timeZone: "Europe/London",
      going: ["maya", "sam", "left-since"],
      createdAt: NOW - 3 * DAY,
      remindAt: NOW - 30 * 60_000,
    },
    ...extra,
  };
}

let stamps = 0;
/** The real notification writer, as index.js wires it, with a server time
 *  that changes on every write, so a row written again is seen. */
function notifierFor(firestore) {
  return meetupReminderNotifier({
    firestore,
    createNotification,
    serverTimestamp: () => ++stamps,
  });
}

function sweep(firestore, now = NOW, over = {}) {
  let ids = 0;
  return sweepMeetups({
    firestore,
    now,
    notify: notifierFor(firestore),
    makeId: () => `next${++ids}`,
    deleteField: fieldDelete,
    isRestricted: async (uid) => firestore.data.has(`restricted/${uid}`),
    containsProfanity: (text) => text.includes("rude"),
    ...over,
  });
}

const row = (firestore, uid, id = ROW) =>
  firestore.data.get(`notifications/${uid}/items/${id}`);

beforeEach(() => {
  stamps = 0;
});

describe("pace groups and repeat, as planned", () => {
  it("keeps a run's pace groups on one line and drops a lift's", () => {
    expect(
      normaliseMeetupInput(
        { ...PLAN, paceGroups: "  5:30 /km\n and 6:15 /km " },
        NOW
      ).paceGroups
    ).toBe("5:30 /km and 6:15 /km");
    expect(
      normaliseMeetupInput(
        { ...PLAN, sport: "lift", paceGroups: "5:30 /km" },
        NOW
      ).paceGroups
    ).toBeNull();
    expect(normaliseMeetupInput({ ...PLAN, paceGroups: "  " }, NOW)).toEqual(
      expect.objectContaining({ paceGroups: null, repeat: null })
    );
  });

  it("refuses pace groups past the cap, or ones the word filter refuses", () => {
    const tooLong = "x".repeat(MEETUP_PACE_GROUPS_MAX + 1);
    expect(() =>
      normaliseMeetupInput({ ...PLAN, paceGroups: tooLong }, NOW)
    ).toThrow("pace groups too long");
    expect(
      normaliseMeetupInput(
        { ...PLAN, paceGroups: "x".repeat(MEETUP_PACE_GROUPS_MAX) },
        NOW
      ).paceGroups
    ).toHaveLength(MEETUP_PACE_GROUPS_MAX);
    expect(() =>
      normaliseMeetupInput(
        { ...PLAN, paceGroups: "a rude group" },
        NOW,
        (text) => text.includes("rude")
      )
    ).toThrow("objectionable");
  });

  it("repeats weekly or not at all", () => {
    expect(
      normaliseMeetupInput({ ...PLAN, repeat: "weekly" }, NOW).repeat
    ).toBe("weekly");
    expect(normaliseMeetupInput({ ...PLAN, repeat: null }, NOW).repeat).toBe(
      null
    );
    for (const repeat of ["daily", true, 7]) {
      expect(() => normaliseMeetupInput({ ...PLAN, repeat }, NOW)).toThrow(
        GoalSpaceError
      );
    }
  });

  it("stores when its reminder is due and, for a weekly one, when the next is planned", async () => {
    const firestore = memoryFirestore(seed());
    await planMeetup({
      firestore,
      uid: "maya",
      spaceId: "c1",
      input: { ...PLAN, repeat: "weekly", paceGroups: "5:30 and 6:15 /km" },
      now: NOW,
      makeId: () => "weekly",
    });
    expect(firestore.data.get("goalSpaces/c1/meetups/weekly")).toMatchObject({
      paceGroups: "5:30 and 6:15 /km",
      repeat: "weekly",
      remindAt: PLAN.startsAt - MEETUP_REMINDER_LEAD_MS,
      repeatAt: PLAN.startsAt + MEETUP_SHOWN_AFTER_START_MS,
    });
  });

  it("gives a meet-up planned close to its start no reminder: the plan's notice is fresh", async () => {
    const firestore = memoryFirestore(seed());
    const close = NOW + MEETUP_REMINDER_LEAD_MS + MEETUP_REMINDER_MIN_NOTICE_MS;
    for (const [id, startsAt] of [
      ["close", close - 60_000],
      ["just-far-enough", close],
    ]) {
      await planMeetup({
        firestore,
        uid: "maya",
        spaceId: "c1",
        input: { ...PLAN, startsAt },
        now: NOW,
        makeId: () => id,
      });
    }
    expect(
      firestore.data.get("goalSpaces/c1/meetups/close")
    ).not.toHaveProperty("remindAt");
    expect(
      firestore.data.get("goalSpaces/c1/meetups/just-far-enough").remindAt
    ).toBe(NOW + MEETUP_REMINDER_MIN_NOTICE_MS);
  });
});

describe("the same time a week on", () => {
  it("keeps the organiser's time of day across the clocks changing", () => {
    // London's clocks go back on Sunday 25 October 2026: Saturday 08:00
    // BST (07:00 UTC) is followed by Saturday 08:00 GMT (08:00 UTC).
    expect(nextWeeklyStart(Date.UTC(2026, 9, 24, 7, 0), "Europe/London")).toBe(
      Date.UTC(2026, 9, 31, 8, 0)
    );
    // Forward on Sunday 29 March 2026: 08:00 GMT, then 08:00 BST.
    expect(nextWeeklyStart(Date.UTC(2026, 2, 28, 8, 0), "Europe/London")).toBe(
      Date.UTC(2026, 3, 4, 7, 0)
    );
    // Auckland's clocks go forward on Sunday 27 September 2026: Saturday
    // 07:00 NZST (19:00 UTC the day before), then 07:00 NZDT.
    expect(
      nextWeeklyStart(Date.UTC(2026, 8, 25, 19, 0), "Pacific/Auckland")
    ).toBe(Date.UTC(2026, 9, 2, 18, 0));
    // An ordinary week is seven days.
    expect(nextWeeklyStart(Date.UTC(2026, 10, 21, 8, 0), "Europe/London")).toBe(
      Date.UTC(2026, 10, 28, 8, 0)
    );
  });
});

describe("the reminder's words", () => {
  it("names the day and the time in the reader's zone, and who else is in by number", () => {
    const startsAt = Date.UTC(2026, 10, 21, 2, 0);
    expect(
      meetupReminderMessage({
        sport: "run",
        startsAt,
        timeZone: "Europe/London",
        othersIn: 3,
      })
    ).toBe("Group run on Saturday at 02:00. You and 3 others are in.");
    expect(
      meetupReminderMessage({
        sport: "run",
        startsAt,
        timeZone: "America/New_York",
        othersIn: 1,
      })
    ).toBe("Group run on Friday at 21:00. You and 1 other are in.");
    expect(
      meetupReminderMessage({
        sport: "lift",
        startsAt,
        timeZone: "Pacific/Auckland",
        othersIn: 0,
      })
    ).toBe("Group lift on Saturday at 15:00. You’re in.");
  });
});

describe("the reminder", () => {
  it("goes once, to each member who is in, in their own time", async () => {
    const firestore = memoryFirestore(seed());
    const first = await sweep(firestore);
    expect(first).toMatchObject({ reminded: 1, told: 2, failed: 0 });

    expect(row(firestore, "maya")).toMatchObject({
      type: "circle_meetup_reminder",
      message: "Group run on Thursday at 11:30. You and 1 other are in.",
      fromUserId: "tropos-meetups",
    });
    // Sam reads it in New York.
    expect(row(firestore, "sam").message).toBe(
      "Group run on Thursday at 06:30. You and 1 other are in."
    );
    // Nobody who did not say they're in, nor anyone no longer a member.
    for (const uid of ["owner", "zoe", "left-since"]) {
      expect(row(firestore, uid)).toBeUndefined();
    }
    const meetup = firestore.data.get("goalSpaces/c1/meetups/m1");
    expect(meetup).not.toHaveProperty("remindAt");
    expect(meetup.remindedAt).toBe(NOW);

    // The next hour's sweep finds nothing to do.
    const written = { ...row(firestore, "sam") };
    expect(await sweep(firestore, NOW + HOUR)).toMatchObject({
      reminded: 0,
      told: 0,
    });
    expect(row(firestore, "sam")).toEqual(written);
  });

  it("is sent once even when a sweep is cut off before it marks the meet-up", async () => {
    const firestore = memoryFirestore(seed());
    await sweep(firestore);
    const written = { ...row(firestore, "sam") };
    // As if the mark had never landed: the next sweep sends again, and the
    // fixed row id keeps each member at one notice, with its first time.
    const meetup = firestore.data.get("goalSpaces/c1/meetups/m1");
    firestore.data.set("goalSpaces/c1/meetups/m1", {
      ...meetup,
      remindAt: NOW - 30 * 60_000,
      remindedAt: undefined,
    });
    delete firestore.data.get("goalSpaces/c1/meetups/m1").remindedAt;
    await sweep(firestore, NOW + HOUR);
    expect(row(firestore, "sam")).toEqual(written);
    const rows = [...firestore.data.keys()].filter((k) =>
      k.startsWith("notifications/sam/")
    );
    expect(rows).toEqual([`notifications/sam/items/${ROW}`]);
  });

  it("follows each person's Circles switch", async () => {
    const firestore = memoryFirestore(
      seed({
        "users/sam": {
          timezone: "America/New_York",
          notificationPreferences: { circles: false },
        },
      })
    );
    expect(await sweep(firestore)).toMatchObject({ told: 2 });
    expect(row(firestore, "sam")).toBeUndefined();
    // Anchored: Maya's switch is on, and hers came.
    expect(row(firestore, "maya")).toBeDefined();
  });

  it("is never sent for a meet-up called off", async () => {
    const firestore = memoryFirestore(seed());
    await cancelMeetup({
      firestore,
      uid: "maya",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    });
    expect(await sweep(firestore)).toMatchObject({ reminded: 0, told: 0 });
    // And when it is called off after the sweep found it, the re-read
    // before sending finds nothing.
    const again = memoryFirestore(seed());
    const ref = again.doc("goalSpaces/c1/meetups/m1");
    again.data.delete("goalSpaces/c1/meetups/m1");
    const notified = [];
    expect(
      await remindMeetup({
        firestore: again,
        ref,
        now: NOW,
        notify: async (uid) => notified.push(uid),
        deleteField: fieldDelete,
      })
    ).toEqual({ sent: 0 });
    expect(notified).toEqual([]);
    // Anchored: the same meet-up, still planned, is sent.
    const live = memoryFirestore(seed());
    await remindMeetup({
      firestore: live,
      ref: live.doc("goalSpaces/c1/meetups/m1"),
      now: NOW,
      notify: async (uid) => notified.push(uid),
      deleteField: fieldDelete,
    });
    expect(notified).toEqual(["maya", "sam"]);
  });

  it("is not sent once the meet-up has started, nor in a Circle that has ended", async () => {
    const started = memoryFirestore(seed());
    expect(await sweep(started, NOW + MEETUP_REMINDER_LEAD_MS)).toMatchObject({
      told: 0,
    });
    expect(started.data.get("goalSpaces/c1/meetups/m1")).not.toHaveProperty(
      "remindAt"
    );

    const ended = memoryFirestore(
      seed({ "goalSpaces/c1": { ownerId: "owner", active: false } })
    );
    expect(await sweep(ended)).toMatchObject({ told: 0 });
    expect(row(ended, "maya")).toBeUndefined();
  });

  it("is not sent before it is due", async () => {
    const firestore = memoryFirestore(seed());
    expect(await sweep(firestore, NOW - HOUR)).toMatchObject({ reminded: 0 });
    expect(firestore.data.get("goalSpaces/c1/meetups/m1").remindAt).toBe(
      NOW - 30 * 60_000
    );
  });

  it("skips someone with a block between them and the organiser", async () => {
    const firestore = memoryFirestore(
      seed({ "blocks/sam/users/maya": { at: 1 } })
    );
    expect(await sweep(firestore)).toMatchObject({ told: 1 });
    expect(row(firestore, "sam")).toBeUndefined();
    expect(row(firestore, "maya")).toBeDefined();
  });
});

describe("a weekly meet-up", () => {
  /** Maya's weekly run, last Saturday 08:00 London, over since 11:00. */
  const LAST = Date.UTC(2026, 10, 14, 8, 0);
  const OVER = LAST + MEETUP_SHOWN_AFTER_START_MS;
  function weekly(extra = {}, over = {}) {
    return memoryFirestore(
      seed({
        "goalSpaces/c1/meetups/m1": {
          organiserUid: "maya",
          sport: "run",
          title: "Saturday long run",
          place: "Tooting Lido gate",
          note: "Coffee after",
          paceGroups: "5:30 and 6:15 /km",
          repeat: "weekly",
          startsAt: LAST,
          timeZone: "Europe/London",
          going: ["maya", "sam"],
          createdAt: LAST - 3 * DAY,
          remindedAt: LAST - DAY,
          repeatAt: OVER,
          ...over,
        },
        ...extra,
      })
    );
  }
  const planned = (firestore) =>
    [...firestore.data.keys()].filter((k) =>
      k.startsWith("goalSpaces/c1/meetups/")
    );

  it("plans its next once it is over: a week on, the organiser in, the others to say again", async () => {
    const firestore = weekly();
    const now = OVER + 10 * 60_000;
    expect(await sweep(firestore, now)).toMatchObject({ repeated: 1 });
    expect(planned(firestore)).toEqual(["goalSpaces/c1/meetups/next1"]);
    const next = firestore.data.get("goalSpaces/c1/meetups/next1");
    const startsAt = Date.UTC(2026, 10, 21, 8, 0);
    expect(next).toEqual({
      organiserUid: "maya",
      sport: "run",
      title: "Saturday long run",
      place: "Tooting Lido gate",
      note: "Coffee after",
      paceGroups: "5:30 and 6:15 /km",
      repeat: "weekly",
      startsAt,
      timeZone: "Europe/London",
      going: ["maya"],
      createdAt: now,
      remindAt: startsAt - MEETUP_REMINDER_LEAD_MS,
      repeatAt: startsAt + MEETUP_SHOWN_AFTER_START_MS,
    });
    // Run twice, it plans one.
    expect(await sweep(firestore, now + 60_000)).toMatchObject({
      repeated: 0,
    });
    expect(planned(firestore)).toEqual(["goalSpaces/c1/meetups/next1"]);
    // Nobody is told of the next one; the reminder comes in its week.
    expect(
      [...firestore.data.keys()].filter((k) => k.startsWith("notifications/"))
    ).toEqual([]);
  });

  it("waits until it is over", async () => {
    const firestore = weekly();
    expect(await sweep(firestore, OVER - 60_000)).toMatchObject({
      repeated: 0,
    });
    expect(planned(firestore)).toEqual(["goalSpaces/c1/meetups/m1"]);
  });

  it("skips to the first week still ahead after a sweep that did not run", async () => {
    const firestore = weekly();
    await sweep(firestore, LAST + 8 * DAY);
    expect(firestore.data.get("goalSpaces/c1/meetups/next1").startsAt).toBe(
      Date.UTC(2026, 10, 28, 8, 0)
    );
  });

  it(`stays inside the ${MEETUPS_AHEAD_MAX}-ahead cap`, async () => {
    const full = {};
    for (let i = 0; i < MEETUPS_AHEAD_MAX; i++) {
      full[`goalSpaces/c1/meetups/a${i}`] = {
        organiserUid: "sam",
        sport: "run",
        startsAt: OVER + (i + 1) * DAY,
        going: ["sam"],
      };
    }
    const firestore = weekly(full);
    expect(await sweep(firestore, OVER)).toMatchObject({ repeated: 0 });
    expect(firestore.data.has("goalSpaces/c1/meetups/next1")).toBe(false);
    // The series has ended; the next sweep does not try again.
    expect(firestore.data.get("goalSpaces/c1/meetups/m1")).not.toHaveProperty(
      "repeatAt"
    );

    // Anchored: one fewer ahead, and it plans.
    const room = { ...full };
    delete room["goalSpaces/c1/meetups/a0"];
    const roomy = weekly(room);
    expect(await sweep(roomy, OVER)).toMatchObject({ repeated: 1 });
  });

  it("ends with the Circle, its organiser leaving, a restriction, a deletion or a word the filter now refuses", async () => {
    const cases = {
      "circle ended": weekly({
        "goalSpaces/c1": { ownerId: "owner", active: false },
      }),
      "organiser left": (() => {
        const db = weekly();
        db.data.delete("goalSpaces/c1/members/maya");
        return db;
      })(),
      restricted: weekly({ "restricted/maya": {} }),
      deleting: weekly({
        "accountDeletionRequests/maya": { status: "running" },
      }),
      objectionable: weekly({}, { place: "rude corner" }),
    };
    for (const [why, firestore] of Object.entries(cases)) {
      expect(await sweep(firestore, OVER), why).toMatchObject({
        repeated: 0,
      });
      expect(planned(firestore), why).toEqual(["goalSpaces/c1/meetups/m1"]);
      expect(
        firestore.data.get("goalSpaces/c1/meetups/m1"),
        why
      ).not.toHaveProperty("repeatAt");
    }
  });

  it("ends when it is called off: the meet-up and its repeat go together", async () => {
    const firestore = weekly(
      {},
      { startsAt: NOW + DAY, repeatAt: NOW + DAY + MEETUP_SHOWN_AFTER_START_MS }
    );
    await cancelMeetup({
      firestore,
      uid: "maya",
      spaceId: "c1",
      meetupId: "m1",
      now: NOW,
    });
    expect(await sweep(firestore, NOW + 2 * DAY)).toMatchObject({
      repeated: 0,
    });
    expect(planned(firestore)).toEqual([]);
  });

  it("does not touch a document called meetups outside a Circle", async () => {
    const firestore = memoryFirestore({
      "elsewhere/x/meetups/m1": {
        remindAt: NOW - HOUR,
        repeatAt: NOW - HOUR,
        repeat: "weekly",
        startsAt: NOW + DAY,
        going: ["maya"],
      },
    });
    expect(await sweep(firestore)).toMatchObject({
      repeated: 0,
      reminded: 0,
    });
    expect(firestore.data.get("elsewhere/x/meetups/m1").remindAt).toBe(
      NOW - HOUR
    );
  });
});

describe("planning, a repeat and a reminder, one after another", () => {
  it("a weekly run planned on Wednesday is remembered on Friday and comes again next Saturday", async () => {
    const firestore = memoryFirestore(
      seed({ "goalSpaces/c1/meetups/m1": null })
    );
    firestore.data.delete("goalSpaces/c1/meetups/m1");
    // Saturday 21 November, 08:00 London.
    const saturday = Date.UTC(2026, 10, 21, 8, 0);
    await planMeetup({
      firestore,
      uid: "maya",
      spaceId: "c1",
      input: { ...PLAN, startsAt: saturday, repeat: "weekly" },
      now: NOW,
      makeId: () => "first",
    });
    // Friday 08:30: the reminder goes to Maya, who planned it.
    await sweep(firestore, saturday - DAY + 30 * 60_000);
    expect(
      row(firestore, "maya", "circle_meetup_reminder_c1_first").message
    ).toBe("Group run on Saturday at 08:00. You’re in.");
    // Saturday 11:30: it is over, and next Saturday's is planned.
    await sweep(
      firestore,
      saturday + MEETUP_SHOWN_AFTER_START_MS + 30 * 60_000
    );
    expect(firestore.data.has("goalSpaces/c1/meetups/first")).toBe(false);
    expect(firestore.data.get("goalSpaces/c1/meetups/next1")).toMatchObject({
      startsAt: saturday + 7 * DAY,
      going: ["maya"],
    });
  });
});

describe("a repeat run on its own", () => {
  it("reports why a series ended", async () => {
    const firestore = memoryFirestore(
      seed({
        "goalSpaces/c1/meetups/m1": {
          organiserUid: "maya",
          sport: "run",
          title: "x",
          place: "y",
          repeat: null,
          startsAt: NOW - DAY,
          timeZone: "Europe/London",
          going: ["maya"],
          repeatAt: NOW - HOUR,
        },
      })
    );
    expect(
      await repeatMeetup({
        firestore,
        ref: firestore.doc("goalSpaces/c1/meetups/m1"),
        now: NOW,
        makeId: () => "n",
        deleteField: fieldDelete,
        isRestricted: async () => false,
        containsProfanity: () => false,
      })
    ).toEqual({ ended: "not-weekly" });
  });
});
