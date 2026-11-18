import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs module is outside the TS app project.
import { readStamps, summarise } from "./stamps.mjs";

describe("readStamps", () => {
  it("reads a branch commit's trailers", () => {
    const body = [
      "Title",
      "",
      "Body.",
      "",
      "Verified: unit, types",
      "Verify-gate: observe(base) would-block; seen: unit, types",
      "Co-Authored-By: Claude <noreply@anthropic.com>",
    ].join("\n");
    expect(readStamps(body)).toEqual({
      status: "verified",
      methods: ["unit", "types"],
      nones: 0,
      gates: ["observe(base) would-block; seen: unit, types"],
    });
  });

  it("reads every stamp in a squash merge's body, where they sit mid-message", () => {
    const body = [
      "Feature (#1)",
      "",
      "* First commit",
      "",
      "Verified: verify(home), unit",
      "",
      "* Docs",
      "",
      "Verified: none (docs only)",
    ].join("\n");
    const stamps = readStamps(body);
    expect(stamps.status).toBe("partly verified");
    expect(stamps.methods).toEqual(["verify", "unit"]);
    expect(stamps.nones).toBe(1);
  });

  it("tells none apart from unstamped", () => {
    expect(readStamps("x\n\nVerified: none (unexplained)").status).toBe("none");
    expect(readStamps("x\n\nCo-Authored-By: A <a@b>").status).toBe("unstamped");
  });
});

describe("summarise", () => {
  it("counts each kind and the commits the gate would have blocked", () => {
    const rows = [
      readStamps(
        "a\n\nVerified: unit\nVerify-gate: observe(base) would-block; seen: unit"
      ),
      readStamps(
        "b\n\nVerified: review\nVerify-gate: observe(base) pass; seen: review"
      ),
      readStamps("c\n\nVerified: none (copy)"),
      readStamps("d"),
    ];
    expect(summarise(rows)).toEqual({
      total: 4,
      verified: 2,
      "partly verified": 0,
      none: 1,
      unstamped: 1,
      wouldBlock: 1,
    });
  });
});
