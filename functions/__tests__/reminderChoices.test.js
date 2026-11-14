/**
 * The evening streak and Monday review reminders as the server sends them
 * (App1 Q26): one switch and one time per reminder, sent by push only when
 * push carries it, so the phone's copy and the server's never both go.
 *
 * The choice itself is held to the app's copy, shape by shape, in
 * `src/lib/__tests__/reminderChoices.cross.test.ts`; this file pins the
 * readers the senders call (`streakReminderPushHour`, `reviewReminderByPush`)
 * against stored documents.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  streakReminderPushHour,
  reviewReminderByPush,
  REVIEW_REMINDER_HOUR,
} = require("../lib/reminderChoices");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");

const PUSH_ON = { enabled: true };

function db(settings = {}) {
  return memoryFirestore(
    Object.fromEntries(
      Object.entries(settings).map(([name, value]) => [
        `users/u1/settings/${name}`,
        value,
      ])
    )
  );
}

describe("the evening streak reminder, as the server sends it", () => {
  it("goes at the hour the person chose, not 19:00", async () => {
    const store = db({
      reminders: { streakEnabled: true, streakTime: "21:00" },
    });
    expect(await streakReminderPushHour(store, "u1", PUSH_ON)).toBe(21);
  });

  it("sends nothing when push does not carry it: the phone schedules it", async () => {
    const store = db({
      reminders: { streakEnabled: true, streakTime: "21:00" },
    });
    expect(await streakReminderPushHour(store, "u1", { enabled: false })).toBe(
      null
    );
    expect(await streakReminderPushHour(store, "u1", null)).toBe(null);
  });

  it("sends nothing once it is turned off, whatever the old push switch says", async () => {
    const store = db({
      reminders: { streakEnabled: false, streakTime: "20:00" },
    });
    expect(
      await streakReminderPushHour(store, "u1", { enabled: true, streak: true })
    ).toBe(null);
  });

  it("reads the old fields until the new ones are written", async () => {
    // Push on with its streak switch left on: sent, at the phone's time.
    expect(
      await streakReminderPushHour(
        db({ streakReminder: { time: "18:30" } }),
        "u1",
        PUSH_ON
      )
    ).toBe(18);
    // Push only, no time ever chosen: the default evening.
    expect(await streakReminderPushHour(db(), "u1", PUSH_ON)).toBe(20);
    // The push's own streak switch was off and the phone's too: off.
    expect(
      await streakReminderPushHour(
        db({ streakReminder: { enabled: false, primingShown: true } }),
        "u1",
        { enabled: true, streak: false }
      )
    ).toBe(null);
    // The phone's switch turned off, the push left at its default: off.
    expect(
      await streakReminderPushHour(
        db({ streakReminder: { enabled: false, primingShown: true } }),
        "u1",
        PUSH_ON
      )
    ).toBe(null);
  });

  it("does not read the old document once both new fields are written", async () => {
    const store = db({
      reminders: { streakEnabled: true, streakTime: "19:00" },
      streakReminder: { enabled: false, primingShown: true },
    });
    store.failures.set(
      "get:users/u1/settings/streakReminder",
      new Error("read the old document")
    );
    expect(await streakReminderPushHour(store, "u1", PUSH_ON)).toBe(19);
  });
});

describe("the Monday review reminder, as the server sends it", () => {
  it("goes at the phone's hour, 09:00", () => {
    expect(REVIEW_REMINDER_HOUR).toBe(9);
    const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");
    expect(src).toContain(
      "const RECAP_LOCAL_HOUR = reminderChoices.REVIEW_REMINDER_HOUR;"
    );
  });

  it("is on for an account with push unless turned off", async () => {
    expect(await reviewReminderByPush(db(), "u1", PUSH_ON)).toBe(true);
    expect(
      await reviewReminderByPush(
        db({ reminders: { reviewEnabled: false } }),
        "u1",
        PUSH_ON
      )
    ).toBe(false);
  });

  it("sends nothing when push does not carry it", async () => {
    expect(await reviewReminderByPush(db(), "u1", { enabled: false })).toBe(
      false
    );
  });

  it("keeps the phone's Off when the recap push was only left at its default", async () => {
    const off = { reviewReminder: { enabled: false } };
    expect(await reviewReminderByPush(db(off), "u1", PUSH_ON)).toBe(false);
    expect(
      await reviewReminderByPush(db(off), "u1", { enabled: true, recap: true })
    ).toBe(true);
  });
});

describe("the senders read the reminders, not the old push switches", () => {
  const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const body = (name) => {
    const from = src.slice(src.indexOf(`async function ${name}`));
    return from.slice(0, from.indexOf("\n}\n"));
  };

  it("the streak nudge sends at the chosen hour", () => {
    const fn = body("maybeSendStreakNudge");
    expect(fn).toContain("reminderChoices.streakReminderPushHour(");
    expect(fn).toContain("isLocalSendHour(now, timezone, hour)");
    expect(fn).not.toContain('"streak")');
  });

  it("the Monday recap asks whether the review reminder goes by push", () => {
    const fn = body("maybeSendWeeklyRecap");
    expect(fn).toContain("reminderChoices.reviewReminderByPush(");
    expect(fn).not.toContain('"recap")');
  });
});
