import { describe, it, expect } from "vitest";
import { getWeeklyAccountability } from "../weeklyAccountability";

describe("getWeeklyAccountability", () => {
  it("State A — nothing yet this week: personal goal, no social proof", () => {
    const a = getWeeklyAccountability({
      myWeeklyCount: 0,
      target: 2,
    });
    expect(a.title).toBe("Train twice this week");
    expect(a.ctaLabel).toBe("Start today’s session");
    expect(a.ctaTo).toBe("/program");
    expect(a.goalMet).toBe(false);
    // Cold-start must NOT claim social activity.
    expect(a.title).not.toMatch(/follow|crew|people/i);
  });

  it("State A — non-2 target reads grammatically", () => {
    const a = getWeeklyAccountability({
      myWeeklyCount: 0,
      target: 4,
    });
    expect(a.title).toBe("Train 4 times this week");
  });

  it("a week with nothing in it is the personal goal, whoever else trained", () => {
    /* Until 11 November 2026 a count of followed people who had trained
       ("3 people you follow trained this week") took this state. It was
       read from the friends board and went with it (Trim1 call 3(a)). */
    const a = getWeeklyAccountability({ myWeeklyCount: 0, target: 2 });
    expect(`${a.title} ${a.sub}`).not.toMatch(
      /follow|people|person|join them/i
    );
    expect(a.ctaLabel).toBe("Start today’s session");
  });

  it("State C′ — on the board, short of target: the count, plainly", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 1,
      target: 2,
    });
    expect(c.title).toBe("You’re on the board");
    expect(c.sub).toBe("1 of 2 sessions this week.");
    expect(c.ctaLabel).toBe("Do today’s session");
    expect(c.goalMet).toBe(false);
  });

  it("State C — goal met: celebrate + view progress (success tone)", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 2,
      target: 2,
    });
    expect(c.title).toBe("You’ve hit your 2-session week");
    expect(c.ctaLabel).toBe("View progress");
    expect(c.ctaTo).toBe("/history");
    expect(c.goalMet).toBe(true);
  });

  it("C′ never says 'one more' when more than one is needed", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 1,
      target: 4,
    });
    expect(c.sub).toBe("1 of 4 sessions this week.");
  });

  it("no line closes on a pep-talk tail (house voice)", () => {
    const states = [
      { myWeeklyCount: 0, target: 2 },
      { myWeeklyCount: 1, target: 2 },
      { myWeeklyCount: 3, target: 2 },
    ];
    for (const input of states) {
      const { title, sub } = getWeeklyAccountability(input);
      expect(`${title} ${sub}`).not.toMatch(/alive|consistency|strong week|!/i);
    }
  });

  it("goal met says the count, singular when it is one", () => {
    expect(getWeeklyAccountability({ myWeeklyCount: 1, target: 1 }).sub).toBe(
      "1 session this week."
    );
    expect(getWeeklyAccountability({ myWeeklyCount: 3, target: 2 }).sub).toBe(
      "3 sessions this week."
    );
  });

  it("past the target is still the goal met", () => {
    const c = getWeeklyAccountability({
      myWeeklyCount: 5,
      target: 2,
    });
    expect(c.goalMet).toBe(true);
    expect(c.title).toMatch(/hit your/);
  });
});

/* Together pass: the week's challenge, not joined yet. Its Join button sits
   under this text, so the text names the challenge and counts the week;
   it never says the week is done. */
describe("a weekly challenge not joined yet", () => {
  const unjoined = { name: "Weekly Warrior" };
  it("names the challenge and the week's count", () => {
    expect(
      getWeeklyAccountability({
        myWeeklyCount: 0,
        target: 2,
        unjoined,
      })
    ).toMatchObject({
      title: "Weekly Warrior",
      sub: "Train 2 times this week.",
    });
    expect(
      getWeeklyAccountability({
        myWeeklyCount: 1,
        target: 2,
        unjoined,
      }).sub
    ).toBe("1 of 2 sessions this week.");
  });

  it("never says the week is done above Join", () => {
    const shown = getWeeklyAccountability({
      myWeeklyCount: 3,
      target: 2,
      unjoined,
    });
    expect(shown.title).toBe("Weekly Warrior");
    expect(shown.sub).toBe("3 sessions this week.");
    expect(`${shown.title} ${shown.sub}`).not.toMatch(/hit|done/i);
    expect(shown.goalMet).toBe(false);
  });
});
