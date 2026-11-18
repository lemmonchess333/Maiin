/**
 * hourlyEmailSweep (App1 Q55): the weekly review and the emails after a
 * break, to the people who said yes, in their own morning.
 *
 * What it must never do is the point of most of these: email someone whose
 * yes was withdrawn a moment ago, an address nobody verified, an account
 * being deleted, or the same email twice; or keep sending when Resend says
 * stop. The transport is a fake, so nothing here sends a real email.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { _internals } = require("../updateEmails");

const DAY_MS = 86400000;
/** Monday 16 November 2026, 08:00 in London (GMT). */
const MONDAY_8AM = Date.UTC(2026, 10, 16, 8, 0);
const YES = { on: true, givenAt: "T", givenVia: "setup", wording: 1 };
const TOKEN = "T".repeat(43);

const seconds = (ms) => ({ seconds: ms / 1000 });

function userDoc(extra = {}) {
  return {
    timezone: "Europe/London",
    preferredDistanceUnit: "km",
    emailConsent: { weeklyReview: { ...YES }, winBack: { ...YES } },
    ...extra,
  };
}

/** A week with a lift, a run and a full food day in it. */
function activeWeek(uid) {
  return {
    [`users/${uid}/workouts/w1`]: { date: "2026-11-10", exercises: [] },
    [`users/${uid}/runs/r1`]: {
      date: "2026-11-12",
      distance: 5000,
      duration: 1800,
    },
    [`users/${uid}/meals/m1`]: { date: "2026-11-13", totalCalories: 1900 },
  };
}

let db;
let deps;
let accounts;
let meals;
let budget;

function makeDeps(nowMs) {
  return {
    db,
    nowMs,
    clock: () => 0,
    sleep: async () => {},
    // Start the list of accounts at its beginning.
    pivot: "",
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
    shouldProceed: vi.fn(async () => true),
    getAccount: vi.fn(async (uid) => accounts[uid] ?? null),
    latestMealMs: vi.fn(async (_db, uid) => meals[uid] ?? null),
    claimBudget: vi.fn(async () => {
      if (budget <= 0) return false;
      budget -= 1;
      return true;
    }),
    sendEmail: vi.fn(async () => {}),
  };
}

function seed(docs) {
  db = memoryFirestore(docs);
  deps = makeDeps(MONDAY_8AM);
}

beforeEach(() => {
  accounts = {
    sam: { email: "sam@example.com", emailVerified: true, disabled: false },
    ali: { email: "ali@example.com", emailVerified: true, disabled: false },
  };
  meals = {};
  budget = 60;
  // Sam trained last week, so no break.
  seed({
    "users/sam": userDoc({ lastActiveAt: seconds(MONDAY_8AM - 4 * DAY_MS) }),
    ...activeWeek("sam"),
  });
});

const weekly = () =>
  deps.sendEmail.mock.calls.filter(([m]) =>
    m.idempotencyKey.startsWith("weeklyReview/")
  );

describe("the weekly review email", () => {
  it("goes at 08:00 on Monday where the person is, with an unsubscribe link and one key", async () => {
    await _internals.runSweep(deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    const [message] = deps.sendEmail.mock.calls[0];
    expect(message.to).toBe("sam@example.com");
    expect(message.subject).toBe("Your week, reviewed: 9–15 Nov");
    expect(message.idempotencyKey).toBe("weeklyReview/sam/2026-11-09");
    const state = db.data.get("users/sam/settings/emailState");
    expect(state.unsubscribeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const link = `https://troposfit.com/email/unsubscribe?u=sam&t=${state.unsubscribeToken}`;
    expect(message.text).toContain(link);
    expect(message.headers).toEqual({
      "List-Unsubscribe": `<${link}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(state.weeklyReview).toMatchObject({
      key: "2026-11-09",
      state: "sent",
    });
  });

  it("keeps the token it already made", async () => {
    db.data.set("users/sam/settings/emailState", { unsubscribeToken: TOKEN });
    await _internals.runSweep(deps);
    expect(deps.sendEmail.mock.calls[0][0].text).toContain(`t=${TOKEN}`);
  });

  it.each([
    ["at 07:00", MONDAY_8AM - 3_600_000],
    ["at noon", MONDAY_8AM + 4 * 3_600_000],
    ["on a Tuesday", MONDAY_8AM + DAY_MS],
  ])("does not go %s", async (_case, nowMs) => {
    deps = makeDeps(nowMs);
    await _internals.runSweep(deps);
    expect(weekly()).toHaveLength(0);
  });

  it("is tried again until 11:59 when an hour could not send it", async () => {
    deps = makeDeps(MONDAY_8AM + 3 * 3_600_000);
    await _internals.runSweep(deps);
    expect(weekly()).toHaveLength(1);
  });

  it("goes once, however many runs see it", async () => {
    await _internals.runSweep(deps);
    deps = makeDeps(MONDAY_8AM + 3_600_000);
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does not go for a week with nothing in it", async () => {
    seed({
      "users/sam": userDoc({ lastActiveAt: seconds(MONDAY_8AM - 9 * DAY_MS) }),
    });
    await _internals.runSweep(deps);
    expect(weekly()).toHaveLength(0);
    expect(db.data.has("users/sam/settings/emailState")).toBe(false);
  });

  it("does not go to someone who said no to it, or never answered", async () => {
    seed({
      "users/sam": userDoc({
        emailConsent: { weeklyReview: { on: false }, winBack: { ...YES } },
      }),
      "users/ali": { timezone: "Europe/London" },
      ...activeWeek("sam"),
      ...activeWeek("ali"),
    });
    await _internals.runSweep(deps);
    expect(weekly()).toHaveLength(0);
  });

  it("reads the yes again before it sends: a no from a moment ago stops it", async () => {
    deps.getAccount = vi.fn(async (uid) => {
      // Unsubscribed while the run was on its way to them.
      const user = db.data.get(`users/${uid}`);
      db.data.set(`users/${uid}`, {
        ...user,
        emailConsent: {
          ...user.emailConsent,
          weeklyReview: { ...user.emailConsent.weeklyReview, on: false },
        },
      });
      return accounts[uid];
    });
    const outcomes = await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(outcomes["weeklyReview:consent-off"]).toBe(1);
  });

  it.each([
    [
      "an address not verified",
      { email: "sam@example.com", emailVerified: false },
    ],
    ["no address", { email: null, emailVerified: false }],
    [
      "a disabled account",
      { email: "sam@example.com", emailVerified: true, disabled: true },
    ],
  ])("does not go to %s", async (_case, account) => {
    accounts.sam = account;
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does not go to an account being deleted", async () => {
    deps.shouldProceed = vi.fn(async () => false);
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.getAccount).not.toHaveBeenCalled();
  });

  it("does not go to an account whose uid cannot make a working link", async () => {
    seed({ "users/sam.old": userDoc(), ...activeWeek("sam.old") });
    accounts["sam.old"] = accounts.sam;
    const outcomes = await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(outcomes["weeklyReview:no-link"]).toBe(1);
  });

  it("says a planned run marked done by hand, apart from what was saved", async () => {
    seed({
      "users/sam": userDoc({ lastActiveAt: seconds(MONDAY_8AM - 9 * DAY_MS) }),
      "users/sam/programState/current": {
        manualCompletions: {
          r1: { completedAt: seconds(Date.UTC(2026, 10, 12, 18, 0)) },
          // Marked in the week before: not this week's.
          r0: { completedAt: seconds(Date.UTC(2026, 10, 5, 18, 0)) },
        },
      },
    });
    await _internals.runSweep(deps);
    expect(weekly()).toHaveLength(1);
    expect(deps.sendEmail.mock.calls[0][0].text).toContain(
      "You marked 1 planned run done."
    );
    expect(deps.sendEmail.mock.calls[0][0].text).not.toContain("You saved");
  });

  it("does not go without a time zone", async () => {
    seed({ "users/sam": userDoc({ timezone: null }), ...activeWeek("sam") });
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe("when Resend refuses", () => {
  beforeEach(() => {
    seed({
      "users/ali": userDoc(),
      ...activeWeek("ali"),
      "users/sam": userDoc(),
      ...activeWeek("sam"),
    });
  });

  const refusal = (status) =>
    Object.assign(new Error(`Resend send failed (${status})`), { status });

  it("a repeated key means the first went: marked sent, never sent again", async () => {
    deps.sendEmail.mockRejectedValueOnce(refusal(409));
    await _internals.runSweep(deps);
    expect(
      db.data.get("users/ali/settings/emailState").weeklyReview.state
    ).toBe("sent");
  });

  it("too many: lets the claim go and stops the run, to try next hour", async () => {
    deps.sendEmail.mockRejectedValueOnce(refusal(429));
    const outcomes = await _internals.runSweep(deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(outcomes["weeklyReview:stop"]).toBe(1);
    expect(
      db.data.get("users/ali/settings/emailState").weeklyReview
    ).toBeNull();
    deps = makeDeps(MONDAY_8AM + 3_600_000);
    await _internals.runSweep(deps);
    expect(
      weekly()
        .map(([m]) => m.to)
        .sort()
    ).toEqual(["ali@example.com", "sam@example.com"]);
  });

  it("refused for good (a bad address): failed, never tried again", async () => {
    deps.sendEmail.mockRejectedValueOnce(refusal(422));
    await _internals.runSweep(deps);
    expect(
      db.data.get("users/ali/settings/emailState").weeklyReview.state
    ).toBe("failed");
    deps = makeDeps(MONDAY_8AM + 3_600_000);
    await _internals.runSweep(deps);
    expect(weekly().map(([m]) => m.to)).toEqual([]);
  });

  it("no answer: tried again with the same key after an hour, not before", async () => {
    deps.sendEmail.mockRejectedValueOnce(new Error("socket hang up"));
    await _internals.runSweep(deps);
    const first = deps.sendEmail.mock.calls[0][0];
    expect(
      db.data.get("users/ali/settings/emailState").weeklyReview.state
    ).toBe("pending");

    deps = makeDeps(MONDAY_8AM + 30 * 60_000);
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();

    deps = makeDeps(MONDAY_8AM + 60 * 60_000);
    await _internals.runSweep(deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendEmail.mock.calls[0][0].idempotencyKey).toBe(
      first.idempotencyKey
    );
  });

  it("a retry that cannot go keeps the time of its first attempt", async () => {
    deps.sendEmail.mockRejectedValueOnce(new Error("socket hang up"));
    await _internals.runSweep(deps);
    const first = db.data.get("users/ali/settings/emailState").weeklyReview;
    expect(first.state).toBe("pending");
    // An hour on, the allowance is gone: nothing goes, and the record of
    // the first attempt stays.
    budget = 0;
    deps = makeDeps(MONDAY_8AM + 60 * 60_000);
    await _internals.runSweep(deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(db.data.get("users/ali/settings/emailState").weeklyReview).toEqual(
      first
    );
  });

  it("starts each run somewhere new, so the allowance does not always leave out the same people", async () => {
    budget = 1;
    deps.pivot = "m";
    await _internals.runSweep(deps);
    expect(weekly().map(([m]) => m.to)).toEqual(["sam@example.com"]);
    budget = 1;
    deps = makeDeps(MONDAY_8AM + 60 * 60_000);
    await _internals.runSweep(deps);
    expect(weekly().map(([m]) => m.to)).toEqual(["ali@example.com"]);
  });

  it("the day's allowance used up: lets the claim go and stops the run", async () => {
    budget = 1;
    const outcomes = await _internals.runSweep(deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(outcomes["weeklyReview:budget"]).toBe(1);
    expect(
      db.data.get("users/sam/settings/emailState").weeklyReview
    ).toBeNull();
  });
});

describe("the emails after a break", () => {
  /** When the last session was, `days` before Monday, at 18:00. */
  const sessionAt = (days) => MONDAY_8AM - days * DAY_MS + 10 * 3_600_000;
  /** Someone whose last session was `days` ago, at 18:00, who chose only
   *  the emails after a break. */
  function awayFor(days, extra = {}) {
    seed({
      "users/ali": userDoc({
        emailConsent: { winBack: { ...YES } },
        lastActiveAt: seconds(sessionAt(days)),
        ...extra,
      }),
    });
  }
  const sent = () => deps.sendEmail.mock.calls.map(([m]) => m.idempotencyKey);

  it("day 14: the first email, keyed to the break", async () => {
    awayFor(14);
    await _internals.runSweep(deps);
    expect(sent()).toEqual([`winBack/ali/${sessionAt(14)}/14`]);
    expect(deps.sendEmail.mock.calls[0][0].subject).toBe(
      "Your plan is here when you want it"
    );
  });

  it("not before day 14, and a recent session costs no reads", async () => {
    awayFor(13);
    await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
    expect(deps.latestMealMs).not.toHaveBeenCalled();
  });

  it("day 14 goes once, then day 30, then nothing", async () => {
    awayFor(14);
    await _internals.runSweep(deps);
    for (const later of [1, 6, 16, 23]) {
      deps = makeDeps(MONDAY_8AM + later * DAY_MS);
      await _internals.runSweep(deps);
      if (later === 16) {
        expect(sent()).toEqual([`winBack/ali/${sessionAt(14)}/30`]);
        expect(deps.sendEmail.mock.calls[0][0].subject).toBe(
          "Your plan is still here"
        );
      } else {
        expect(sent(), `day ${14 + later}`).toEqual([]);
      }
    }
  });

  it("a meal logged since counts as logging: no email", async () => {
    awayFor(20);
    meals.ali = MONDAY_8AM - 2 * DAY_MS;
    await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
  });

  it("a break measured from the last meal when that is later", async () => {
    awayFor(40);
    meals.ali = MONDAY_8AM - 14 * DAY_MS;
    await _internals.runSweep(deps);
    expect(sent()).toEqual([`winBack/ali/${meals.ali}/14`]);
  });

  it("a planned run marked done by hand since counts as logging", async () => {
    awayFor(20);
    db.data.set("users/ali/programState/current", {
      manualCompletions: {
        r1: { completedAt: seconds(MONDAY_8AM - 3 * DAY_MS) },
      },
    });
    await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
  });

  it("a change of time zone is not a new break: day 14 goes once", async () => {
    // Last session at 23:30 in London on 1 November.
    const last = Date.UTC(2026, 10, 1, 23, 30);
    seed({
      "users/ali": userDoc({
        emailConsent: { winBack: { ...YES } },
        lastActiveAt: seconds(last),
      }),
    });
    deps = makeDeps(Date.UTC(2026, 10, 15, 8, 0));
    await _internals.runSweep(deps);
    expect(sent()).toEqual([`winBack/ali/${last}/14`]);
    // They fly east: in Kolkata the same instant is already 2 November.
    const user = db.data.get("users/ali");
    db.data.set("users/ali", { ...user, timezone: "Asia/Kolkata" });
    deps = makeDeps(Date.UTC(2026, 10, 17, 3, 0));
    await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
  });

  it("nothing for someone who has never logged anything", async () => {
    seed({
      "users/ali": userDoc({ emailConsent: { winBack: { ...YES } } }),
    });
    const outcomes = await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
    expect(outcomes["winBack:never-logged"]).toBe(1);
  });

  it("nothing to someone who said no to it", async () => {
    awayFor(14, {
      emailConsent: { weeklyReview: { ...YES }, winBack: { on: false } },
    });
    await _internals.runSweep(deps);
    expect(sent()).toEqual([]);
  });

  it("a new break after logging again has its own ladder", async () => {
    awayFor(14);
    await _internals.runSweep(deps);
    // Logged on day 16, then away again for 14 days.
    const user = db.data.get("users/ali");
    db.data.set("users/ali", {
      ...user,
      lastActiveAt: seconds(MONDAY_8AM + 2 * DAY_MS),
    });
    deps = makeDeps(MONDAY_8AM + 16 * DAY_MS);
    await _internals.runSweep(deps);
    expect(sent()).toEqual([`winBack/ali/${MONDAY_8AM + 2 * DAY_MS}/14`]);
  });
});

describe("sendFailure", () => {
  it.each([
    [409, "sent"],
    [429, "stop"],
    [400, "failed"],
    [422, "failed"],
    [500, "retry"],
    [undefined, "retry"],
  ])("Resend %s → %s", (status, verdict) => {
    expect(_internals.sendFailure({ status })).toBe(verdict);
  });
});

describe("the daily allowance", () => {
  it("counts each send in the UTC day and refuses past the allowance", async () => {
    db = memoryFirestore();
    const claim = _internals.dailyBudget(db, MONDAY_8AM, 2);
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    const stored = db.data.get("rateLimits/emailUpdates_2026-11-16");
    expect(stored.count).toBe(2);
    expect(stored.expiresAt).toEqual(new Date(Date.UTC(2026, 10, 18)));
  });

  it("is system/config.emailUpdatesPerDay when the owner set one, else 60", async () => {
    const perDay = async (config) =>
      (
        await _internals.emailConfig(
          memoryFirestore(config ? { "system/config": config } : {})
        )
      ).perDay;
    expect(await perDay(null)).toBe(60);
    expect(await perDay({ emailUpdatesPerDay: 900 })).toBe(900);
    expect(await perDay({ emailUpdatesPerDay: "lots" })).toBe(60);
  });
});

describe("the sender's postal address (CAN-SPAM)", () => {
  it("is read from system/config.emailPostalAddress, and none without it", async () => {
    expect(
      (await _internals.emailConfig(memoryFirestore())).postalAddress
    ).toBeNull();
    expect(
      (
        await _internals.emailConfig(
          memoryFirestore({
            "system/config": { emailPostalAddress: " 1 High Street, London " },
          })
        )
      ).postalAddress
    ).toBe("1 High Street, London");
  });

  it("goes in every email's footer once set", async () => {
    deps.postalAddress = "1 High Street, London";
    await _internals.runSweep(deps);
    const [message] = deps.sendEmail.mock.calls[0];
    expect(message.text).toContain(
      "Sent by Tropos, 1 High Street, London. Questions: support@troposfit.com"
    );
    expect(message.html).toContain("Sent by Tropos, 1 High Street, London.");
  });
});
