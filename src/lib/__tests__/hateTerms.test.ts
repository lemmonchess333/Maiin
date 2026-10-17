import { describe, it, expect } from "vitest";
import { containsHateTerm } from "../hateTerms";
import { containsProfanity } from "../profanityFilter";

describe("containsHateTerm", () => {
  it.each([
    "Hitler",
    "hitler",
    "Hitler's gym",
    "Team Hitler",
    "TeamHitler",
    "h1tl3r",
    "H!tler", // punctuation squashed out
    "nazi",
    "Nazis lift",
    "nazi-gym",
    "neo nazi club",
    "Sieg Heil",
    "sieg-heil",
    "white power",
    "White Power crew",
    "kkk crew",
    "1488",
    "swastika squad",
  ])("refuses %j", (text) => {
    expect(containsHateTerm(text)).toBe(true);
  });

  it.each([
    "",
    "   ",
    "8-week block",
    "Spring 10K",
    "Ashkenazi family",
    "Heilbronn half marathon",
    "white powerlifting belt",
    "Jennifer Heil", // a surname
    "Heil",
    "white and power cleans",
    "Hit the gym",
    "Hit 1RM", // the lookalike map turns 1 into i: "hitirm", no match
  ])("leaves %j alone", (text) => {
    expect(containsHateTerm(text)).toBe(false);
  });

  it("ignores what is not a string", () => {
    for (const v of [undefined, null, 42, {}, []]) {
      expect(containsHateTerm(v)).toBe(false);
    }
  });

  it("is part of the word filter every name and comment goes through", () => {
    expect(containsProfanity("Hitler")).toBe(true);
    expect(containsProfanity("Spring 10K")).toBe(false);
  });
});
