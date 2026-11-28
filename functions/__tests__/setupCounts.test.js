/**
 * Setup counts (lib/setupCounts.js): a day's totals of the welcome shown,
 * setup started and accounts made, with no identifier. The handler reads
 * the step and nothing else, answers alike whether it counted or not, and
 * an instance stops counting past its own allowance.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { memoryFirestore, increment } = require("./helpers/memoryFirestore.cjs");
const {
  CLIENT_STEPS,
  STEPS,
  KEEP_DAYS,
  dayKey,
  setupCountsExpiresAt,
  readStep,
  stepAllowance,
  addSetupCount,
  serveSetupCount,
} = require("../lib/setupCounts");

const FieldValue = { increment, serverTimestamp: () => "now" };
const NOW = Date.now();
const TODAY = dayKey(NOW);

function response() {
  const res = { statusCode: 0, ended: false };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.end = () => {
    res.ended = true;
    return res;
  };
  return res;
}

let db;
beforeEach(() => {
  db = memoryFirestore();
});

describe("addSetupCount", () => {
  it("adds one to the step on the server's UTC day, and keeps nothing else", async () => {
    await addSetupCount({ db, FieldValue, step: "welcome_viewed", nowMs: NOW });
    await addSetupCount({ db, FieldValue, step: "welcome_viewed", nowMs: NOW });
    await addSetupCount({ db, FieldValue, step: "setup_started", nowMs: NOW });
    const day = db.data.get(`setupCounts/${TODAY}`);
    expect(day).toEqual({
      welcome_viewed: 2,
      setup_started: 1,
      updatedAt: "now",
      expiresAt: setupCountsExpiresAt(TODAY),
    });
  });

  it("refuses a step it does not know", async () => {
    await expect(
      addSetupCount({ db, FieldValue, step: "uid", nowMs: NOW })
    ).rejects.toThrow();
  });

  it("keeps a day about 13 months from when it starts", () => {
    const start = Date.UTC(2026, 10, 23);
    expect(setupCountsExpiresAt("2026-11-23").getTime()).toBe(
      start + KEEP_DAYS * 86400000
    );
    expect(KEEP_DAYS).toBeGreaterThanOrEqual(366);
  });
});

describe("readStep", () => {
  it("reads only a step the app may send", () => {
    for (const step of CLIENT_STEPS) expect(readStep({ step })).toBe(step);
    expect(readStep(JSON.stringify({ step: "setup_started" }))).toBe(
      "setup_started"
    );
    // The server's own step is not the app's to send.
    expect(readStep({ step: "account_created" })).toBeNull();
    expect(readStep({ step: "anything" })).toBeNull();
    expect(readStep("not json")).toBeNull();
    expect(readStep(undefined)).toBeNull();
    expect(STEPS).toContain("account_created");
  });
});

describe("serveSetupCount", () => {
  const serve = (req, allow = () => true) => {
    const res = response();
    return serveSetupCount(req, res, {
      db,
      FieldValue,
      allow,
      now: () => NOW,
    }).then(() => res);
  };

  it("counts a POST naming a step and answers 204", async () => {
    const res = await serve({ method: "POST", body: { step: "setup_started" } });
    expect(res.statusCode).toBe(204);
    expect(db.data.get(`setupCounts/${TODAY}`).setup_started).toBe(1);
  });

  it("answers 204 past the allowance, and counts nothing", async () => {
    const res = await serve(
      { method: "POST", body: { step: "setup_started" } },
      () => false
    );
    expect(res.statusCode).toBe(204);
    expect(db.data.has(`setupCounts/${TODAY}`)).toBe(false);
  });

  it("refuses anything but a POST naming a step", async () => {
    expect((await serve({ method: "GET" })).statusCode).toBe(405);
    expect(
      (await serve({ method: "POST", body: { step: "x" } })).statusCode
    ).toBe(400);
    expect(db.data.size).toBe(0);
  });

  it("reads no header, address or cookie from the request", async () => {
    const touched = [];
    const req = new Proxy(
      { method: "POST", body: { step: "welcome_viewed" } },
      {
        get(target, key) {
          if (typeof key === "string") touched.push(key);
          return target[key];
        },
      }
    );
    await serve(req);
    expect([...new Set(touched)].sort()).toEqual(["body", "method"]);
  });
});

describe("stepAllowance", () => {
  it("stops at the minute's allowance and starts again the next minute", () => {
    const allow = stepAllowance({ perMinute: 2, perDay: 100 });
    const t = Date.UTC(2026, 10, 23, 10, 0, 0);
    expect([allow(t), allow(t + 1), allow(t + 2)]).toEqual([true, true, false]);
    expect(allow(t + 60000)).toBe(true);
  });

  it("stops at the day's allowance and starts again the next UTC day", () => {
    const allow = stepAllowance({ perMinute: 100, perDay: 2 });
    const t = Date.UTC(2026, 10, 23, 10, 0, 0);
    expect([allow(t), allow(t + 60000), allow(t + 120000)]).toEqual([
      true,
      true,
      false,
    ]);
    expect(allow(Date.UTC(2026, 10, 24, 0, 0, 1))).toBe(true);
  });
});

describe("wiring", () => {
  const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");

  it("counts an account where Auth makes it, never throwing into the retry", () => {
    const trigger = index.slice(
      index.indexOf("exports.onAuthUserCreated"),
      index.indexOf("// SOCIAL COUNTERS")
    );
    expect(trigger).toMatch(/step: "account_created"/);
    expect(trigger).toMatch(/try \{\s*await setupCounts\.addSetupCount/);
  });

  it("the rules refuse every client read and write of the counts", () => {
    const rules = readFileSync(
      new URL("../../firestore.rules", import.meta.url),
      "utf8"
    );
    expect(rules).toMatch(
      /match \/setupCounts\/\{dateKey\} \{\s*allow read, write: if false;\s*\}/
    );
  });

  it("a TTL policy deletes a day", () => {
    const indexes = JSON.parse(
      readFileSync(
        new URL("../../firestore.indexes.json", import.meta.url),
        "utf8"
      )
    );
    expect(indexes.fieldOverrides).toContainEqual({
      collectionGroup: "setupCounts",
      fieldPath: "expiresAt",
      ttl: true,
      indexes: [],
    });
  });
});
