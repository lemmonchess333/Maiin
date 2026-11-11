/**
 * The live pulse's rules on the client (Soc15): what a day's document
 * counts as, and from how many sessions the line is drawn.
 */
import { describe, it, expect } from "vitest";
import { PULSE_MIN_SESSIONS, pulseSessions, showsPulse } from "../pulse";

describe("pulseSessions", () => {
  it("is the day's whole number of sessions", () => {
    expect(pulseSessions({ sessions: 14 })).toBe(14);
    expect(pulseSessions({ sessions: 1248, updatedAt: {} })).toBe(1248);
  });

  it("is 0 for anything that is not a count", () => {
    for (const raw of [
      null,
      undefined,
      {},
      { sessions: "14" },
      { sessions: -3 },
      { sessions: Number.NaN },
      { sessions: Number.POSITIVE_INFINITY },
    ])
      expect(pulseSessions(raw), JSON.stringify(raw)).toBe(0);
  });
});

describe("showsPulse", () => {
  it("draws the line from ten sessions up, and never for an unread day", () => {
    expect(PULSE_MIN_SESSIONS).toBe(10);
    expect(showsPulse(9)).toBe(false);
    expect(showsPulse(10)).toBe(true);
    expect(showsPulse(11)).toBe(true);
    expect(showsPulse(0)).toBe(false);
    expect(showsPulse(null)).toBe(false);
  });
});
