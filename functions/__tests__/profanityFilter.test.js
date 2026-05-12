/**
 * Server-side profanity filter tests.
 *
 * App Store Guideline 1.2 requires UGC moderation. The
 * server-side filter is the trust boundary — the client mirror
 * is UX-only. This suite pins:
 *
 *   - containsProfanity returns true for known blocked words
 *     (sampled from the leo-profanity English list)
 *   - containsProfanity returns false for clean fitness vocabulary
 *     including words that LOOK aggressive but aren't on the list
 *     (smashed, killer, ripped — fitness slang is safe)
 *   - Non-string / empty / whitespace-only inputs short-circuit
 *     to false (the caller validates non-emptiness elsewhere)
 *   - findProfaneField walks an allow-list of fields and returns
 *     the first offender's name — used by the trigger to flag
 *     which field tripped the filter
 *   - cleanProfanity masks blocked words with asterisks
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  containsProfanity,
  findProfaneField,
  cleanProfanity,
} = require("../profanityFilter");

describe("containsProfanity", () => {
  it("returns false for non-string inputs", () => {
    expect(containsProfanity(undefined)).toBe(false);
    expect(containsProfanity(null)).toBe(false);
    expect(containsProfanity(123)).toBe(false);
    expect(containsProfanity({})).toBe(false);
    expect(containsProfanity([])).toBe(false);
  });

  it("returns false for empty / whitespace-only strings", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("   ")).toBe(false);
    expect(containsProfanity("\t\n")).toBe(false);
  });

  it("returns false for clean fitness vocabulary", () => {
    // Pin that legitimate fitness language survives — false
    // positives on words like "smashed" or "killer" would cripple
    // every PR-celebration post.
    expect(containsProfanity("Smashed my deadlift PR today!")).toBe(false);
    expect(containsProfanity("Killer workout, totally ripped")).toBe(false);
    expect(containsProfanity("5k under 25 min, feeling beast mode")).toBe(false);
    expect(containsProfanity("Crushed leg day")).toBe(false);
  });

  it("returns true for a sampled blocked word", () => {
    // Just one canonical case — the full list is leo-profanity's
    // problem, we just pin that the wrapper actually consults it.
    expect(containsProfanity("this is shit")).toBe(true);
  });

  it("detects blocked words anywhere in the string", () => {
    // Pin that the predicate isn't a strict equality / prefix
    // match — a blocked word buried mid-sentence still fires.
    expect(containsProfanity("Hey shit, what a workout")).toBe(true);
  });

  it("is case-insensitive", () => {
    // leo-profanity lowercases internally; pin that.
    expect(containsProfanity("THIS IS SHIT")).toBe(true);
    expect(containsProfanity("Shit")).toBe(true);
  });
});

describe("findProfaneField", () => {
  it("returns the first profane field in the allow-list order", () => {
    // The trigger uses this to populate `flaggedField` in the
    // moderation record — pins the order is stable.
    const record = {
      caption: "all good",
      workoutName: "shit workout",
      runName: "another shit",
    };
    expect(findProfaneField(record, ["caption", "workoutName", "runName"])).toBe(
      "workoutName",
    );
  });

  it("returns null when no field is profane", () => {
    const record = {
      caption: "Great session!",
      workoutName: "Push Day",
    };
    expect(findProfaneField(record, ["caption", "workoutName"])).toBeNull();
  });

  it("ignores fields not in the allow-list", () => {
    // Defensive — if a future activity schema adds a `notes`
    // field and someone forgets to add it to the scan list, the
    // trigger silently misses it. The CALLER is responsible for
    // the field list; this test pins the helper honours it.
    const record = {
      caption: "clean",
      notes: "shit",
    };
    expect(findProfaneField(record, ["caption"])).toBeNull();
  });

  it("returns null on malformed inputs", () => {
    expect(findProfaneField(null, ["x"])).toBeNull();
    expect(findProfaneField({}, null)).toBeNull();
    expect(findProfaneField("not an object", ["x"])).toBeNull();
    expect(findProfaneField([], ["x"])).toBeNull();
  });

  it("handles missing fields gracefully (containsProfanity short-circuits)", () => {
    const record = { caption: "clean" };
    expect(findProfaneField(record, ["caption", "workoutName"])).toBeNull();
  });
});

describe("cleanProfanity", () => {
  it("masks blocked words with asterisks", () => {
    expect(cleanProfanity("this is shit")).toBe("this is ****");
  });

  it("returns the input unchanged when clean", () => {
    expect(cleanProfanity("great workout")).toBe("great workout");
  });

  it("returns empty string for non-string inputs", () => {
    expect(cleanProfanity(null)).toBe("");
    expect(cleanProfanity(undefined)).toBe("");
    expect(cleanProfanity(123)).toBe("");
  });
});
