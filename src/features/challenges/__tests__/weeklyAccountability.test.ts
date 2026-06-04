import { describe, it, expect } from "vitest";
import { getWeeklyAccountability } from "../weeklyAccountability";

describe("getWeeklyAccountability", () => {
  it("State A — cold-start (no follows, nobody trained): personal goal, no fake social proof", () => {
    const a = getWeeklyAccountability({
      myWeeklyCount: 0,
      othersTrained: 0,
      target: 2,
    });
    expect(a.title).toBe("Train twice this week");
    expect(a.ctaLabel).toBe("Start today's session");
    expect(a.ctaTo).toBe("/program");
    expect(a.goalMet).toBe(false);
    // Cold-start must NOT claim social activity.
    expect(a.title).not.toMatch(/follow|crew|people/i);
  });

  it("State A — non-2 target reads grammatically", () => {
    const a = getWeeklyAccountability({
      myWeeklyCount: 0,
      othersTrained: 0,
      target: 4,
    });
    expect(a.title).toBe("Train 4 times this week");
  });

  it("State B — others trained, you haven't: real follow-graph social proof + action CTA", () => {
    const single = getWeeklyAccountability({
      myWeeklyCount: 0,
      othersTrained: 1,
      target: 2,
    });
    expect(single.title).toBe("1 person you follow trained this week");
    expect(single.ctaLabel).toBe("Do today's session");
    expect(single.ctaTo).toBe("/program");

    const many = getWeeklyAccountability({
      myWeeklyCount: 0,
      othersTrained: 3,
      target: 2,
    });
    expect(many.title).toBe("3 people you follow trained this week");
  });

  it("State C′ — on the board, short of target: nudge one more", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 1,
      othersTrained: 5,
      target: 2,
    });
    expect(c.title).toBe("You're on the board");
    expect(c.sub).toBe("1 of 2 sessions this week — one more keeps it alive.");
    expect(c.ctaLabel).toBe("Do today's session");
    expect(c.goalMet).toBe(false);
  });

  it("State C — goal met: celebrate + view progress (success tone)", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 2,
      othersTrained: 0,
      target: 2,
    });
    expect(c.title).toBe("You've hit your 2-session week");
    expect(c.ctaLabel).toBe("View progress");
    expect(c.ctaTo).toBe("/history");
    expect(c.goalMet).toBe(true);
  });

  it("my own progress takes precedence over others' (C beats B)", () => {
    // Even when many followed people trained, if I've met my target the
    // message is about ME, not the leaderboard.
    const c = getWeeklyAccountability({
      myWeeklyCount: 5,
      othersTrained: 9,
      target: 2,
    });
    expect(c.goalMet).toBe(true);
    expect(c.title).toMatch(/hit your/);
  });
});
