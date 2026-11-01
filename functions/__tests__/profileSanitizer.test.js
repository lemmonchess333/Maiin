/**
 * Unit tests for the profile-field allow-list sanitiser.
 *
 * The sanitiser is the post-#540 follow-up that closes the
 * stored-data surface in completeOnboarding — pre-sanitiser the
 * handler validated *required* fields and stripped a small
 * block-list, then wrote the WHOLE incoming object via
 * `set(..., { merge: true })`. A malicious caller could include
 * arbitrary extra fields (photoURL pixel trackers, attacker-
 * controlled URLs in fields that render as links, etc.) and they'd
 * land in Firestore unchanged.
 *
 * This suite pins:
 *  - allow-list semantics (unknown keys dropped)
 *  - per-field type / range validation
 *  - photoURL protocol gate (http/https only)
 *  - null-handling for fields where null is a meaningful state
 *  - nested-object sanitisation (raceGoal, macroTargets, program)
 *  - server-managed fields can't be passed through
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sanitizeProfileData,
  findUnexpectedProfileFields,
  cleanPhotoURL,
  PROFILE_ALLOWED_FIELDS,
  SERVER_MANAGED_PROFILE_FIELDS,
} = require("../profileSanitizer");

describe("recurring run availability", () => {
  it("retains only bounded numbers and explicit nulls", () => {
    expect(
      sanitizeProfileData({
        runTimeLimits: {
          sessionMinutes: 30,
          longRunMinutes: null,
          extra: "ignored",
        },
      }).runTimeLimits
    ).toEqual({ sessionMinutes: 30, longRunMinutes: null });
    expect(
      sanitizeProfileData({ runTimeLimits: null }).runTimeLimits
    ).toBeNull();
    for (const value of [
      {},
      [],
      { sessionMinutes: "30", longRunMinutes: 60 },
      { sessionMinutes: 0, longRunMinutes: 60 },
      { sessionMinutes: 45, longRunMinutes: Infinity },
    ]) {
      expect(sanitizeProfileData({ runTimeLimits: value })).not.toHaveProperty(
        "runTimeLimits"
      );
    }
    expect(
      findUnexpectedProfileFields({
        runTimeLimits: { sessionMinutes: 30, longRunMinutes: 60 },
      })
    ).toEqual([]);
  });
});

describe("barbellAtHome (Lift4 (11))", () => {
  it("keeps a yes or a no, and drops anything else", () => {
    expect(sanitizeProfileData({ barbellAtHome: true })).toEqual({
      barbellAtHome: true,
    });
    expect(sanitizeProfileData({ barbellAtHome: false })).toEqual({
      barbellAtHome: false,
    });
    expect(sanitizeProfileData({ barbellAtHome: "yes" })).toEqual({});
  });
});

describe("raceLegTrim (Lift4 (10))", () => {
  it("keeps a yes or a no, and drops anything else", () => {
    expect(sanitizeProfileData({ raceLegTrim: true })).toEqual({
      raceLegTrim: true,
    });
    expect(sanitizeProfileData({ raceLegTrim: false })).toEqual({
      raceLegTrim: false,
    });
    expect(sanitizeProfileData({ raceLegTrim: 1 })).toEqual({});
  });
});

describe("findUnexpectedProfileFields — loud-drop detection (ADR-0005)", () => {
  it("flags a field that is neither allow-listed nor server-managed", () => {
    // The forgotten-field case: a new profile field someone added client-side
    // but forgot to add to the allow-list — silently dropped by the write.
    const out = findUnexpectedProfileFields({
      displayName: "Mara", // allow-listed
      brandNewField: 42, // forgotten → unexpected
    });
    expect(out).toEqual(["brandNewField"]);
  });

  it("does NOT flag server-managed (deny-listed) fields — those are expected drops", () => {
    const input = {};
    for (const f of SERVER_MANAGED_PROFILE_FIELDS) input[f] = "x";
    expect(findUnexpectedProfileFields(input)).toEqual([]);
  });

  it("does NOT flag the activation facts the server itself writes", () => {
    // completeOnboarding stamps the first two and the billing webhooks the
    // third; a profile read back and sent again carries them.
    expect(
      findUnexpectedProfileFields({
        onboardingPlatform: "ios",
        onboardingSport: "runner",
        activationBillingFirsts: { trial: { atMs: 1, source: "ios_iap" } },
      })
    ).toEqual([]);
  });

  it("does NOT flag allow-listed fields", () => {
    expect(
      findUnexpectedProfileFields({ displayName: "x", targetCalories: 2200 })
    ).toEqual([]);
  });

  it("returns [] for non-object input", () => {
    expect(findUnexpectedProfileFields(null)).toEqual([]);
    expect(findUnexpectedProfileFields(undefined)).toEqual([]);
    expect(findUnexpectedProfileFields([1, 2])).toEqual([]);
  });

  it("ignores prototype keys (own enumerable only)", () => {
    expect(
      findUnexpectedProfileFields({ constructor: 1, toString: 2 })
    ).toEqual(["constructor", "toString"]);
    // (these ARE own enumerable keys here, so they're correctly flagged as
    // unexpected — the guard is that inherited prototype props are not.)
  });

  it("every unexpected field would be dropped by sanitizeProfileData (consistency)", () => {
    const input = { displayName: "x", forgottenA: 1, forgottenB: 2 };
    const dropped = findUnexpectedProfileFields(input);
    const out = sanitizeProfileData(input);
    for (const f of dropped) expect(out[f]).toBeUndefined();
  });
});

describe("PROFILE_ALLOWED_FIELDS", () => {
  it("is a frozen array (the closed set can't be mutated at runtime)", () => {
    expect(Array.isArray(PROFILE_ALLOWED_FIELDS)).toBe(true);
    expect(Object.isFrozen(PROFILE_ALLOWED_FIELDS)).toBe(true);
  });

  it("includes the demographics + body-metrics fields the handler requires", () => {
    // Required-field gate in completeOnboarding asserts these
    // exist on the sanitised output — if they're dropped from the
    // allow-list the whole onboarding flow regresses.
    for (const field of [
      "weightKg",
      "heightCm",
      "age",
      "sex",
      "activityLevel",
    ]) {
      expect(PROFILE_ALLOWED_FIELDS).toContain(field);
    }
  });

  it("includes photoURL (the high-risk field the sanitiser was designed for)", () => {
    expect(PROFILE_ALLOWED_FIELDS).toContain("photoURL");
  });

  it("excludes server-managed identity / subscription / billing fields", () => {
    // Even though SERVER_MANAGED_PROFILE_FIELDS documents the intent,
    // pin the absence at the allow-list level so a future "let me
    // just add stripeCustomerId" instinct surfaces here.
    for (const field of SERVER_MANAGED_PROFILE_FIELDS) {
      expect(PROFILE_ALLOWED_FIELDS).not.toContain(field);
    }
  });
});

describe("sanitizeProfileData — top-level shape", () => {
  it("returns an empty object for non-object input", () => {
    expect(sanitizeProfileData(null)).toEqual({});
    expect(sanitizeProfileData(undefined)).toEqual({});
    expect(sanitizeProfileData("string")).toEqual({});
    expect(sanitizeProfileData(123)).toEqual({});
    expect(sanitizeProfileData([])).toEqual({});
  });

  it("drops fields that aren't on the allow-list", () => {
    // The core property: arbitrary extra keys land nowhere. A
    // malicious caller can't smuggle a `stripeCustomerId` or a
    // `pixelTrackerUrl` into the profile doc.
    const out = sanitizeProfileData({
      displayName: "Alice",
      stripeCustomerId: "cus_evil",
      pixelTrackerUrl: "https://attacker.example/pixel",
      arbitraryField: "x",
    });
    expect(out.displayName).toBe("Alice");
    expect(out.stripeCustomerId).toBeUndefined();
    expect(out.pixelTrackerUrl).toBeUndefined();
    expect(out.arbitraryField).toBeUndefined();
  });

  it("does not mutate the input", () => {
    // Defensive: the sanitiser returns a new object so callers
    // that hand-off the raw input downstream still see it intact.
    const input = { displayName: "Alice", unknownField: "y" };
    sanitizeProfileData(input);
    expect(input.unknownField).toBe("y");
  });
});

describe("sanitizeProfileData — string fields", () => {
  it("trims whitespace and drops control characters", () => {
    const out = sanitizeProfileData({
      displayName: "  Al ice  ",
    });
    expect(out.displayName).toBe("Alice");
  });

  it("drops empty / whitespace-only strings", () => {
    const out = sanitizeProfileData({
      displayName: "   ",
      athleteType: "",
    });
    expect(out.displayName).toBeUndefined();
    expect(out.athleteType).toBeUndefined();
  });

  it("caps displayName at 50 characters", () => {
    const out = sanitizeProfileData({ displayName: "x".repeat(120) });
    expect(out.displayName.length).toBe(50);
  });

  it("drops non-string values that should be strings", () => {
    const out = sanitizeProfileData({ displayName: 123, athleteType: ["arr"] });
    expect(out.displayName).toBeUndefined();
    expect(out.athleteType).toBeUndefined();
  });

  it("D16: trainingWhy passes through trimmed and capped at 120", () => {
    const trimmed = sanitizeProfileData({ trainingWhy: "  Feel stronger  " });
    expect(trimmed.trainingWhy).toBe("Feel stronger");
    const capped = sanitizeProfileData({ trainingWhy: "y".repeat(200) });
    expect(capped.trainingWhy.length).toBe(120);
    const nonString = sanitizeProfileData({ trainingWhy: { hack: true } });
    expect(nonString.trainingWhy).toBeUndefined();
  });
});

describe("sanitizeProfileData — numeric fields", () => {
  it("accepts numbers in the documented range", () => {
    const out = sanitizeProfileData({ weightKg: 70, heightCm: 170, age: 30 });
    expect(out.weightKg).toBe(70);
    expect(out.heightCm).toBe(170);
    expect(out.age).toBe(30);
  });

  it("drops out-of-range numbers (security: server-side enforcement)", () => {
    // Client UI blocks <16 / >120 age; this path is for callers
    // that bypass the client (direct API calls). Pin that the
    // server gate is the actual enforcement.
    const out = sanitizeProfileData({
      age: 15,
      weightKg: 5,
      heightCm: 50,
    });
    expect(out.age).toBeUndefined();
    expect(out.weightKg).toBeUndefined();
    expect(out.heightCm).toBeUndefined();
  });

  it("drops non-finite numbers (NaN, Infinity)", () => {
    const out = sanitizeProfileData({
      weightKg: NaN,
      heightCm: Infinity,
    });
    expect(out.weightKg).toBeUndefined();
    expect(out.heightCm).toBeUndefined();
  });

  it("drops non-numeric values for numeric fields", () => {
    const out = sanitizeProfileData({ weightKg: "70", heightCm: "170" });
    expect(out.weightKg).toBeUndefined();
    expect(out.heightCm).toBeUndefined();
  });

  it("enforces integer constraint on day counts", () => {
    // daysPerWeek / weeklyWorkoutsTarget etc. are counts. A
    // fractional value is meaningless and we'd rather drop it
    // than round silently.
    const out = sanitizeProfileData({
      daysPerWeek: 4.5,
      weeklyWorkoutsTarget: 3,
    });
    expect(out.daysPerWeek).toBeUndefined();
    expect(out.weeklyWorkoutsTarget).toBe(3);
  });
});

describe("sanitizeProfileData — enum fields", () => {
  it("accepts listed enum values", () => {
    const out = sanitizeProfileData({
      sex: "male",
      activityLevel: "moderate",
      preferredWeightUnit: "kg",
      runMode: "race_prep",
    });
    expect(out.sex).toBe("male");
    expect(out.activityLevel).toBe("moderate");
    expect(out.preferredWeightUnit).toBe("kg");
    expect(out.runMode).toBe("race_prep");
  });

  it("drops off-enum values", () => {
    const out = sanitizeProfileData({
      sex: "non-binary",
      activityLevel: "olympic",
      preferredWeightUnit: "stones",
      runMode: "freestyle",
    });
    expect(out.sex).toBeUndefined();
    expect(out.activityLevel).toBeUndefined();
    expect(out.preferredWeightUnit).toBeUndefined();
    expect(out.runMode).toBeUndefined();
  });
});

describe("sanitizeProfileData — photoURL", () => {
  it("accepts https URLs", () => {
    const out = sanitizeProfileData({
      photoURL: "https://lh3.googleusercontent.com/a/abc",
    });
    expect(out.photoURL).toBe("https://lh3.googleusercontent.com/a/abc");
  });

  it("accepts http URLs (local dev, etc.)", () => {
    // Not a meaningful prod state but the allow-list keeps http
    // in for emulator parity. Pin so a future "https-only" change
    // is conscious.
    const out = sanitizeProfileData({
      photoURL: "http://localhost:9099/pic.jpg",
    });
    expect(out.photoURL).toBe("http://localhost:9099/pic.jpg");
  });

  it("rejects javascript: scheme", () => {
    const out = sanitizeProfileData({ photoURL: "javascript:alert(1)" });
    expect(out.photoURL).toBeUndefined();
  });

  it("rejects data: scheme", () => {
    // A data: URL could embed arbitrary bytes / scripts and would
    // bypass any content-type checking. Hard reject.
    const out = sanitizeProfileData({
      photoURL: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
    });
    expect(out.photoURL).toBeUndefined();
  });

  it("rejects file: / vbscript: / ftp: schemes", () => {
    const out = sanitizeProfileData({ photoURL: "file:///etc/passwd" });
    expect(out.photoURL).toBeUndefined();
    const out2 = sanitizeProfileData({ photoURL: "vbscript:msgbox(1)" });
    expect(out2.photoURL).toBeUndefined();
    const out3 = sanitizeProfileData({ photoURL: "ftp://example.com/pic.jpg" });
    expect(out3.photoURL).toBeUndefined();
  });

  it("rejects malformed URLs", () => {
    const out = sanitizeProfileData({ photoURL: "not a url at all" });
    expect(out.photoURL).toBeUndefined();
    const out2 = sanitizeProfileData({ photoURL: "//evil.com/pic" });
    expect(out2.photoURL).toBeUndefined();
  });

  it("rejects overly long URLs (DoS / pixel-tracker payload)", () => {
    const out = sanitizeProfileData({
      photoURL: "https://evil.example/" + "x".repeat(3000),
    });
    expect(out.photoURL).toBeUndefined();
  });

  it("preserves explicit null (clears the photo)", () => {
    // `null` is a meaningful state: "user has no photo". Don't
    // confuse it with "field absent from this update".
    const out = sanitizeProfileData({ photoURL: null });
    expect(out.photoURL).toBeNull();
  });

  it("treats empty / whitespace string as null (clears the photo)", () => {
    const out = sanitizeProfileData({ photoURL: "" });
    expect(out.photoURL).toBeNull();
    const out2 = sanitizeProfileData({ photoURL: "   " });
    expect(out2.photoURL).toBeNull();
  });

  it("drops non-string non-null values", () => {
    const out = sanitizeProfileData({ photoURL: 123 });
    expect(out.photoURL).toBeUndefined();
    const out2 = sanitizeProfileData({ photoURL: { url: "https://x.com" } });
    expect(out2.photoURL).toBeUndefined();
  });

  it("exposes cleanPhotoURL as a standalone helper for direct callers", () => {
    // Tests can drive the URL gate without building a full
    // profileData wrapper, and any future endpoint that accepts a
    // photoURL has a single validator to call.
    expect(cleanPhotoURL("https://example.com/a.jpg")).toBe(
      "https://example.com/a.jpg"
    );
    expect(cleanPhotoURL("javascript:alert(1)")).toBeUndefined();
    expect(cleanPhotoURL(null)).toBeNull();
  });
});

describe("sanitizeProfileData — nested objects", () => {
  it("sanitises macroTargets keys and drops unknowns", () => {
    const out = sanitizeProfileData({
      macroTargets: {
        calories: 2200,
        protein: 160,
        carbs: 250,
        fat: 60,
        fiber: "nope", // dropped (unknown key)
        stripeKey: "sk_test", // dropped (unknown key)
      },
    });
    expect(out.macroTargets).toEqual({
      calories: 2200,
      protein: 160,
      carbs: 250,
      fat: 60,
    });
  });

  it("sanitises program sub-object", () => {
    const out = sanitizeProfileData({
      program: {
        goal: "recomp",
        startWeight: 70,
        currentPhase: "base",
        evilField: "x",
      },
    });
    expect(out.program).toEqual({
      goal: "recomp",
      startWeight: 70,
      currentPhase: "base",
    });
  });

  it("sanitises raceGoal enum constraint on distance", () => {
    const out = sanitizeProfileData({
      raceGoal: { distance: "5k", targetDate: "2026-12-01" },
    });
    expect(out.raceGoal).toEqual({ distance: "5k", targetDate: "2026-12-01" });

    const bad = sanitizeProfileData({
      raceGoal: { distance: "ultra-100", targetDate: "2026-12-01" },
    });
    // distance dropped → only targetDate survives, which is still
    // a valid sub-doc; pin that the malformed enum is filtered out.
    expect(bad.raceGoal).toEqual({ targetDate: "2026-12-01" });
  });

  it("sanitises the optional raceGoal.eventName (bounded, control chars stripped)", () => {
    // A valid name ≤60 chars survives intact.
    const ok = sanitizeProfileData({
      raceGoal: {
        distance: "marathon",
        targetDate: "2026-12-01",
        eventName: "London Marathon 2026",
      },
    });
    expect(ok.raceGoal).toEqual({
      distance: "marathon",
      targetDate: "2026-12-01",
      eventName: "London Marathon 2026",
    });

    // An over-long name is bounded to 60 chars.
    const long = sanitizeProfileData({
      raceGoal: {
        distance: "5k",
        targetDate: "2026-12-01",
        eventName: "x".repeat(100),
      },
    });
    expect(long.raceGoal.eventName).toBe("x".repeat(60));

    // Control chars are stripped by cleanString.
    const dirty = sanitizeProfileData({
      raceGoal: {
        distance: "5k",
        targetDate: "2026-12-01",
        eventName: "Park\u0000run\u0007 5K",
      },
    });
    expect(dirty.raceGoal.eventName).toBe("Parkrun 5K");

    // Absent stays absent — no key is invented.
    const absent = sanitizeProfileData({
      raceGoal: { distance: "5k", targetDate: "2026-12-01" },
    });
    expect(absent.raceGoal).toEqual({
      distance: "5k",
      targetDate: "2026-12-01",
    });
  });

  it("keeps raceGoal.entry, a race entered or run on your own, and drops anything else", () => {
    for (const entry of ["race", "own"]) {
      const out = sanitizeProfileData({
        raceGoal: { distance: "10k", targetDate: "2026-12-01", entry },
      });
      expect(out.raceGoal).toEqual({
        distance: "10k",
        targetDate: "2026-12-01",
        entry,
      });
    }
    for (const entry of ["solo", "RACE", 1, null]) {
      const out = sanitizeProfileData({
        raceGoal: { distance: "10k", targetDate: "2026-12-01", entry },
      });
      expect(out.raceGoal).toEqual({
        distance: "10k",
        targetDate: "2026-12-01",
      });
    }
  });

  it("sanitises raceGoal.eventSpaceId against the pinned space-id list (races plan Q4)", () => {
    // A known race-space id survives.
    const ok = sanitizeProfileData({
      raceGoal: {
        distance: "half",
        targetDate: "2026-09-06",
        eventSpaceId: "the-big-half",
      },
    });
    expect(ok.raceGoal.eventSpaceId).toBe("the-big-half");

    // An unknown id is dropped (the goal itself survives as manual).
    const unknown = sanitizeProfileData({
      raceGoal: {
        distance: "half",
        targetDate: "2026-09-06",
        eventSpaceId: "totally-made-up",
      },
    });
    expect(unknown.raceGoal).toEqual({
      distance: "half",
      targetDate: "2026-09-06",
    });

    // Non-string junk is dropped, not coerced.
    const junk = sanitizeProfileData({
      raceGoal: {
        distance: "half",
        targetDate: "2026-09-06",
        eventSpaceId: { $bad: true },
      },
    });
    expect("eventSpaceId" in junk.raceGoal).toBe(false);
  });

  it("drops the whole nested object when none of its keys validate", () => {
    const out = sanitizeProfileData({
      macroTargets: { random: 1, garbage: 2 },
    });
    expect(out.macroTargets).toBeUndefined();
  });

  it("drops non-object nested values (arrays, primitives)", () => {
    const out = sanitizeProfileData({
      macroTargets: [1, 2, 3],
      program: "not an object",
    });
    expect(out.macroTargets).toBeUndefined();
    expect(out.program).toBeUndefined();
  });
});

describe("sanitizeProfileData — null handling on specific fields", () => {
  it("preserves null on lastLogDate (clears the value)", () => {
    const out = sanitizeProfileData({ lastLogDate: null });
    expect(out.lastLogDate).toBeNull();
  });

  it("drops null on other string fields (treated as absent)", () => {
    // For most fields, null === "I don't want to send this", not
    // "clear it". `photoURL` and `lastLogDate` are the explicit
    // null-supports-clear fields; everything else drops null.
    const out = sanitizeProfileData({
      displayName: null,
      athleteType: null,
      primaryGoal: null,
    });
    expect(out.displayName).toBeUndefined();
    expect(out.athleteType).toBeUndefined();
    expect(out.primaryGoal).toBeUndefined();
  });
});

describe("sanitizeProfileData — happy path (realistic onboarding payload)", () => {
  it("passes the full payload Onboarding.tsx sends through unchanged", () => {
    // Mirror the actual payload in src/pages/Onboarding.tsx so
    // this test catches regressions where the sanitiser starts
    // dropping fields the real client uses.
    const input = {
      displayName: "Alice",
      email: "alice@example.com",
      currentStreak: 0,
      longestStreak: 0,
      lastLogDate: null,
      darkMode: false,
      weeklyWorkoutsTarget: 4,
      weeklyMealsTarget: 10,
      weeklyRunsTarget: 2,
      weeklyRunDaysTarget: 2,
      athleteType: "Lifter",
      gender: "female",
      ageRange: "25-34",
      heightCm: 170,
      weightKg: 70,
      preferredHeightUnit: "cm",
      preferredWeightUnit: "kg",
      primaryGoal: "recomp",
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: "full_gym",
      preferredSplit: "upper_lower",
      runFrequency: "low",
      runMode: "freeform",
      injuries: ["lower_back"],
      onboardingComplete: true,
      age: 30,
      sex: "female",
      activityLevel: "moderate",
      tdeeBase: 2200,
      aiCalorieAdjustment: 0,
      targetCalories: 2200,
      targetProtein: 160,
      targetCarbs: 250,
      targetFat: 60,
      macroTargets: { calories: 2200, protein: 160, carbs: 250, fat: 60 },
      program: { goal: "recomp", startWeight: 70, currentPhase: "base" },
    };
    const out = sanitizeProfileData(input);
    // Every input key (that's on the allow-list) should be present
    // with the same value — no silent drops on the happy path.
    for (const [key, value] of Object.entries(input)) {
      if (key === "onboardingComplete") continue; // not on allow-list — handler overwrites
      expect(out[key]).toEqual(value);
    }
  });
});

describe("goal-weight onboarding fields (Tier 2)", () => {
  it("passes valid goalWeightKg + weeklyRateKg through the allow-list", () => {
    const out = sanitizeProfileData({ goalWeightKg: 78, weeklyRateKg: 0.5 });
    expect(out.goalWeightKg).toBe(78);
    expect(out.weeklyRateKg).toBe(0.5);
  });

  it("range-validates: out-of-range values are dropped, not clamped", () => {
    const out = sanitizeProfileData({
      goalWeightKg: 5, // below 30kg floor
      weeklyRateKg: 9, // above 2kg/wk ceiling
    });
    expect(out.goalWeightKg).toBeUndefined();
    expect(out.weeklyRateKg).toBeUndefined();
  });

  it("are on the frozen allow-list", () => {
    expect(PROFILE_ALLOWED_FIELDS).toContain("goalWeightKg");
    expect(PROFILE_ALLOWED_FIELDS).toContain("weeklyRateKg");
  });
});

describe("adaptive engine fields (Adaptive TDEE cap + Adaptive Paces)", () => {
  it("passes a valid adaptiveCapState through (was silently dropped pre-fix)", () => {
    const out = sanitizeProfileData({
      adaptiveCapState: { lastApplied: 2350, lastAppliedAt: "2026-06-11" },
    });
    expect(out.adaptiveCapState).toEqual({
      lastApplied: 2350,
      lastAppliedAt: "2026-06-11",
    });
  });

  it("preserves adaptiveCapState: null (clear)", () => {
    expect(
      sanitizeProfileData({ adaptiveCapState: null }).adaptiveCapState
    ).toBe(null);
  });

  it("passes a valid runFitness benchmark through", () => {
    const out = sanitizeProfileData({
      runFitness: {
        benchmark: { distanceM: 10000, timeS: 2700 },
        vdot: 45,
        source: "race",
        updatedAt: "2026-06-11T10:00:00.000Z",
      },
    });
    expect(out.runFitness).toEqual({
      benchmark: { distanceM: 10000, timeS: 2700 },
      vdot: 45,
      source: "race",
      updatedAt: "2026-06-11T10:00:00.000Z",
    });
  });

  it("passes RUN-EV-08 provenance + consent subfields, boolean-strict", () => {
    const out = sanitizeProfileData({
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 1200 },
        vdot: 49.8,
        source: "derived",
        updatedAt: "2026-08-08T00:00:00.000Z",
        sourceRunId: "run-abc",
        sourceRunAt: "2026-08-07T08:00:00.000Z",
        pendingConfirmation: true,
      },
    });
    expect(out.runFitness.sourceRunId).toBe("run-abc");
    expect(out.runFitness.sourceRunAt).toBe("2026-08-07T08:00:00.000Z");
    expect(out.runFitness.pendingConfirmation).toBe(true);
    // A string "true" is NOT a boolean — dropped, never coerced.
    const coerced = sanitizeProfileData({
      runFitness: {
        benchmark: { distanceM: 5000, timeS: 1200 },
        vdot: 49.8,
        source: "derived",
        updatedAt: "x",
        pendingConfirmation: "true",
      },
    });
    expect(coerced.runFitness.pendingConfirmation).toBeUndefined();
  });

  it("A2: raceGoal.targetTimeS passes within bounds, dropped outside", () => {
    const base = { distance: "5k", targetDate: "2027-01-01" };
    const ok = sanitizeProfileData({
      raceGoal: { ...base, targetTimeS: 1450 },
    });
    expect(ok.raceGoal.targetTimeS).toBe(1450);
    const tooFast = sanitizeProfileData({
      raceGoal: { ...base, targetTimeS: 30 },
    });
    expect(tooFast.raceGoal.targetTimeS).toBeUndefined();
    const absent = sanitizeProfileData({ raceGoal: base });
    expect("targetTimeS" in absent.raceGoal).toBe(false);
  });

  it("RUN-EV-02: preserves raceGoal: null (the freeform clear through configurePlan)", () => {
    expect(sanitizeProfileData({ raceGoal: null }).raceGoal).toBe(null);
    // …while a malformed object is still dropped, not nulled.
    expect(
      sanitizeProfileData({ raceGoal: "hacker" }).raceGoal
    ).toBeUndefined();
  });

  it("preserves runFitness: null and benchmark: null", () => {
    expect(sanitizeProfileData({ runFitness: null }).runFitness).toBe(null);
    const out = sanitizeProfileData({
      runFitness: {
        benchmark: null,
        vdot: 50,
        source: "estimate",
        updatedAt: "x",
      },
    });
    expect(out.runFitness.benchmark).toBe(null);
    expect(out.runFitness.vdot).toBe(50);
  });

  it("drops a bad runFitness source enum + out-of-range vdot", () => {
    const out = sanitizeProfileData({
      runFitness: {
        benchmark: { distanceM: 10000, timeS: 2700 },
        vdot: 999,
        source: "hacker",
        updatedAt: "2026-06-11",
      },
    });
    expect(out.runFitness.benchmark).toEqual({ distanceM: 10000, timeS: 2700 });
    expect(out.runFitness.vdot).toBeUndefined();
    expect(out.runFitness.source).toBeUndefined();
  });

  it("both fields are on the frozen allow-list", () => {
    expect(PROFILE_ALLOWED_FIELDS).toContain("adaptiveCapState");
    expect(PROFILE_ALLOWED_FIELDS).toContain("runFitness");
  });
});

describe("heart-rate zone fields (maxHeartRate)", () => {
  it("passes a valid measured max HR through", () => {
    expect(sanitizeProfileData({ maxHeartRate: 188 }).maxHeartRate).toBe(188);
  });

  it("preserves maxHeartRate: null (clear → fall back to age estimate)", () => {
    expect(sanitizeProfileData({ maxHeartRate: null }).maxHeartRate).toBe(null);
  });

  it("drops a nonsensical max HR (out of 100..240 range)", () => {
    expect(
      sanitizeProfileData({ maxHeartRate: 40 }).maxHeartRate
    ).toBeUndefined();
    expect(
      sanitizeProfileData({ maxHeartRate: 400 }).maxHeartRate
    ).toBeUndefined();
    expect(
      sanitizeProfileData({ maxHeartRate: "fast" }).maxHeartRate
    ).toBeUndefined();
  });

  it("is on the frozen allow-list", () => {
    expect(PROFILE_ALLOWED_FIELDS).toContain("maxHeartRate");
  });
});

describe("share answers (shareDefaults)", () => {
  const ANSWERS = ["followers", "public", "never"];

  it("passes each answer, per type", () => {
    for (const answer of ANSWERS) {
      expect(
        sanitizeProfileData({ shareDefaults: { run: answer, workout: answer } })
          .shareDefaults
      ).toEqual({ run: answer, workout: answer });
    }
  });

  it("keeps null for a cleared type ('Ask'), and leaves an absent type absent", () => {
    expect(
      sanitizeProfileData({ shareDefaults: { run: null } }).shareDefaults
    ).toEqual({ run: null });
    expect(
      sanitizeProfileData({ shareDefaults: { workout: "never" } }).shareDefaults
    ).toEqual({ workout: "never" });
  });

  it("keeps a whole-field null (no answer for either type), as the rules allow", () => {
    expect(sanitizeProfileData({ shareDefaults: null }).shareDefaults).toBe(
      null
    );
  });

  it("drops a value that is not an answer, and keeps the valid type beside it", () => {
    expect(
      sanitizeProfileData({ shareDefaults: { run: "crews", workout: "never" } })
        .shareDefaults
    ).toEqual({ workout: "never" });
    for (const bad of ["ask", "Public", "", 1, true, {}, ["public"]]) {
      expect(
        sanitizeProfileData({ shareDefaults: { run: bad } }),
        JSON.stringify(bad)
      ).not.toHaveProperty("shareDefaults");
    }
  });

  it("drops any key but the two session types", () => {
    expect(
      sanitizeProfileData({
        shareDefaults: { run: "public", badge: "public", __proto__x: "never" },
      }).shareDefaults
    ).toEqual({ run: "public" });
  });

  it("drops a value that is not a map", () => {
    for (const bad of ["public", 3, true, ["public"]]) {
      expect(
        sanitizeProfileData({ shareDefaults: bad }),
        JSON.stringify(bad)
      ).not.toHaveProperty("shareDefaults");
    }
  });

  it("is on the frozen allow-list, and not flagged as unexpected", () => {
    expect(PROFILE_ALLOWED_FIELDS).toContain("shareDefaults");
    expect(
      findUnexpectedProfileFields({ shareDefaults: { run: "never" } })
    ).toEqual([]);
  });
});

describe("gender", () => {
  it('keeps "unspecified", the value the app writes for "Prefer not to say"', () => {
    // Onboarding sent it and the list lacked it, so completeOnboarding
    // dropped the answer. src/lib/__tests__/bodyMetrics.cross.test.ts pins
    // every value onboarding can send against this list.
    expect(sanitizeProfileData({ gender: "unspecified" }).gender).toBe(
      "unspecified"
    );
    expect(sanitizeProfileData({ gender: "female" }).gender).toBe("female");
    expect(sanitizeProfileData({ gender: "robot" })).not.toHaveProperty(
      "gender"
    );
  });
});
