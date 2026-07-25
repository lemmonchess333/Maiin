/**
 * users/{uid} profile writes, against the real rules engine.
 *
 * `profileFieldRegistry.test.ts` pins the field LISTS equal to each other.
 * This pins what those lists MEAN: that the document the app actually sends
 * is accepted, and that the fields a client must never write are refused.
 *
 * The distinction matters because list-equality can be perfectly satisfied
 * while the app is broken — for a year the registry, rules and sanitiser all
 * agreed with each other, and none of them agreed with `createDefaultProfile`,
 * which emits `timezone: null` on every signup. `create` gates with
 * `hasOnly()`, so that one unlisted key rejects the WHOLE document rather
 * than dropping the field.
 *
 * Run: `npm run test:rules`. Skipped when FIRESTORE_EMULATOR_HOST is unset,
 * so a plain `npm test` still passes — and a hard failure when CI sets
 * REQUIRE_FIRESTORE_EMULATOR=1, so the skip can never quietly become the
 * normal case on a deployment branch. Same guard as firestore.rules.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import {
  PROFILE_FIELD_REGISTRY,
  CLIENT_WRITABLE_PROFILE_FIELDS,
} from "./src/lib/profileFieldRegistry";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.REQUIRE_FIRESTORE_EMULATOR === "1" && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1. " +
      "Start the Firestore emulator before running this test."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

let env: RulesTestEnvironment;

beforeAll(async () => {
  if (!EMULATOR_HOST) return;
  env = await initializeTestEnvironment({
    projectId: "demo-tropos",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env?.clearFirestore();
});

/**
 * The exact document `writeNewProfileDocs` sends at signup — kept in step
 * with `createDefaultProfile` in src/lib/auth.tsx. `createdAt` is a
 * serverTimestamp there; a literal stands in, since the rule checks keys.
 */
function signupProfile(uid: string) {
  return {
    uid,
    displayName: "",
    email: "m@example.com",
    photoURL: null,
    athleteType: "Lifter",
    weightKg: 70,
    heightCm: 170,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 10,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    darkMode: true,
    hideWeightNumber: false,
    timezone: null,
    onboardingComplete: false,
    trialExpiresAt: null,
    subscriptionTier: "free",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    adjustCaloriesForTraining: true,
    program: { goal: "recomp", startWeight: 70, currentPhase: "base" },
    createdAt: new Date(),
  };
}

async function seedProfile(uid: string) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `users/${uid}`), signupProfile(uid));
  });
}

suite("users/{uid} create", () => {
  it("accepts the document signup actually sends", async () => {
    // Regression: `timezone` was in this payload but not in the allow-list,
    // so the create was rejected outright.
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(setDoc(doc(db, "users/u1"), signupProfile("u1")));
  });

  it("rejects a create carrying an unlisted key", async () => {
    const db = env.authenticatedContext("u2").firestore();
    await assertFails(
      setDoc(doc(db, "users/u2"), {
        ...signupProfile("u2"),
        somethingNobodyAllowListed: 1,
      })
    );
  });
});

suite("users/{uid} update — the client-writable surface", () => {
  it("accepts the Settings → Privacy AI-analysis toggle", async () => {
    // Regression: in the UserProfile type, wired to a real toggle, absent
    // from the allow-list — so it always failed with permission-denied.
    await seedProfile("u3");
    const db = env.authenticatedContext("u3").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users/u3"), { aiAnalysisEnabled: false }, { merge: true })
    );
  });

  it("accepts the boot timezone capture", async () => {
    // Regression: fire-and-forget behind `.catch(logger.warn)`, so its
    // rejection was invisible — leaving `timezone` null for every user, which
    // the streak-nudge CF reads as "skip, no overnight pings".
    await seedProfile("u4");
    const db = env.authenticatedContext("u4").firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "users/u4"),
        { timezone: "Europe/London" },
        { merge: true }
      )
    );
  });
});

suite("users/{uid} update — fields a client must never write", () => {
  const serverOnly = PROFILE_FIELD_REGISTRY.filter((e) => e.serverOnly);

  it("has server-only fields to check (guards a vacuous pass)", () => {
    expect(serverOnly.length).toBeGreaterThan(0);
    expect(serverOnly.map((e) => e.field)).toContain("hasUsedTrial");
  });

  for (const entry of serverOnly) {
    it(`refuses a client write of \`${entry.field}\``, async () => {
      // `hasUsedTrial` is the sharp one: a client that could write `false`
      // grants itself another free trial, so this must stay unlisted rather
      // than listed-and-guarded.
      const uid = `so-${entry.field}`;
      await seedProfile(uid);
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(
        setDoc(
          doc(db, `users/${uid}`),
          { [entry.field]: false },
          { merge: true }
        )
      );
    });
  }

  it("refuses a client write of a server-guarded billing field", async () => {
    await seedProfile("u5");
    const db = env.authenticatedContext("u5").firestore();
    await assertFails(
      setDoc(doc(db, "users/u5"), { subscriptionTier: "pro" }, { merge: true })
    );
  });
});

suite("registry ↔ engine", () => {
  it("every client-writable field is genuinely accepted by the engine", async () => {
    // The list test proves the registry and the rules TEXT agree. This proves
    // the engine agrees too — catching a field allow-listed but then blocked
    // by one of the extra predicates (`subscriptionFieldsUnchanged` and
    // friends), which reading the two lists side by side would never show.
    const skip = new Set([
      // Server-guarded: allow-listed, then held immutable on purpose. Covered
      // by the refusal test above.
      ...PROFILE_FIELD_REGISTRY.filter((e) => e.serverGuarded).map(
        (e) => e.field
      ),
    ]);
    // One seeded document, one merge per field — reseeding per field costs an
    // extra round trip each and pushes this past the default timeout when the
    // rules suites share an emulator.
    await seedProfile("sweep");
    const db = env.authenticatedContext("sweep").firestore();
    const rejected: string[] = [];
    for (const field of CLIENT_WRITABLE_PROFILE_FIELDS) {
      if (skip.has(field)) continue;
      try {
        // `null` clears every field predicate the rules apply; the question
        // here is admission, not value validation.
        await setDoc(
          doc(db, "users/sweep"),
          { [field]: null },
          { merge: true }
        );
      } catch {
        rejected.push(field);
      }
    }
    expect(
      rejected,
      `Allow-listed but refused by the engine — some other rule predicate is ` +
        `blocking these, so the registry over-promises what a client can write.`
    ).toEqual([]);
  }, 60_000);
});
