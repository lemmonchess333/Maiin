/**
 * SOCIAL S3 (Soc7) — partner-streak server persist tests.
 *
 * Pins the trigger-driven `applyPartnerActivity`:
 *   - advances each bond the user is a member of, inside a transaction;
 *   - is idempotent on a same-day re-log (no second write);
 *   - skips a no-op bank (member already logged that day);
 *   - resolves the local day from the activity date or the user timezone;
 *   - is called by onRunCreated only for a run that counts.
 *
 * The engine correctness itself (counting / freeze / DST) is pinned by the
 * cross-check test in src; here we pin the Firestore orchestration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  applyPartnerActivity,
  resolvePartnerActivityDay,
} = require("../lib/partnerStreakPersist");

/**
 * Firestore stub: `collection("partnerBonds").where(...).get()` returns the
 * seeded bonds; `runTransaction` exposes get/set against the same in-memory
 * docs. `collection("users").doc(uid).get()` serves the timezone read.
 */
function makeFirestoreStub({ bonds = {}, users = {} } = {}) {
  const writes = [];
  const docs = { ...bonds };

  function bondRef(id) {
    return { _path: `partnerBonds/${id}`, id };
  }

  return {
    collection(name) {
      if (name === "partnerBonds") {
        return {
          where() {
            return {
              async get() {
                return {
                  empty: Object.keys(docs).length === 0,
                  docs: Object.keys(docs).map((id) => ({
                    id,
                    ref: bondRef(id),
                  })),
                };
              },
            };
          },
        };
      }
      if (name === "users") {
        return {
          doc(uid) {
            return {
              async get() {
                return { data: () => users[uid] };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    runTransaction: vi.fn(async (cb) => {
      const txn = {
        get: vi.fn(async (ref) => {
          const id = ref.id;
          const data = docs[id];
          return { exists: data !== undefined, data: () => data };
        }),
        set: vi.fn((ref, data, opts) => {
          const id = ref.id;
          writes.push({ id, data, opts });
          docs[id] = { ...(docs[id] || {}), ...data };
        }),
      };
      return cb(txn);
    }),
    _writes: writes,
    _docs: docs,
  };
}

const coldBond = (members) => ({
  members,
  streak: 0,
  lastSharedDay: null,
  lastActive: {},
  freezeWeek: {},
});

beforeEach(() => vi.clearAllMocks());

describe("applyPartnerActivity", () => {
  it("no-ops on a falsy localDay (never writes)", async () => {
    const fs = makeFirestoreStub({
      bonds: { a__b: coldBond(["a", "b"]) },
    });
    await applyPartnerActivity(fs, "a", null);
    expect(fs.runTransaction).not.toHaveBeenCalled();
    expect(fs._writes).toHaveLength(0);
  });

  it("banks the first member's day (writes lastActive, streak stays 0)", async () => {
    const fs = makeFirestoreStub({ bonds: { a__b: coldBond(["a", "b"]) } });
    await applyPartnerActivity(fs, "a", "2026-06-10");
    expect(fs._writes).toHaveLength(1);
    expect(fs._docs["a__b"].lastActive).toEqual({ a: "2026-06-10" });
    expect(fs._docs["a__b"].streak).toBe(0);
  });

  it("counts the shared day when the second partner logs", async () => {
    const fs = makeFirestoreStub({
      bonds: {
        a__b: {
          members: ["a", "b"],
          streak: 0,
          lastSharedDay: null,
          lastActive: { a: "2026-06-10" },
          freezeWeek: {},
        },
      },
    });
    await applyPartnerActivity(fs, "b", "2026-06-10");
    expect(fs._docs["a__b"].streak).toBe(1);
    expect(fs._docs["a__b"].lastSharedDay).toBe("2026-06-10");
  });

  it("is idempotent on a same-day re-log (no second write)", async () => {
    const fs = makeFirestoreStub({ bonds: { a__b: coldBond(["a", "b"]) } });
    await applyPartnerActivity(fs, "a", "2026-06-10"); // banks → 1 write
    await applyPartnerActivity(fs, "a", "2026-06-10"); // no-op → no write
    expect(fs._writes).toHaveLength(1);
  });

  it("advances every bond the user is a member of", async () => {
    const fs = makeFirestoreStub({
      bonds: {
        a__b: coldBond(["a", "b"]),
        a__c: coldBond(["a", "c"]),
      },
    });
    await applyPartnerActivity(fs, "a", "2026-06-10");
    expect(fs._docs["a__b"].lastActive).toEqual({ a: "2026-06-10" });
    expect(fs._docs["a__c"].lastActive).toEqual({ a: "2026-06-10" });
    expect(fs._writes).toHaveLength(2);
  });

  it("skips a bond doc with a malformed members array", async () => {
    const fs = makeFirestoreStub({
      bonds: { bad: { members: ["only-one"], streak: 0 } },
    });
    await applyPartnerActivity(fs, "only-one", "2026-06-10");
    expect(fs._writes).toHaveLength(0);
  });
});

describe("resolvePartnerActivityDay", () => {
  it("prefers the activity's own date", async () => {
    const fs = makeFirestoreStub();
    expect(await resolvePartnerActivityDay(fs, "a", "2026-06-10")).toBe(
      "2026-06-10"
    );
  });

  it("falls back to the user timezone-derived day", async () => {
    const fs = makeFirestoreStub({
      users: { a: { timezone: "Pacific/Kiritimati" } },
    });
    const day = await resolvePartnerActivityDay(fs, "a", undefined);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null when no date and no timezone (no UTC fallback)", async () => {
    const fs = makeFirestoreStub({ users: { a: {} } });
    expect(await resolvePartnerActivityDay(fs, "a", undefined)).toBeNull();
  });
});

/** The `{ … }` block whose opening brace is at `open`, through its closing
 *  brace. Braces in strings and comments are not counted. */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") i = src.indexOf("\n", i);
    else if (c === "/" && src[i + 1] === "*") i = src.indexOf("*/", i) + 1;
    else if (c === '"' || c === "'" || c === "`") {
      for (i++; src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unclosed block");
}

/**
 * The trigger side. Every test above drives applyPartnerActivity itself, so
 * all of them stay green if onRunCreated calls it outside its eligibility
 * gate, and an isInvalid, savedAnyway or sub-threshold run would then keep a
 * streak alive. Source-level, as performanceEngine.test.js pins its call
 * sites: the trigger needs the Admin SDK and a database to run.
 */
describe("onRunCreated — an ineligible run does not count", () => {
  const INDEX = readFileSync(new URL("../index.js", import.meta.url), "utf8");
  const start = INDEX.indexOf("exports.onRunCreated = functions");
  const TRIGGER = INDEX.slice(start, INDEX.indexOf("\nexports.", start + 1));

  it("decides with the shared volume-eligibility predicate", () => {
    expect(start).toBeGreaterThan(-1);
    expect(INDEX).toContain(
      'const { isVolumeEligibleRun } = require("./lib/runEligibility");'
    );
    expect(TRIGGER).toContain("const isCountable = isVolumeEligibleRun(data);");
  });

  it("advances the bond once, inside the isCountable block", () => {
    expect(TRIGGER.match(/applyPartnerActivity\(/g)).toHaveLength(1);
    const gate = TRIGGER.indexOf("if (isCountable) {");
    expect(gate).toBeGreaterThan(-1);
    const counted = blockAt(TRIGGER, TRIGGER.indexOf("{", gate));
    expect(counted).toContain(
      "await applyPartnerActivity(db, uid, runStreakDay);"
    );
  });
});
