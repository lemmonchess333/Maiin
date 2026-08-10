/**
 * The deletion sweep must cover every subcollection the app writes.
 *
 * A Firestore document delete does NOT cascade. Anything missing from
 * `USER_SUBCOLLECTIONS` outlives the account it belonged to — for ever,
 * and silently, because the executor reports success either way. That is
 * a right-to-erasure failure, not a tidiness one.
 *
 * WHY THIS DERIVES INSTEAD OF LISTING. The existing drift guard in
 * accountDeletion.test.js reads:
 *
 *     for (const sub of USER_SUBCOLLECTIONS)
 *       expect(calls).toContain(`firestore.users.${uid}.${sub}.get`)
 *
 * which takes its expectation FROM the constant under test. It proves the
 * loop iterates its own input. It cannot detect a collection that is
 * missing from the list, which is the only failure that matters here —
 * exactly the tautology CLAUDE.md describes as "pinning consistency, not
 * behaviour". On 2026-08-10 it was passing while the list swept five
 * names that were never collections (`weights`, `water`, `bodyweight`,
 * `favorites`, `preferences` — CSV export keys and analytics labels) and
 * missed THIRTEEN real ones, `privacyZones` among them: the GPS circles a
 * user draws around home and work.
 *
 * So this reads the paths the app actually writes and compares. The
 * expectation comes from a different place than the value, which is the
 * whole point.
 *
 * Known limit, stated rather than hidden: the scan is textual, so a path
 * assembled from a variable segment is invisible to it. It catches the
 * literal form every call site in this repo currently uses, and it fails
 * loudly if that set grows — which is the drift that actually happened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { USER_SUBCOLLECTIONS } = require("../accountDeletion");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Names that are NOT subcollections of users/{uid}, but which the textual
 * patterns below can pick up. Each needs a reason, because an unexplained
 * exclusion is how a real collection gets quietly dropped.
 */
const NOT_A_USER_SUBCOLLECTION = {
  // `users/${uid}/…` nested deeper — the regex sees the segment after a
  // second `users/` in a composed path, never a real child of the user doc.
  users: "path-composition artifact, not a child collection",
  // TOP-LEVEL `scanUsage/{uid}`, keyed BY uid rather than nested under it.
  // Still user-owned data and still had to be deleted — it is handled as a
  // top-level doc in the executor, not by this sweep.
  scanUsage: "top-level collection keyed by uid; deleted separately",
};

function sourceFiles() {
  return [
    ...globSync("src/**/*.{ts,tsx}", { cwd: ROOT }),
    ...globSync("functions/**/*.js", { cwd: ROOT }),
  ].filter((f) => !f.includes("node_modules") && !f.includes("__tests__"));
}

/** Every `users/{uid}/NAME` the source writes, in any of the three forms. */
function observedSubcollections() {
  const found = new Map();
  const files = sourceFiles();
  // Guard the guard — a glob that matched nothing would make this vacuous.
  expect(files.length).toBeGreaterThan(200);

  for (const file of files) {
    const src = readFileSync(resolve(ROOT, file), "utf8");
    const patterns = [
      // client SDK: collection(db, "users", uid, "NAME") / doc(db, …)
      /(?:collection|doc)\(\s*db\s*,\s*"users"\s*,\s*[^,]+,\s*"([A-Za-z]\w*)"/g,
      // admin SDK: .collection("users").doc(uid).collection("NAME")
      /collection\(\s*["']users["']\s*\)[\s\S]{0,80}?\.collection\(\s*["']([A-Za-z]\w*)["']/g,
      // template path: `users/${uid}/NAME/…`
      /users\/\$\{[^}]+\}\/([A-Za-z]\w*)/g,
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        if (!found.has(m[1])) found.set(m[1], new Set());
        found.get(m[1]).add(file);
      }
    }
  }
  for (const name of Object.keys(NOT_A_USER_SUBCOLLECTION)) found.delete(name);
  return found;
}

describe("account deletion covers every user subcollection", () => {
  it("sweeps every subcollection the app writes", () => {
    const observed = observedSubcollections();
    const swept = new Set(USER_SUBCOLLECTIONS);
    const missing = [...observed.keys()]
      .filter((name) => !swept.has(name))
      .map((name) => `${name}  (written by ${[...observed.get(name)][0]})`);

    expect(
      missing,
      `These subcollections are written by the app but NOT deleted with the account. A document delete does not cascade, so each one outlives the user for ever. Add them to USER_SUBCOLLECTIONS in functions/accountDeletion.js — or, if a name here is genuinely not a child of users/{uid}, add it to NOT_A_USER_SUBCOLLECTION with a reason.\n${missing.join("\n")}`
    ).toEqual([]);
  });

  it("finds a realistic number of subcollections", () => {
    /* If the patterns ever stop matching — a refactor to a path helper,
       say — `missing` goes empty and the test above passes for the worst
       possible reason. This is the anchor that makes it non-vacuous. */
    expect(observedSubcollections().size).toBeGreaterThan(15);
  });

  it("does not sweep names that no writer produces", () => {
    /* The other half of the drift. Five phantom entries had accumulated,
       each costing an empty query per deletion and, worse, making the
       list read as authoritative when it was not. `devices` is exempt: it
       is server-owned, the client deliberately stopped writing it (see
       src/lib/pushNotifications.ts), so it appears in no source path. */
    const observed = observedSubcollections();
    const phantom = USER_SUBCOLLECTIONS.filter(
      (name) => name !== "devices" && !observed.has(name)
    );
    expect(
      phantom,
      `USER_SUBCOLLECTIONS names collections nothing writes: ${phantom.join(", ")}. Either the name is wrong (the real one is still orphaning) or the collection is gone and the entry is dead weight.`
    ).toEqual([]);
  });
});
