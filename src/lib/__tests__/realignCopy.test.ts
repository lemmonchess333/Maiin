import { describe, it, expect } from "vitest";
import { realignResultMessage } from "../realignCopy";

describe("realignResultMessage", () => {
  it("below-floor → the fixed honest finish-safely line (names the risk, no PR promise)", () => {
    const msg = realignResultMessage({
      timing: "below-floor",
      distance: "marathon",
      totalWeeks: 3,
    });
    expect(msg).toMatch(/finish-safely/i);
    expect(msg).toMatch(/all easy/i);
    expect(msg).toMatch(/marathon/);
    expect(msg).toMatch(/not to PR/i); // honest: finish, don't expect a PR
  });

  it("compressible → tighter-build copy with the week count", () => {
    const msg = realignResultMessage({
      timing: "compressible",
      distance: "half",
      totalWeeks: 5,
    });
    expect(msg).toMatch(/realigned/i);
    expect(msg).toMatch(/5 weeks/);
    expect(msg).toMatch(/half marathon/);
  });

  it("healthy → plain realigned-to-today copy with the week count", () => {
    const msg = realignResultMessage({
      timing: "healthy",
      distance: "10k",
      totalWeeks: 14,
    });
    expect(msg).toMatch(/realigned to today/i);
    expect(msg).toMatch(/14 weeks/);
    expect(msg).toMatch(/10K/);
  });

  it("uses display labels (5K / 10K / half marathon / marathon)", () => {
    expect(
      realignResultMessage({ timing: "healthy", distance: "5k", totalWeeks: 4 })
    ).toMatch(/5K/);
    expect(
      realignResultMessage({ timing: "healthy", distance: "half", totalWeeks: 8 })
    ).toMatch(/half marathon/);
  });
});
