/**
 * The unsubscribe link in every email a person chose (App1 Q55). Opening
 * it changes nothing (mail scanners open links); its one button, or a mail
 * app's own Unsubscribe (RFC 8058), turns both emails off, recorded as
 * withdrawn through the link with the server's time. A link that is not the
 * account's changes nothing and names no one. The page is never cached or
 * indexed and loads nothing from anywhere.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "demo-tropos";

const admin = require("../lib/adminSdk");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const unsub = require("../lib/emailUnsubscribe");
const { emailUnsubscribe } = require("../index");

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const UID = "abcDEF123";
const TOKEN = "A".repeat(42) + "b";
const YES = { on: true, givenAt: "SETUP", givenVia: "setup", wording: 1 };

function seed() {
  return memoryFirestore({
    [`users/${UID}`]: {
      uid: UID,
      emailConsent: { weeklyReview: { ...YES }, winBack: { ...YES } },
    },
    [`users/${UID}/settings/emailState`]: { unsubscribeToken: TOKEN },
  });
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) {
      if (typeof name === "object") Object.assign(res.headers, name);
      else res.headers[name] = value;
      return res;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    send(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

let db;
async function ask(method, query) {
  const res = makeRes();
  await emailUnsubscribe({ method, query }, res);
  return res;
}

beforeEach(() => {
  db = seed();
  Object.defineProperty(admin, "firestore", {
    value: Object.assign(() => db, admin.firestore, {
      FieldValue: { serverTimestamp: () => "SERVER_TS" },
    }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  delete admin.firestore;
});

describe("the unsubscribe link", () => {
  it("opened, asks with one button and changes nothing", async () => {
    const res = await ask("GET", { u: UID, t: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Stop emails from Tropos?");
    expect(res.body).toContain('<form method="post"');
    expect(res.body).toContain(`action="?u=${UID}&amp;t=${TOKEN}"`);
    expect(db.data.get(`users/${UID}`).emailConsent.weeklyReview.on).toBe(true);
  });

  it("its button turns both emails off, through the link, with the server's time", async () => {
    const res = await ask("POST", { u: UID, t: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("You’re unsubscribed");
    const consent = db.data.get(`users/${UID}`).emailConsent;
    for (const kind of ["weeklyReview", "winBack"]) {
      expect(consent[kind]).toEqual({
        ...YES,
        on: false,
        withdrawnAt: "SERVER_TS",
        withdrawnVia: "unsubscribe",
      });
    }
  });

  it("works from a mail app's one-click POST, with no cookie or sign-in", async () => {
    const res = makeRes();
    await emailUnsubscribe(
      {
        method: "POST",
        query: { u: UID, t: TOKEN },
        body: "List-Unsubscribe=One-Click",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      },
      res
    );
    expect(res.statusCode).toBe(200);
    expect(db.data.get(`users/${UID}`).emailConsent.winBack.on).toBe(false);
  });

  it("a second tap keeps the time of the first", async () => {
    await ask("POST", { u: UID, t: TOKEN });
    const first = structuredClone(db.data.get(`users/${UID}`).emailConsent);
    await ask("POST", { u: UID, t: TOKEN });
    expect(db.data.get(`users/${UID}`).emailConsent).toEqual(first);
  });

  it.each([
    ["a wrong token", { u: UID, t: "B".repeat(43) }],
    ["another account's uid", { u: "someoneElse1", t: TOKEN }],
    ["no token", { u: UID }],
    ["a token of the wrong shape", { u: UID, t: "short" }],
    ["a uid of the wrong shape", { u: "../users", t: TOKEN }],
  ])("with %s, changes nothing and names no one", async (_case, query) => {
    for (const method of ["GET", "POST"]) {
      const res = await ask(method, query);
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain("This link doesn’t work");
      expect(res.body).not.toContain(UID);
    }
    expect(db.data.get(`users/${UID}`).emailConsent.weeklyReview.on).toBe(true);
  });

  it("refuses anything but reading and the button", async () => {
    const res = await ask("DELETE", { u: UID, t: TOKEN });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe("GET, HEAD, POST");
  });

  it("is never cached or indexed, sends no Referer and loads nothing", async () => {
    const res = await ask("GET", { u: UID, t: TOKEN });
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(res.headers["Referrer-Policy"]).toBe("no-referrer");
    expect(res.headers["Content-Security-Policy"]).toContain(
      "default-src 'none'"
    );
    expect(res.headers["X-Frame-Options"]).toBe("DENY");
    expect(res.body).not.toMatch(/<script|<img|<link|https?:\/\//i);
  });
});

describe("the token", () => {
  it("is 32 random bytes, base64url", () => {
    const a = unsub.newUnsubscribeToken();
    const b = unsub.newUnsubscribeToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("is compared whole", () => {
    expect(unsub.tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(unsub.tokensMatch(TOKEN, TOKEN.slice(0, 42))).toBe(false);
    expect(unsub.tokensMatch(undefined, TOKEN)).toBe(false);
  });
});

describe("Hosting sends the link's address to the function", () => {
  it("before the app's catch-all", () => {
    const { rewrites } = JSON.parse(
      readFileSync(resolve(repoRoot, "firebase.json"), "utf8")
    ).hosting;
    const index = rewrites.findIndex(
      (rule) => rule.source === "/email/unsubscribe"
    );
    expect(rewrites[index]).toEqual({
      source: "/email/unsubscribe",
      function: { functionId: "emailUnsubscribe", region: "us-central1" },
    });
    expect(index).toBeLessThan(
      rewrites.findIndex((rule) => rule.source === "**")
    );
  });
});
