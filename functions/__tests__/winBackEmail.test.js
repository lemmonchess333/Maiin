/**
 * The emails after a break (App1 Q54, Q55): day 14 and day 30 after the
 * last thing logged, each with a week to go in, then silence. The words are
 * true for every plan and carry no guilt.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const winBack = require("../lib/winBackEmail");

const UNSUBSCRIBE = "https://troposfit.com/email/unsubscribe?u=abc&t=tok";

describe("winBackStepDue", () => {
  it.each([
    [0, null],
    [13, null],
    [14, 14],
    [20, 14],
    // Day 14's week is over and day 30 is not due yet.
    [21, null],
    [29, null],
    [30, 30],
    [36, 30],
    // Then silence.
    [37, null],
    [90, null],
    [400, null],
  ])("after %i days away: %s", (days, step) => {
    expect(winBack.winBackStepDue(days, [])).toBe(step);
  });

  it("does not send a step twice", () => {
    expect(winBack.winBackStepDue(15, [14])).toBeNull();
    expect(winBack.winBackStepDue(31, [14, 30])).toBeNull();
  });

  it("sends day 30 when day 14 was never sent, and only day 30", () => {
    expect(winBack.winBackStepDue(30, [])).toBe(30);
  });

  it("is null for days that are not a whole number", () => {
    expect(winBack.winBackStepDue(null, [])).toBeNull();
    expect(winBack.winBackStepDue(14.5, [])).toBeNull();
  });
});

describe("lastLoggedMs", () => {
  it("is the later of the last session and the last meal", () => {
    expect(winBack.lastLoggedMs(1000, 2000)).toBe(2000);
    expect(winBack.lastLoggedMs(3000, null)).toBe(3000);
    expect(winBack.lastLoggedMs(null, 2000)).toBe(2000);
  });

  it("is null for someone who has never logged anything", () => {
    expect(winBack.lastLoggedMs(null, null)).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts whole days between day keys, across a clock change", () => {
    expect(winBack.daysBetween("2026-10-20", "2026-11-03")).toBe(14);
    expect(winBack.daysBetween("2026-03-20", "2026-04-19")).toBe(30);
  });
});

describe("the emails", () => {
  it.each([14, 30])(
    "day %i says what is true for every plan, and how to stop",
    (step) => {
      const email = winBack.buildWinBackEmail({
        step,
        unsubscribe: UNSUBSCRIBE,
      });
      expect(email.text).toContain("Home shows what’s next");
      expect(email.text).toContain(
        "Open Tropos: https://troposfit.com/?from=email"
      );
      expect(email.text).toContain(
        "You’re getting this because you chose emails after a break in Tropos. We send one at 2 weeks and one at a month, then none."
      );
      expect(email.text).toContain(UNSUBSCRIBE);
      expect(email.text).toContain(
        "Sent by Tropos. Questions: support@troposfit.com"
      );
      // No guilt (Q61), and no promise about how the plan eases back.
      expect(`${email.subject} ${email.text}`).not.toMatch(
        /miss(ed)?|streak|lost|behind|fail|ease|eas(y|ier) back|!/i
      );
      expect(email.html).not.toMatch(/<img/i);
    }
  );

  it("day 14 says two weeks", () => {
    const email = winBack.buildWinBackEmail({
      step: 14,
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.subject).toBe("Your plan is here when you want it");
    expect(email.text).toContain(
      "It’s been 2 weeks since you last logged a session or a meal in Tropos."
    );
  });

  it("day 30 says a month, and that it is the last", () => {
    const email = winBack.buildWinBackEmail({
      step: 30,
      unsubscribe: UNSUBSCRIBE,
    });
    expect(email.subject).toBe("Your plan is still here");
    expect(email.text).toContain(
      "It’s been a month since you last logged a session or a meal in Tropos."
    );
    expect(email.text).toContain(
      "This is the last of these emails for this break."
    );
  });
});
