import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  DISPLAY_NAME_MIN,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_LENGTH_MESSAGE,
} from "../displayName";
import { OBJECTIONABLE_NAME_MESSAGE } from "../profanityFilter";

describe("validateDisplayName", () => {
  describe("invalid inputs", () => {
    it("rejects empty string", () => {
      const v = validateDisplayName("");
      expect(v.valid).toBe(false);
      expect(v.trimmed).toBe("");
    });

    it("rejects whitespace-only", () => {
      const v = validateDisplayName("   ");
      expect(v.valid).toBe(false);
      expect(v.trimmed).toBe("");
    });

    it("rejects single character (below minimum)", () => {
      expect(validateDisplayName("T").valid).toBe(false);
    });

    it("rejects 31-character name (above maximum)", () => {
      const s = "a".repeat(31);
      expect(s.length).toBe(31);
      expect(validateDisplayName(s).valid).toBe(false);
    });
  });

  describe("valid inputs", () => {
    it("accepts two characters (at minimum)", () => {
      const v = validateDisplayName("To");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("To");
    });

    it("accepts three characters", () => {
      expect(validateDisplayName("Tom").valid).toBe(true);
    });

    it("accepts 30 characters (at maximum)", () => {
      const s = "a".repeat(30);
      expect(s.length).toBe(30);
      expect(validateDisplayName(s).valid).toBe(true);
    });

    it("accepts name with space", () => {
      expect(validateDisplayName("Tom Brady").valid).toBe(true);
    });

    it("accepts apostrophe (O'Brien)", () => {
      expect(validateDisplayName("O'Brien").valid).toBe(true);
    });

    it("accepts non-ASCII (Łukasz)", () => {
      expect(validateDisplayName("Łukasz").valid).toBe(true);
    });

    it("accepts CJK (田中)", () => {
      const v = validateDisplayName("田中");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("田中");
    });

    it("accepts single running-person emoji (UTF-16 length 2)", () => {
      // Documented quirk: JS string length counts UTF-16 code units. 🏃 has
      // length 2, so it passes the ≥2 rule on its own. Acceptable — users
      // can pick emoji-only display names if they want.
      const emoji = "🏃";
      expect(emoji.length).toBe(2);
      expect(validateDisplayName(emoji).valid).toBe(true);
    });
  });

  describe("trimming behaviour", () => {
    it("trims leading and trailing whitespace", () => {
      const v = validateDisplayName("  Tom  ");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("Tom");
    });

    it("preserves interior whitespace", () => {
      const v = validateDisplayName("  Tom Brady  ");
      expect(v.valid).toBe(true);
      expect(v.trimmed).toBe("Tom Brady");
    });

    it("rejects when trimmed length falls below minimum", () => {
      // "A" + leading/trailing spaces — trimmed is "A", length 1 < min.
      expect(validateDisplayName("  A  ").valid).toBe(false);
    });

    it("rejects when trimmed length exceeds maximum", () => {
      // 32-char core, length 32 > max after trim.
      const v = validateDisplayName(`  ${"x".repeat(32)}  `);
      expect(v.valid).toBe(false);
      expect(v.trimmed.length).toBe(32);
    });
  });

  describe("bounds constants", () => {
    it("exports a sensible minimum", () => {
      expect(DISPLAY_NAME_MIN).toBe(2);
    });

    it("exports a sensible maximum", () => {
      expect(DISPLAY_NAME_MAX).toBe(30);
    });
  });

  describe("the word filter (App Review 1.2: a display name is public)", () => {
    it("refuses a name the filter flags, with the sentence to show", () => {
      const v = validateDisplayName("  shit head  ");
      expect(v).toEqual({
        valid: false,
        trimmed: "shit head",
        problem: "objectionable",
        message: OBJECTIONABLE_NAME_MESSAGE,
      });
    });

    it("leaves names that only look tough alone", () => {
      for (const name of ["Beast Mode", "Killer Legs", "Ripped Ron"]) {
        expect(validateDisplayName(name).valid).toBe(true);
      }
    });

    it("says the length when that is the problem", () => {
      expect(validateDisplayName("T")).toMatchObject({
        valid: false,
        problem: "length",
        message: DISPLAY_NAME_LENGTH_MESSAGE,
      });
      expect(DISPLAY_NAME_LENGTH_MESSAGE).toBe(
        "Enter a name between 2 and 30 characters."
      );
    });

    it("has no problem and no message for a valid name", () => {
      expect(validateDisplayName("Tom")).toMatchObject({
        problem: null,
        message: null,
      });
    });
  });
});
