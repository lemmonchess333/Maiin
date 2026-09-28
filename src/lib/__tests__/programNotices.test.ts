import { describe, it, expect } from "vitest";
import {
  deloadDismissKey,
  pickLiftAdvice,
  recoveryDismissKey,
} from "../programNotices";

const none = { recovery: false, deload: false, easier: false };

describe("pickLiftAdvice — one advice notice at a time", () => {
  it("shows nothing when nothing applies", () => {
    expect(pickLiftAdvice(none)).toBeNull();
  });

  it("puts what the plan already did ahead of what it recommends", () => {
    expect(pickLiftAdvice({ recovery: true, deload: true, easier: true })).toBe(
      "recovery"
    );
  });

  it("puts the week's recommendation ahead of today's", () => {
    // "Go easier today" is offered on the same high-load signal that
    // recommends the deload, so together they said one thing twice.
    expect(pickLiftAdvice({ ...none, deload: true, easier: true })).toBe(
      "deload"
    );
  });

  it("offers today's lighter session when nothing week-level applies", () => {
    expect(pickLiftAdvice({ ...none, easier: true })).toBe("easier");
  });
});

describe("the dismissal keys", () => {
  it("are one per week and per notice", () => {
    expect(deloadDismissKey("w3")).toBe("tropos-pgm-deload-dismissed:w3");
    expect(recoveryDismissKey("w3")).toBe("tropos-pgm-recovery-dismissed:w3");
    expect(deloadDismissKey("w3")).not.toBe(deloadDismissKey("w4"));
  });
});
