// The streak, review and badge pushes under the day's one push (App1 Q60)
// and the quiet rule (App1 Q62), driven through the senders in index.js.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const pushTokenOwnership = require("../lib/pushTokenOwnership");
const fns = require("../index");
const admin = require("../lib/adminSdk");
const db = admin.firestore();

const UID = "budget-owner";
const PROFILE = { timezone: "Europe/London" };
// Thursday 12 November 2026; London is on UTC.
const EVENING = new Date("2026-11-12T20:00:00Z");
const MONDAY_9 = new Date("2026-11-16T09:00:00Z");
const BADGE_HOUR = new Date("2026-11-12T11:00:00Z");
const REMINDERS = `users/${UID}/settings/reminders`;
const BUDGET = `users/${UID}/settings/pushBudget`;

let firestore;
let send;

function seed(extra = {}) {
  firestore = memoryFirestore({
    [`users/${UID}`]: PROFILE,
    [`users/${UID}/settings/push`]: { enabled: true, badge: true },
    [REMINDERS]: {
      streakEnabled: true,
      streakTime: "20:00",
      reviewEnabled: true,
    },
    // A five-day streak that ended yesterday: a log today keeps it.
    [`users/${UID}/streaks/data`]: {
      anchorStreak: 5,
      anchorDate: "2026-11-11",
      lastActiveDate: "2026-11-11",
      badges: [{ id: "first-run", earnedAt: "2026-11-12T08:00:00.000Z" }],
    },
    ...extra,
  });
  vi.spyOn(db, "doc").mockImplementation(firestore.doc);
  vi.spyOn(db, "collection").mockImplementation(firestore.collection);
  vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
}

beforeEach(() => {
  seed();
  send = vi.fn(async ({ tokens }) => ({
    successCount: tokens.length,
    responses: tokens.map(() => ({ success: true })),
  }));
  Object.defineProperty(admin, "messaging", {
    configurable: true,
    value: () => ({ sendEachForMulticast: send }),
  });
  vi.spyOn(pushTokenOwnership, "loadClaimedRegistrations").mockResolvedValue([
    { token: "fcm-token", hash: "hash", bindingId: "binding" },
  ]);
  vi.spyOn(pushTokenOwnership, "acquireSendLease").mockResolvedValue({
    leaseId: "lease",
  });
  vi.spyOn(pushTokenOwnership, "releaseSendLease").mockResolvedValue();
});

afterEach(() => {
  delete admin.messaging;
  vi.restoreAllMocks();
});

const stored = (path) => firestore.data.get(path) || {};

describe("the evening reminder", () => {
  it("takes the day's one push and waits to be answered", async () => {
    expect(await fns._maybeSendStreakNudge(UID, EVENING, PROFILE)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(stored(BUDGET).sent).toEqual([
      expect.objectContaining({ day: "2026-11-12", kind: "streak" }),
    ]);
    expect(stored(REMINDERS).streakSentAt.toMillis()).toBe(EVENING.getTime());
    expect(stored(REMINDERS).streakIgnored).toBe(0);
  });

  it("does not go when today's push has gone", async () => {
    seed({
      [BUDGET]: { sent: [{ day: "2026-11-12", kind: "badge", id: "b" }] },
    });
    expect(await fns._maybeSendStreakNudge(UID, EVENING, PROFILE)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("goes quiet instead of a fourth after three ignored running", async () => {
    seed({
      [REMINDERS]: {
        streakEnabled: true,
        streakTime: "20:00",
        streakIgnored: 2,
        streakSentAt: Date.parse("2026-11-11T20:00:00Z"),
      },
    });
    expect(await fns._maybeSendStreakNudge(UID, EVENING, PROFILE)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(stored(REMINDERS)).toMatchObject({
      streakEnabled: false,
      streakIgnored: 0,
      streakSentAt: null,
      streakQuietShown: false,
    });
    expect(stored(REMINDERS).streakQuietAt.toMillis()).toBe(EVENING.getTime());
    // Off now: nothing more is sent.
    expect(
      await fns._maybeSendStreakNudge(
        UID,
        new Date("2026-11-13T20:00:00Z"),
        PROFILE
      )
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("counts an answered one as answered, and sends", async () => {
    seed({
      [REMINDERS]: {
        streakEnabled: true,
        streakTime: "20:00",
        streakIgnored: 2,
        streakSentAt: Date.parse("2026-11-11T20:00:00Z"),
        streakAnsweredAt: Date.parse("2026-11-11T20:30:00Z"),
      },
    });
    expect(await fns._maybeSendStreakNudge(UID, EVENING, PROFILE)).toBe(true);
    expect(stored(REMINDERS).streakIgnored).toBe(0);
  });

  it("gives the day back when no device took it", async () => {
    send.mockResolvedValueOnce({
      successCount: 0,
      responses: [{ success: false, error: { code: "messaging/internal" } }],
    });
    expect(await fns._maybeSendStreakNudge(UID, EVENING, PROFILE)).toBe(false);
    expect(stored(BUDGET).sent).toEqual([]);
    expect(stored(REMINDERS).streakSentAt ?? null).toBeNull();
  });
});

describe("Monday's review", () => {
  const monday = (extra = {}) =>
    seed({
      // A review waits: something was logged before the reviewed week ended.
      [`users/${UID}/meals/m1`]: { date: "2026-11-10" },
      [`users/${UID}/streaks/data`]: {
        anchorStreak: 5,
        anchorDate: "2026-11-15",
        lastActiveDate: "2026-11-15",
      },
      ...extra,
    });

  it("gives way to an evening reminder still to come that day", async () => {
    monday();
    expect(await fns._maybeSendWeeklyRecap(UID, MONDAY_9, PROFILE)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(stored(BUDGET).sent ?? []).toEqual([]);
  });

  it("goes when the evening reminder cannot", async () => {
    monday({
      [REMINDERS]: { streakEnabled: false, reviewEnabled: true },
    });
    expect(await fns._maybeSendWeeklyRecap(UID, MONDAY_9, PROFILE)).toBe(true);
    expect(stored(BUDGET).sent).toEqual([
      expect.objectContaining({ day: "2026-11-16", kind: "recap" }),
    ]);
    expect(stored(REMINDERS).reviewSentAt.toMillis()).toBe(MONDAY_9.getTime());
    // It no longer silences the evening by the streak's own marker.
    expect(
      stored(`users/${UID}/settings/pushState`).lastStreakNudgeDateKey
    ).toBeUndefined();
  });
});

describe("a new badge", () => {
  it("waits until 10:00, then for an evening reminder still to come", async () => {
    expect(
      await fns._maybeSendBadgeNudge(
        UID,
        new Date("2026-11-12T09:00:00Z"),
        PROFILE
      )
    ).toBe(false);
    expect(await fns._maybeSendBadgeNudge(UID, BADGE_HOUR, PROFILE)).toBe(
      false
    );
    expect(send).not.toHaveBeenCalled();
    // Not marked pushed, so a later hour can still send it.
    expect(
      stored(`users/${UID}/settings/pushState`).pushedBadgeIds
    ).toBeUndefined();
  });

  it("goes when nothing above it is due today", async () => {
    seed({ [REMINDERS]: { streakEnabled: false } });
    expect(await fns._maybeSendBadgeNudge(UID, BADGE_HOUR, PROFILE)).toBe(true);
    expect(stored(BUDGET).sent).toEqual([
      expect.objectContaining({ kind: "badge" }),
    ]);
  });
});
