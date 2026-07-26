/**
 * Coach prompts (SOC-P2a) — the pure selection layer behind the weekly
 * space-seeding cron. Pins the contracts the I/O shell and the
 * firestore.rules allowlist rely on:
 *
 *  - deterministic doc id per space+week (the idempotency key)
 *  - Monday-anchored UTC week key (the BST lesson: no local-time drift)
 *  - the doc shape stays INSIDE the rules field allowlist + size caps
 *  - the coach author is never a plausible real uid
 *  - rotation actually varies prompts across weeks AND across spaces
 */
import { describe, it, expect } from "vitest";
import {
  SPACE_IDS,
  RACE_SPACE_IDS,
  COACH_AUTHOR,
  INTEREST_PROMPTS,
  RACE_PROMPTS,
  coachWeekKey,
  selectPrompt,
  buildCoachPost,
} from "../lib/coachPrompts.js";

describe("coachWeekKey — Monday-anchored UTC", () => {
  it("maps every day of a week to that week's Monday", () => {
    // 2026-07-20 was a Monday.
    for (let d = 20; d <= 26; d++) {
      expect(coachWeekKey(new Date(`2026-07-${d}T10:00:00Z`))).toBe(
        "2026-07-20"
      );
    }
  });

  it("a Monday maps to itself, even at 00:00 UTC", () => {
    expect(coachWeekKey(new Date("2026-07-20T00:00:00Z"))).toBe("2026-07-20");
  });

  it("Sunday belongs to the PRECEDING Monday (no Sunday-anchor drift)", () => {
    expect(coachWeekKey(new Date("2026-07-19T23:59:59Z"))).toBe("2026-07-13");
  });
});

describe("selectPrompt — deterministic rotation", () => {
  it("is stable for the same (space, week)", () => {
    const a = selectPrompt("runners", "2026-07-20");
    const b = selectPrompt("runners", "2026-07-20");
    expect(a).toBe(b);
  });

  it("varies across consecutive weeks for one space", () => {
    const weeks = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"];
    const picks = new Set(weeks.map((w) => selectPrompt("runners", w).title));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("interest spaces draw from the interest bank, race spaces from the race bank", () => {
    expect(INTEREST_PROMPTS).toContain(selectPrompt("lifters", "2026-07-20"));
    expect(RACE_PROMPTS).toContain(
      selectPrompt("london-marathon", "2026-07-20")
    );
  });

  it("not every space shows the same prompt on the same week", () => {
    const interestIds = SPACE_IDS.filter((id) => !RACE_SPACE_IDS.has(id));
    const titles = new Set(
      interestIds.map((id) => selectPrompt(id, "2026-07-20").title)
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it("cycles the full bank over enough weeks (no dead prompts)", () => {
    const seen = new Set();
    for (let i = 0; i < INTEREST_PROMPTS.length; i++) {
      const d = new Date(Date.UTC(2026, 0, 5 + i * 7)); // consecutive Mondays
      seen.add(selectPrompt("lifters", coachWeekKey(d)).title);
    }
    expect(seen.size).toBe(INTEREST_PROMPTS.length);
  });
});

describe("buildCoachPost — doc contract", () => {
  const { docId, doc } = buildCoachPost(
    "runners",
    new Date("2026-07-22T06:00:00Z")
  );

  it("doc id is the deterministic idempotency key", () => {
    expect(docId).toBe("coach-2026-07-20");
  });

  it("carries the system author, never a plausible uid", () => {
    expect(doc.authorId).toBe(COACH_AUTHOR.authorId);
    expect(doc.authorName).toBe("Tropos Coach");
    // Firebase uids are 28 chars; "tropos-coach" can't collide.
    expect(doc.authorId.length).toBeLessThan(20);
  });

  it("stays inside the firestore.rules field allowlist", () => {
    const allowed = new Set([
      "authorId",
      "authorName",
      "authorPhotoURL",
      "title",
      "body",
      "activity",
      "photoUrl",
      "official",
      "pinned",
      "likeCount",
      "commentCount",
      "createdAt",
    ]);
    for (const key of Object.keys(doc)) {
      expect(allowed.has(key), `unexpected field ${key}`).toBe(true);
    }
  });

  it("respects the rules size caps and counter zeros", () => {
    expect(doc.official).toBe(true);
    expect(doc.likeCount).toBe(0);
    expect(doc.commentCount).toBe(0);
    expect(doc.body.length).toBeGreaterThanOrEqual(1);
    expect(doc.body.length).toBeLessThanOrEqual(4000);
    expect(doc.title.length).toBeLessThanOrEqual(120);
  });
});

describe("prompt banks — register + rules caps hold for EVERY prompt", () => {
  it.each([...INTEREST_PROMPTS, ...RACE_PROMPTS].map((p) => [p.title, p]))(
    "%s",
    (_title, p) => {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.title.length).toBeLessThanOrEqual(120);
      expect(p.body.length).toBeGreaterThan(0);
      expect(p.body.length).toBeLessThanOrEqual(4000);
      // No fabricated social proof — the honesty rule.
      expect(p.body).not.toMatch(/the community said|everyone here is/i);
    }
  );
});
