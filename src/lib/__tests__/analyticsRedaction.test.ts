import { describe, it, expect } from "vitest";
import { sanitizeAnalyticsParams } from "../analyticsRedaction";

describe("sanitizeAnalyticsParams", () => {
  it("keeps safe primitive dimensions untouched", () => {
    const out = sanitizeAnalyticsParams({
      source: "upgrade_page",
      selectedPlan: "annual",
      platform: "web",
      durationMs: 420,
      daysPerWeek: 4,
      isPro: true,
    });
    expect(out).toEqual({
      source: "upgrade_page",
      selectedPlan: "annual",
      platform: "web",
      durationMs: 420,
      daysPerWeek: 4,
      isPro: true,
    });
  });

  it("does NOT falsely drop 'platform' (the bare-'lat' substring trap)", () => {
    expect(sanitizeAnalyticsParams({ platform: "web" })).toEqual({
      platform: "web",
    });
  });

  it("drops PII keys: email, gps/coords, injury notes, names, uid, tokens", () => {
    const out = sanitizeAnalyticsParams({
      email: "a@b.com",
      userEmail: "a@b.com",
      gpsTrack: "[[1,2],[3,4]]",
      lat: 51.5,
      lon: -0.1,
      latitude: 51.5,
      longitude: -0.1,
      coords: "51.5,-0.1",
      homeAddress: "10 Downing St",
      phoneNumber: "+44...",
      injuryNotes: "left knee ACL",
      mealText: "two eggs and toast",
      rawText: "free text",
      displayName: "Jane",
      uid: "abc123",
      authToken: "secret",
      keep: "yes",
    });
    expect(out).toEqual({ keep: "yes" });
  });

  it("drops non-primitive values (objects, arrays, null)", () => {
    const out = sanitizeAnalyticsParams({
      nested: { a: 1 },
      list: [1, 2, 3],
      empty: null,
      ok: "value",
    });
    expect(out).toEqual({ ok: "value" });
  });

  it("drops any string containing '@' as a belt-and-braces email guard", () => {
    expect(sanitizeAnalyticsParams({ handle: "jane@x" })).toEqual({});
  });

  it("truncates long free-text strings to the GA4 100-char cap", () => {
    const long = "x".repeat(250);
    const out = sanitizeAnalyticsParams({ blob: long });
    expect((out.blob as string).length).toBe(100);
  });

  it("drops non-finite numbers", () => {
    expect(sanitizeAnalyticsParams({ n: NaN, m: Infinity, ok: 1 })).toEqual({
      ok: 1,
    });
  });

  it("does not mutate the input object", () => {
    const input = { email: "a@b.com", ok: "v" };
    sanitizeAnalyticsParams(input);
    expect(input).toEqual({ email: "a@b.com", ok: "v" });
  });
});
