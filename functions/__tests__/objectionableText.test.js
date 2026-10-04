/**
 * The callables' word-filter decisions (lib/objectionableText.js): which
 * comment or display name is refused, and with which sentence. The client
 * says the same sentences, pinned by
 * src/lib/__tests__/profanityFilterMirror.cross.test.ts.
 *
 * "shit" is the sample the filter's own suite uses; "sucks" is the mildest
 * entry leo-profanity's English list carries.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  REFUSALS,
  commentRefusal,
  displayNameRefusal,
} = require("../lib/objectionableText");

describe("commentRefusal", () => {
  it("lets ordinary comments through, fitness slang included", () => {
    for (const text of [
      "Strong finish",
      "Smashed it, absolutely ripped",
      "Killer hills on that one",
    ]) {
      expect(commentRefusal({ text, authorName: "Sam" })).toBeNull();
    }
  });

  it("refuses text that trips the filter, with the comment sentence", () => {
    expect(commentRefusal({ text: "this hill sucks", authorName: "Sam" })).toBe(
      REFUSALS.comment
    );
    expect(commentRefusal({ text: "SHIT pace", authorName: "Sam" })).toBe(
      REFUSALS.comment
    );
  });

  it("refuses a name that trips the filter, saying it is the name", () => {
    expect(commentRefusal({ text: "Nice run", authorName: "shit head" })).toBe(
      REFUSALS.authorName
    );
  });

  it("names the text first when both trip it: that is what was just typed", () => {
    expect(commentRefusal({ text: "sucks", authorName: "shit" })).toBe(
      REFUSALS.comment
    );
  });

  it("treats a missing name as no name, not as a refusal", () => {
    expect(commentRefusal({ text: "Nice run" })).toBeNull();
  });
});

describe("displayNameRefusal", () => {
  it("lets real names through", () => {
    for (const name of ["Sam", "O'Brien", "Łukasz", "田中", "Beast Mode"]) {
      expect(displayNameRefusal(name)).toBeNull();
    }
  });

  it("refuses a name that trips the filter", () => {
    expect(displayNameRefusal("shit")).toBe(REFUSALS.displayName);
  });

  it("leaves an absent name to the other checks", () => {
    expect(displayNameRefusal(undefined)).toBeNull();
    expect(displayNameRefusal("")).toBeNull();
  });
});

describe("the sentences", () => {
  it("are plain and carry no exclamation marks (house voice)", () => {
    for (const sentence of Object.values(REFUSALS)) {
      expect(sentence).not.toMatch(/!/);
      expect(sentence).toMatch(/\.$/);
    }
  });
});
