import { describe, it, expect } from "vitest";
import {
  FIRST_SET_BODY_NO_AUTO_REST,
  GUIDE_HINTS,
  guideAllowed,
  hintDue,
  hintSeenKey,
} from "../firstGuide";

describe("guideAllowed", () => {
  it("shows for people and stays away from automation", () => {
    expect(guideAllowed({ webdriver: false }, null)).toBe(true);
    expect(guideAllowed(undefined, null)).toBe(true);
    expect(guideAllowed({ webdriver: true }, null)).toBe(false);
  });

  it("shows under automation only when a capture spec turns it on", () => {
    expect(guideAllowed({ webdriver: true }, "on")).toBe(true);
    expect(guideAllowed({ webdriver: true }, "1")).toBe(false);
  });
});

describe("hintDue", () => {
  const due = { allowed: true, owed: true, closed: false };

  it("is due when the account is owed the hint", () => {
    expect(hintDue(due)).toBe(true);
  });

  it("isn't due once closed, where the guide can't show, or once seen", () => {
    expect(hintDue({ ...due, closed: true })).toBe(false);
    expect(hintDue({ ...due, allowed: false })).toBe(false);
    expect(hintDue({ ...due, owed: false })).toBe(false);
  });
});

describe("the guide's words", () => {
  const every = [
    ...Object.values(GUIDE_HINTS),
    { title: "", body: FIRST_SET_BODY_NO_AUTO_REST },
  ];

  it("are in the house voice: no cheer, and the app never says I", () => {
    for (const { title, body } of every) {
      expect(`${title} ${body}`).not.toMatch(/!/);
      expect(`${title} ${body}`).not.toMatch(/\bI(’|')?(m|ll)?\b/);
    }
  });

  // Lift4: the starting weights are an estimate, and the first set is the
  // one place that says so, with or without the automatic rest timer.
  it("calls starting weights estimates and explains how to choose a safe load", () => {
    for (const body of [
      GUIDE_HINTS["first-set"].body,
      FIRST_SET_BODY_NO_AUTO_REST,
    ])
      expect(body).toContain(
        "Weights are estimates. Start light: use a weight you can control for every rep, with a few more left."
      );
  });

  it("keys each hint's seen flag by the hint", () => {
    expect(hintSeenKey("first-set")).toBe("tropos-guide-hint:first-set");
  });
});
