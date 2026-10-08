/**
 * trialReminderSweep — the hourly email before a trial's first payment
 * (Sub1, STATUS 2026-10-06), driven whole over an in-memory Firestore with
 * RevenueCat, Auth and Resend faked.
 *
 * The invariants, most costly first:
 *   - A due reminder is sent once, to the address the person signs in
 *     with, and marked; the next run sends nothing.
 *   - RevenueCat is read again first: a trial cancelled or converted since
 *     the last webhook gets no email.
 *   - A failed send is not marked, so the next hour tries again.
 *   - A deleting account gets nothing, and RevenueCat is not called for it.
 *   - No address reaches the logs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* firebase-functions/v1 needs a project id to construct triggers. */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "tropos-unit-test";

const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const tr = require("../lib/trialReminder");
const { _internals } = require("../trialReminders");
const { runSweep, LOOKBACK_MS, SEND_WITHOUT_REFRESH_MS } = _internals;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHLY = "com.tropos.app.pro.monthly";
const ENDS_AT = Date.parse("2026-10-04T12:00:00Z");
const ADDRESS = "someone@privaterelay.appleid.com";

/** A user in a 7-day trial ending Sunday 4 October, reminded 1 October. */
function inTrial(overrides = {}) {
  return {
    subscriptionTier: "pro",
    timezone: "Europe/London",
    subscriptionTrial: {
      ...tr.planTrialRecord({
        stored: null,
        trial: {
          productId: MONTHLY,
          store: "app_store",
          startedAtMs: ENDS_AT - 7 * DAY,
          endsAtMs: ENDS_AT,
          willRenew: true,
        },
        timeZone: "Europe/London",
        reportedPrice: {
          productId: MONTHLY,
          amount: 3.99,
          currencyCode: "GBP",
          display: "£3.99",
        },
      }),
      ...overrides,
    },
  };
}

const REMINDER_AT = Date.parse(inTrial().subscriptionTrial.reminderAt);
const CANCEL_BY = Date.parse(inTrial().subscriptionTrial.cancelBy);
const DUE = REMINDER_AT + 5 * 60_000;

let db;
let sent;
let refreshed;
let logs;

function deps(overrides = {}) {
  return {
    db,
    nowMs: DUE,
    logger: {
      log: (...args) => logs.push(["log", ...args]),
      warn: (...args) => logs.push(["warn", ...args]),
      error: (...args) => logs.push(["error", ...args]),
    },
    shouldProceed: async () => true,
    refresh: async (uid) => {
      refreshed.push(uid);
    },
    getEmail: async () => ADDRESS,
    sendEmail: async (message) => {
      sent.push(message);
    },
    ...overrides,
  };
}

const trialOf = (uid) => db.data.get(`users/${uid}`).subscriptionTrial;

/** RevenueCat, re-read, now says this about alice's trial. */
const rewrite = (trial) => async (uid) => {
  refreshed.push(uid);
  const user = db.data.get(`users/${uid}`);
  db.data.set(`users/${uid}`, { ...user, subscriptionTrial: trial });
};

beforeEach(() => {
  db = memoryFirestore({ "users/alice": inTrial() });
  sent = [];
  refreshed = [];
  logs = [];
});

describe("trialReminderSweep", () => {
  it("emails a due reminder once, to the sign-in address, and marks it", async () => {
    expect(await runSweep(deps())).toEqual({ emailed: 1 });
    expect(refreshed).toEqual(["alice"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: ADDRESS,
      subject: "Reminder: your Tropos Pro trial ends on Sunday 4 October",
    });
    expect(sent[0].text).toContain("£3.99");
    expect(sent[0].html).toContain("<!doctype html>");
    expect(trialOf("alice").reminderEmailedAt).toBe(
      new Date(DUE).toISOString()
    );

    expect(await runSweep(deps({ nowMs: DUE + HOUR }))).toEqual({ sent: 1 });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing before the reminder's instant, or after the last moment to cancel", async () => {
    expect(await runSweep(deps({ nowMs: REMINDER_AT - 1 }))).toEqual({});
    expect(await runSweep(deps({ nowMs: CANCEL_BY }))).toEqual({ late: 1 });
    expect(sent).toEqual([]);
    expect(
      await runSweep(deps({ nowMs: REMINDER_AT + LOOKBACK_MS + 1 }))
    ).toEqual({});
  });

  it("sends nothing when RevenueCat now says the trial was cancelled or converted", async () => {
    const cancelled = { ...inTrial().subscriptionTrial, willRenew: false };
    expect(await runSweep(deps({ refresh: rewrite(cancelled) }))).toEqual({
      cancelled: 1,
    });
    db = memoryFirestore({ "users/alice": inTrial() });
    expect(await runSweep(deps({ refresh: rewrite(null) }))).toEqual({
      none: 1,
    });
    expect(sent).toEqual([]);
  });

  it("waits for RevenueCat while there is time, and sends without it when there is not", async () => {
    const down = async () => {
      throw Object.assign(new Error("down"), { code: "network" });
    };
    expect(await runSweep(deps({ refresh: down }))).toEqual({
      "revenuecat-unavailable": 1,
    });
    expect(sent).toEqual([]);

    const close = CANCEL_BY - SEND_WITHOUT_REFRESH_MS + 1;
    expect(await runSweep(deps({ refresh: down, nowMs: close }))).toEqual({
      emailed: 1,
    });
    expect(sent).toHaveLength(1);
  });

  it("leaves a deleting account alone, without calling RevenueCat", async () => {
    expect(await runSweep(deps({ shouldProceed: async () => false }))).toEqual({
      "account-deleting": 1,
    });
    expect(refreshed).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("sends nothing to an account without an address", async () => {
    expect(await runSweep(deps({ getEmail: async () => null }))).toEqual({
      "no-email": 1,
    });
    expect(trialOf("alice").reminderEmailedAt).toBeNull();
  });

  it("does not mark a failed send, so the next hour tries again, and logs no address", async () => {
    const failing = async () => {
      throw new Error(
        `Resend send failed (422): {"message":"Invalid \`to\` field: ${ADDRESS}"}`
      );
    };
    expect(await runSweep(deps({ sendEmail: failing }))).toEqual({ failed: 1 });
    expect(trialOf("alice").reminderEmailedAt).toBeNull();
    expect(JSON.stringify(logs)).not.toContain(ADDRESS);
    expect(JSON.stringify(logs)).toContain("[address]");

    expect(await runSweep(deps({ nowMs: DUE + HOUR }))).toEqual({ emailed: 1 });
  });

  it("marks only the trial it reminded about", async () => {
    const replaced = {
      ...inTrial().subscriptionTrial,
      endsAt: new Date(ENDS_AT + 30 * DAY).toISOString(),
    };
    const sendThenReplace = async (message) => {
      sent.push(message);
      const user = db.data.get("users/alice");
      db.data.set("users/alice", { ...user, subscriptionTrial: replaced });
    };
    expect(await runSweep(deps({ sendEmail: sendThenReplace }))).toEqual({
      emailed: 1,
    });
    expect(trialOf("alice").reminderEmailedAt).toBeNull();
  });

  it("reminds each person whose reminder is due, and only them", async () => {
    db = memoryFirestore({
      "users/alice": inTrial(),
      "users/bob": inTrial({ reminderAt: new Date(DUE + DAY).toISOString() }),
      "users/carol": { subscriptionTier: "free" },
      "users/dan": inTrial({ willRenew: false }),
    });
    expect(await runSweep(deps())).toEqual({ emailed: 1, cancelled: 1 });
    expect(sent).toHaveLength(1);
    expect(refreshed).toEqual(["alice"]);
  });
});
