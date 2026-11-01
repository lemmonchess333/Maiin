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
 *     be used to find out which addresses have accounts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("firebase-admin");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { sendPasswordResetLinkCallable } = require("../email/accountEmails");

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
