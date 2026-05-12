/**
 * Client-side profanity filter — UX-only mirror of the
 * server-side filter in functions/profanityFilter.js. The
 * server is the trust boundary; this exists so the composer can
 * warn the user inline before they hit "post".
 *
 * Smaller test surface than the server module: client-side we
 * only expose `containsProfanity` + `cleanProfanity`. The server
 * has `findProfaneField` too because the trigger needs to know
 * WHICH field tripped the filter to populate the flagged record.
 */
import { describe, it, expect } from "vitest";
import { containsProfanity, cleanProfanity } from "../profanityFilter";

describe("containsProfanity (client)", () => {
  it("returns false for clean text", () => {
    expect(containsProfanity("Great workout today!")).toBe(false);
  });

  it("returns true for known blocked content", () => {
    expect(containsProfanity("this is shit")).toBe(true);
  });

  it("returns false for non-string / empty inputs", () => {
    expect(containsProfanity(undefined)).toBe(false);
    expect(containsProfanity(null)).toBe(false);
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("   ")).toBe(false);
  });

  it("does not false-positive on fitness vocabulary", () => {
    // Same fitness-words guard as the server tests — pin that
    // the client doesn't inadvertently block legitimate posts.
    expect(containsProfanity("Smashed my deadlift PR")).toBe(false);
    expect(containsProfanity("Killer leg day, totally ripped")).toBe(false);
    expect(containsProfanity("Beast mode activated")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(containsProfanity("THIS IS SHIT")).toBe(true);
  });
});

describe("cleanProfanity (client)", () => {
  it("masks blocked words with asterisks", () => {
    expect(cleanProfanity("this is shit")).toBe("this is ****");
  });

  it("leaves clean text unchanged", () => {
    expect(cleanProfanity("clean text")).toBe("clean text");
  });

  it("coerces non-string to empty", () => {
    expect(cleanProfanity(null as unknown as string)).toBe("");
  });
});
