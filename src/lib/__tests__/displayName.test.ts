import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  DISPLAY_NAME_MIN,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_LENGTH_MESSAGE,
} from "../displayName";
import { OBJECTIONABLE_NAME_MESSAGE } from "../profanityFilter";
import * as wordFilter from "../profanityFilter";

/** With the word filter loaded, as every screen passes it once it has. */
const validate = (raw: string) => validateDisplayName(raw, wordFilter);

describe("validateDisplayName", () => {
  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      const v = validate("");
      expect(v.valid).toBe(false);
      expect(v.trimmed).toBe("");
    });

    it("rejects whitespace-only", () => {
      const v = validate("   ");
      expect(v.valid).toBe(false);
      expect(v.trimmed).toBe("");
    });

    it("rejects single character (below minimum)", () => {
      expect(validate("T").valid).toBe(false);
    });

    it("rejects 51-character name (above maximum)", () => {
      const s = "a".repeat(51);
      expect(s.length).toBe(51);
      expect(validate(s).valid).toBe(false);
    });
  });

  describe("valid inputs", () => {
    it("accepts two characters (at minimum)", () => {
      const v = validate("To");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("To");
    });

    it("accepts three characters", () => {
      expect(validate("Tom").valid).toBe(true);
    });

    it("accepts 50 characters (at maximum)", () => {
      const s = "a".repeat(50);
      expect(s.length).toBe(50);
      expect(validate(s).valid).toBe(true);
    });

    it("accepts name with space", () => {
      expect(validate("Tom Brady").valid).toBe(true);
    });

    it("accepts apostrophe (O'Brien)", () => {
      expect(validate("O'Brien").valid).toBe(true);
    });

    it("accepts non-ASCII (Łukasz)", () => {
      expect(validate("Łukasz").valid).toBe(true);
    });

    it("accepts CJK (田中)", () => {
      const v = validate("田中");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("田中");
    });

    it("accepts single running-person emoji (UTF-16 length 2)", () => {
      // Documented quirk: JS string length counts UTF-16 code units. 🏃 has
      // length 2, so it passes the ≥2 rule on its own. Acceptable — users
      // can pick emoji-only display names if they want.
      const emoji = "🏃";
      expect(emoji.length).toBe(2);
      expect(validate(emoji).valid).toBe(true);
    });
  });

  describe("trimming behaviour", () => {
    it("trims leading and trailing whitespace", () => {
      const v = validate("  Tom  ");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("Tom");
    });

    it("preserves interior whitespace", () => {
      const v = validate("  Tom Brady  ");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("Tom Brady");
    });

    it("rejects when trimmed length falls below minimum", () => {
      // "A" + leading/trailing spaces — trimmed is "A", length 1 < min.
      expect(validate("  A  ").valid).toBe(false);
    });

    it("rejects when trimmed length exceeds maximum", () => {
      // 52-char core, length 52 > max after trim.
      const v = validate(`  ${"x".repeat(52)}  `);
      expect(v.valid).toBe(false);
      expect(v.trimmed.length).toBe(52);
    });
  });

  describe("bounds constants", () => {
    it("exports a sensible minimum", () => {
      expect(DISPLAY_NAME_MIN).toBe(2);
    });

    it("exports a sensible maximum", () => {
      expect(DISPLAY_NAME_MAX).toBe(50);
    });
  });

  describe("the word filter (App Review 1.2: a display name is public)", () => {
    it("refuses a name the filter flags, with the sentence to show", () => {
      const v = validate("  shit head  ");
      expect(v).toEqual({
        valid: false,
        trimmed: "shit head",
        problem: "objectionable",
        message: OBJECTIONABLE_NAME_MESSAGE,
      });
    });

    it("leaves names that only look tough alone", () => {
      for (const name of ["Beast Mode", "Killer Legs", "Ripped Ron"]) {
        expect(validate(name).valid).toBe(true);
      }
    });

    it("says the length when that is the problem", () => {
      expect(validate("T")).toMatchObject({
        valid: false,
        problem: "length",
        message: DISPLAY_NAME_LENGTH_MESSAGE,
      });
      expect(DISPLAY_NAME_LENGTH_MESSAGE).toBe(
        "Enter a name between 2 and 50 characters."
      );
    });

    it("has no problem and no message for a valid name", () => {
      expect(validate("Tom")).toMatchObject({
        problem: null,
        message: null,
      });
    });
  });
});

describe("before the word filter has loaded", () => {
  it("holds a name of the right length, with nothing to say yet", () => {
    expect(validateDisplayName("  Tom  ", null)).toEqual({
      valid: false,
      trimmed: "Tom",
      problem: null,
      message: null,
    });
  });

  it("still says the length, which needs no filter", () => {
    expect(validateDisplayName("T", null)).toMatchObject({
      valid: false,
      problem: "length",
    });
  });
});
