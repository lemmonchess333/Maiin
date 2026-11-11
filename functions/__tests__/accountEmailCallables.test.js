/**
 * The two account-email callables, driven through their real handlers
 * (`.run`) against the in-memory Firestore, with Auth and Resend stubbed.
 *
 * sendPasswordResetLinkCallable is the one anyone can call: the person is
 * signed out. What it must hold, whoever is calling:
 *   - an address is read in time proportional to its length, so a long
 *     string built to make a pattern backtrack costs nothing;
 *   - once an address is accepted, the reply is the same whether or not it
 *     has an account and whether or not the email went, so the reply cannot
 *     be used to find out which addresses have accounts;
 *   - one address gets at most 3 reset emails a day, and the project sends
 *     at most PASSWORD_RESET_SENDS_PER_DAY, counting only emails sent.
 *
 * sendVerificationEmailCallable sends one account at most 3 in 10 minutes
 * and 5 a day: someone can sign up with an address that is not theirs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const {
  sendPasswordResetLinkCallable,
  sendVerificationEmailCallable,
} = require("../email/accountEmails");
const {
  PASSWORD_RESET_SEND_CAP,
  PASSWORD_RESET_SENDS_PER_DAY,
} = require("../lib/passwordResetRequest");

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.UTC(2026, 10, 1, 9, 0);

let db;
let auth;
let fetchMock;

beforeEach(() => {
  db = memoryFirestore();
  Object.defineProperty(admin, "firestore", {
    value: Object.assign(() => db, admin.firestore, {
      FieldValue: { serverTimestamp: () => "SERVER_TS" },
    }),
    configurable: true,
    writable: true,
  });
  auth = {
    accounts: new Set(["alice@example.com"]),
    generatePasswordResetLink: vi.fn(async (email) => {
      if (!auth.accounts.has(email.toLowerCase())) {
        throw new Error(
          "There is no user record corresponding to the provided email. (auth/email-not-found)"
        );
      }
      return `https://tropos.example/reset?for=${encodeURIComponent(email)}`;
    }),
    getUser: vi.fn(async (uid) => ({
      uid,
      email: "newbie@example.com",
      emailVerified: false,
    })),
    generateEmailVerificationLink: vi.fn(
      async () => "https://tropos.example/verify"
    ),
  };
  Object.defineProperty(admin, "auth", {
    value: () => auth,
    configurable: true,
    writable: true,
  });
  fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete admin.firestore;
  delete admin.auth;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const reset = (email) => sendPasswordResetLinkCallable.run({ email }, {});

describe("sendPasswordResetLinkCallable — reading the address", () => {
  it("refuses a 400 KB string built to backtrack, at once and before any work", async () => {
    // "a@" then "a." 200,000 times then "@": an overlapping pattern tries
    // every split of the dotted run, which takes minutes at this length.
    const crafted = `a@${"a.".repeat(200_000)}@`;
    const started = performance.now();
    await expect(reset(crafted)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    // Generous, so a slow runner cannot flake it: the length check makes
    // this a few milliseconds, the old pattern made it minutes.
    expect(performance.now() - started).toBeLessThan(2_000);
    // Refused before the limiter wrote anything or a link was asked for.
    expect(db.data.size).toBe(0);
    expect(auth.generatePasswordResetLink).not.toHaveBeenCalled();
  });

  it("refuses an address longer than 254 characters", async () => {
    const long = `${"a".repeat(64)}@${"b".repeat(186)}.com`; // 255
    expect(long).toHaveLength(255);
    await expect(reset(long)).rejects.toMatchObject({
      code: "invalid-argument",
    });
    expect(db.data.size).toBe(0);
  });

  it.each(["", "   ", "alice", "alice@", "@example.com", "a@b", "a b@c.com"])(
    "refuses %j as before",
    async (email) => {
      await expect(reset(email)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    }
  );

  it("refuses a missing or non-string email", async () => {
    await expect(
      sendPasswordResetLinkCallable.run({}, {})
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(
      sendPasswordResetLinkCallable.run({ email: 42 }, {})
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it.each([
    "alice@example.com",
    "  alice@example.com  ",
    "first.last+tag@mail.example.co.uk",
  ])("accepts %j and sends the link as before", async (email) => {
    auth.accounts.add("first.last+tag@mail.example.co.uk");
    await expect(reset(email)).resolves.toEqual({ ok: true });
    expect(auth.generatePasswordResetLink).toHaveBeenCalledWith(email.trim());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("sendPasswordResetLinkCallable — the reply says nothing about accounts", () => {
  // What is logged is pinned in passwordResetRequest.test.js, where the
  // logger can be handed in.
  const resendRefuses = () =>
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        "You can only send testing emails to your own address (alice@example.com).",
    });

  it("replies { ok: true } and sends the link for an address with an account", async () => {
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe("alice@example.com");
  });

  it("replies { ok: true } and sends nothing for an address with no account", async () => {
    await expect(reset("nobody@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replies { ok: true } when only the send fails", async () => {
    resendRefuses();
    // Before: INTERNAL "Couldn't send the reset email", which only an
    // address with an account could produce.
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("replies { ok: true } when no link can be made for the account", async () => {
    // A disabled account exists; saying so is the same leak.
    auth.generatePasswordResetLink.mockRejectedValueOnce(
      new Error("The user record is disabled. (auth/user-disabled)")
    );
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(auth.generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives one reply for all of them", async () => {
    const replies = [];
    replies.push(await reset("alice@example.com"));
    replies.push(await reset("nobody@example.com"));
    resendRefuses();
    replies.push(await reset("alice@example.com"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Set(replies.map((r) => JSON.stringify(r))).size).toBe(1);
  });
});

/** Move the clock the limiter reads; nothing else is faked. */
function at(ms) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(ms);
}

describe("sendPasswordResetLinkCallable — limits per address", () => {
  it("sends one address 3 resets a day, then refuses until the first is a day old", async () => {
    for (const minutes of [0, 6, 12]) {
      at(T0 + minutes * MINUTE);
      await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    }
    // Past the 5-minute window, so only the day refuses. Before: sent.
    at(T0 + 18 * MINUTE);
    await expect(reset("alice@example.com")).rejects.toMatchObject({
      code: "resource-exhausted",
      message:
        "Too many reset requests for this address today. Try again tomorrow.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The window rolls: a day after the first, one more is allowed.
    at(T0 + DAY + MINUTE);
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("limits an address with no account the same way, so the limit says nothing either", async () => {
    for (const minutes of [0, 6, 12]) {
      at(T0 + minutes * MINUTE);
      await reset("nobody@example.com");
    }
    at(T0 + 18 * MINUTE);
    await expect(reset("nobody@example.com")).rejects.toMatchObject({
      code: "resource-exhausted",
    });
  });

  it("counts each address on its own", async () => {
    for (const minutes of [0, 6, 12, 18]) {
      at(T0 + minutes * MINUTE);
      await reset("alice@example.com").catch(() => {});
    }
    auth.accounts.add("bob@example.com");
    await expect(reset("bob@example.com")).resolves.toEqual({ ok: true });
  });
});

describe("sendPasswordResetLinkCallable — the project's daily cap on sends", () => {
  const capPath = `rateLimits/${PASSWORD_RESET_SEND_CAP.key}_${PASSWORD_RESET_SEND_CAP.action}`;
  const seedSends = (sentAt) =>
    db.data.set(capPath, {
      timestamps: Array.from(
        { length: PASSWORD_RESET_SENDS_PER_DAY },
        () => sentAt
      ),
    });

  it("is 500 sends a rolling day", () => {
    expect(PASSWORD_RESET_SENDS_PER_DAY).toBe(500);
    expect(PASSWORD_RESET_SEND_CAP.windowMs).toBe(DAY);
  });

  it("sends nothing once the day's sends are used, and replies the same", async () => {
    at(T0);
    seedSends(T0 - 60 * MINUTE);
    // Before: sent regardless.
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends again once those sends are a day old", async () => {
    at(T0);
    seedSends(T0 - DAY - MINUTE);
    await expect(reset("alice@example.com")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts only emails sent, not requests for addresses with no account", async () => {
    at(T0);
    for (const email of ["x@example.com", "y@example.com", "z@example.com"]) {
      await reset(email);
    }
    expect(db.data.has(capPath)).toBe(false);
    await reset("alice@example.com");
    expect(db.data.get(capPath).timestamps).toEqual([T0]);
  });
});

describe("sendVerificationEmailCallable — limits per account", () => {
  const verify = () =>
    sendVerificationEmailCallable.run({}, { auth: { uid: "newbie" } });

  it("sends 3 in 10 minutes, then asks for a few minutes", async () => {
    for (const minutes of [0, 1, 2]) {
      at(T0 + minutes * MINUTE);
      await expect(verify()).resolves.toEqual({ ok: true });
    }
    at(T0 + 3 * MINUTE);
    await expect(verify()).rejects.toMatchObject({
      code: "resource-exhausted",
      message: "Too many requests. Try again in a few minutes.",
    });
  });

  it("sends 5 a day, a burst refused on the way not counted, then refuses until the first is a day old", async () => {
    for (const minutes of [0, 1, 2]) {
      at(T0 + minutes * MINUTE);
      await verify();
    }
    // Refused by the 10-minute window; it must not spend the day's five.
    at(T0 + 3 * MINUTE);
    await expect(verify()).rejects.toMatchObject({
      message: "Too many requests. Try again in a few minutes.",
    });
    for (const minutes of [11, 12]) {
      at(T0 + minutes * MINUTE);
      await expect(verify()).resolves.toEqual({ ok: true });
    }
    // Past the 10-minute window, so only the day refuses. Before: sent.
    at(T0 + 25 * MINUTE);
    await expect(verify()).rejects.toMatchObject({
      code: "resource-exhausted",
      message: "Too many requests today. Try again tomorrow.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    at(T0 + DAY + MINUTE);
    await expect(verify()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});
