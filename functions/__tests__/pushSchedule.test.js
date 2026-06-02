/**
 * [push] functions/lib/pushSchedule.js contract tests (epic #961).
 * Pure cron scheduling helpers: local-hour bucketing + quiet-hours backstop.
 */
import { describe, it, expect } from "vitest";
import {
  localHourInTz,
  withinQuietHours,
  isLocalSendHour,
} from "../lib/pushSchedule";

// June 2026: London = BST (UTC+1), Los Angeles = PDT (UTC-7), Tokyo = JST (UTC+9).
const at = (iso) => new Date(iso);

describe("localHourInTz", () => {
  it("converts a UTC instant to the local hour per zone", () => {
    const t = at("2026-06-01T18:00:00Z");
    expect(localHourInTz(t, "Europe/London")).toBe(19); // +1
    expect(localHourInTz(t, "America/Los_Angeles")).toBe(11); // -7
    expect(localHourInTz(t, "Asia/Tokyo")).toBe(3); // +9 → 03:00 next day
  });

  it("returns 0 at local midnight (not 24)", () => {
    // 23:00 UTC = 00:00 BST next day in London.
    expect(localHourInTz(at("2026-06-01T23:00:00Z"), "Europe/London")).toBe(0);
  });

  it("returns null for absent or invalid timezone", () => {
    const t = at("2026-06-01T18:00:00Z");
    expect(localHourInTz(t, null)).toBeNull();
    expect(localHourInTz(t, undefined)).toBeNull();
    expect(localHourInTz(t, "")).toBeNull();
    expect(localHourInTz(t, "Not/AZone")).toBeNull();
  });
});

describe("withinQuietHours", () => {
  it("blocks 22:00–07:59, allows 08:00–21:59", () => {
    for (const h of [22, 23, 0, 3, 7]) expect(withinQuietHours(h)).toBe(true);
    for (const h of [8, 9, 12, 19, 21]) expect(withinQuietHours(h)).toBe(false);
  });

  it("treats null hour as not-quiet (caller skips on null tz separately)", () => {
    expect(withinQuietHours(null)).toBe(false);
  });
});

describe("isLocalSendHour", () => {
  it("fires when local hour matches the target and it's outside quiet hours", () => {
    // 18:00 UTC → 19:00 London (BST); streak target 19 → send.
    expect(
      isLocalSendHour(at("2026-06-01T18:00:00Z"), "Europe/London", 19)
    ).toBe(true);
  });

  it("does not fire when the local hour differs from the target", () => {
    // Same instant, recap target 8 → not this hour.
    expect(
      isLocalSendHour(at("2026-06-01T18:00:00Z"), "Europe/London", 8)
    ).toBe(false);
  });

  it("never fires inside quiet hours, even when the target matches", () => {
    // 22:00 UTC → 23:00 London; a (mis)configured target of 23 must still be blocked.
    expect(
      isLocalSendHour(at("2026-06-01T22:00:00Z"), "Europe/London", 23)
    ).toBe(false);
  });

  it("does not fire when the timezone is unknown", () => {
    expect(isLocalSendHour(at("2026-06-01T18:00:00Z"), null, 19)).toBe(false);
  });
});
