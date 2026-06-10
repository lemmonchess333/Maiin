import { describe, it, expect } from "vitest";
import {
  recordPartnerActivity,
  emptyStreakState,
  canAddPartner,
  partnerToNudge,
  dayDiff,
  weekKey,
  MAX_PARTNERS,
  type PartnerStreakState,
} from "../streakEngine";

const MEMBERS = ["alice", "bob"] as const;

/** Apply a sequence of [member, localDay] logs from empty state. */
function run(
  events: [string, string][],
  start: PartnerStreakState = emptyStreakState()
): PartnerStreakState {
  return events.reduce(
    (s, [m, d]) => recordPartnerActivity(s, m, d, MEMBERS),
    start
  );
}

describe("bond cap", () => {
  it("allows up to MAX_PARTNERS, then blocks", () => {
    expect(canAddPartner(0)).toBe(true);
    expect(canAddPartner(MAX_PARTNERS - 1)).toBe(true);
    expect(canAddPartner(MAX_PARTNERS)).toBe(false);
    expect(canAddPartner(MAX_PARTNERS + 3)).toBe(false);
  });
});

describe("day arithmetic is DST/UTC-proof", () => {
  it("counts whole days across a spring-forward boundary", () => {
    // UK DST 2026: clocks go forward 29 Mar. Day diff must still be 1.
    expect(dayDiff("2026-03-28", "2026-03-29")).toBe(1);
    expect(dayDiff("2026-03-29", "2026-03-30")).toBe(1);
  });
  it("week key anchors on Monday", () => {
    // 2026-06-12 is a Friday → Monday is 2026-06-08.
    expect(weekKey("2026-06-12")).toBe("2026-06-08");
    expect(weekKey("2026-06-08")).toBe("2026-06-08");
    expect(weekKey("2026-06-14")).toBe("2026-06-08"); // Sunday, same week
    expect(weekKey("2026-06-15")).toBe("2026-06-15"); // next Monday
  });
});

describe("shared-streak counting", () => {
  it("does not advance until BOTH log the same local day", () => {
    let s = run([["alice", "2026-06-10"]]);
    expect(s.streak).toBe(0);
    expect(s.lastSharedDay).toBeNull();
    s = recordPartnerActivity(s, "bob", "2026-06-10", MEMBERS);
    expect(s.streak).toBe(1);
    expect(s.lastSharedDay).toBe("2026-06-10");
  });

  it("increments over consecutive mutual days", () => {
    const s = run([
      ["alice", "2026-06-10"],
      ["bob", "2026-06-10"],
      ["bob", "2026-06-11"],
      ["alice", "2026-06-11"],
      ["alice", "2026-06-12"],
      ["bob", "2026-06-12"],
    ]);
    expect(s.streak).toBe(3);
    expect(s.lastSharedDay).toBe("2026-06-12");
  });

  it("a repeat log on the already-counted shared day is a no-op", () => {
    let s = run([
      ["alice", "2026-06-10"],
      ["bob", "2026-06-10"],
    ]);
    expect(s.streak).toBe(1);
    s = recordPartnerActivity(s, "alice", "2026-06-10", MEMBERS);
    expect(s.streak).toBe(1);
  });

  it("counts a mutual day even when partners are in different timezones", () => {
    // Both log on their OWN local 12th (e.g. UK morning, NZ evening) →
    // same calendar key → shared day. Order of arrival doesn't matter.
    const s = run([
      ["bob", "2026-06-12"], // NZ logs first (ahead in real time)
      ["alice", "2026-06-12"], // UK logs later, still their local 12th
    ]);
    expect(s.streak).toBe(1);
    expect(s.lastSharedDay).toBe("2026-06-12");
  });
});

describe("freeze: one per partner per week, auto-applied", () => {
  it("bridges a single missed day with a freeze, preserving the streak", () => {
    // Mutual day 10 (streak 1), then BOTH skip 11, both log 12 (gap 2).
    const s = run([
      ["alice", "2026-06-10"],
      ["bob", "2026-06-10"],
      ["alice", "2026-06-12"],
      ["bob", "2026-06-12"],
    ]);
    expect(s.streak).toBe(2); // freeze bridged the gap, didn't reset
    expect(s.lastSharedDay).toBe("2026-06-12");
    // A freeze was consumed for that week.
    expect(s.freezeWeek.alice).toBe(weekKey("2026-06-12"));
  });

  it("resets to 1 once BOTH weekly freezes (one per partner) are spent", () => {
    // One freeze per partner = 2 bridges available within a week (Mon 08 –
    // Sun 14). Three gaps in that week: bridge, bridge, then RESET.
    let s = run([
      ["alice", "2026-06-08"], // Monday — mutual, streak 1
      ["bob", "2026-06-08"],
      ["alice", "2026-06-10"], // gap → alice's freeze, streak 2
      ["bob", "2026-06-10"],
      ["alice", "2026-06-12"], // gap → bob's freeze, streak 3
      ["bob", "2026-06-12"],
    ]);
    expect(s.streak).toBe(3); // both freezes bridged two gaps
    s = run(
      [
        ["alice", "2026-06-14"], // third gap, same week, no freeze left
        ["bob", "2026-06-14"],
      ],
      s
    );
    expect(s.streak).toBe(1); // reset
    expect(s.lastSharedDay).toBe("2026-06-14");
  });

  it("freeze refreshes in a new week", () => {
    let s = run([
      ["alice", "2026-06-08"],
      ["bob", "2026-06-08"],
      ["alice", "2026-06-10"], // gap in week of 08 → consume freeze
      ["bob", "2026-06-10"],
    ]);
    expect(s.streak).toBe(2);
    // Next week, a fresh gap bridges again (new week's freeze).
    s = run(
      [
        ["alice", "2026-06-17"], // week of 15 — fresh freeze
        ["bob", "2026-06-17"],
      ],
      s
    );
    expect(s.streak).toBe(3);
  });
});

describe("partnerToNudge", () => {
  it("returns the partner who hasn't logged today", () => {
    const s = run([["alice", "2026-06-12"]]);
    expect(partnerToNudge(s, MEMBERS, "2026-06-12")).toBe("bob");
  });
  it("returns null when both logged or neither logged today", () => {
    const both = run([
      ["alice", "2026-06-12"],
      ["bob", "2026-06-12"],
    ]);
    expect(partnerToNudge(both, MEMBERS, "2026-06-12")).toBeNull();
    expect(partnerToNudge(emptyStreakState(), MEMBERS, "2026-06-12")).toBeNull();
  });
});
