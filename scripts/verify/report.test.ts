import { describe, expect, it } from "vitest";
import type { FeatureResult, PageProblem } from "./drive";
import { isNoise, judge } from "./drive";
import { renderReport, summarise } from "./report";

/* A card on Home that throws: React's SectionErrorBoundary catches it and
   draws its fallback in the card's place, so the rest of Home (the tab
   bar, Add water, Start workout, the heading) still stands and every step
   of `home` passes. What is left is the fallback on screen and, in a
   production build, the error React logs; neither is a step. */
const homeCardThrew = {
  errorCard: "This section couldn’t load. Retry",
  problems: [
    {
      kind: "console.error",
      text: "TypeError: Cannot read properties of undefined (reading 'kcal')",
      url: "http://127.0.0.1:4173/Maiin/",
      noise: false,
    },
  ] satisfies PageProblem[],
};

describe("judge: a feature's verdict", () => {
  it("fails home when a card throws, though every step passed", () => {
    const v = judge(homeCardThrew);
    expect(v.verdict).toBe("fail");
    expect(v.reason).toMatch(/error card .*This section couldn’t load/);
  });

  it("fails on an uncaught exception that is not noise", () => {
    const v = judge({
      problems: [
        {
          kind: "pageerror",
          text: "ReferenceError: weekKey is not defined\n    at Home",
          url: "http://127.0.0.1:4173/Maiin/",
          noise: false,
        },
      ],
    });
    expect(v).toEqual({
      verdict: "fail",
      reason:
        "the page threw: ReferenceError: weekKey is not defined " +
        "(at http://127.0.0.1:4173/Maiin/)",
    });
  });

  it("passes with only noise and console errors, which it reports, not judges", () => {
    expect(
      judge({
        problems: [
          { kind: "pageerror", text: "x", url: "/", noise: true },
          { kind: "console.error", text: "y", url: "/", noise: false },
        ],
      })
    ).toEqual({ verdict: "pass" });
  });

  it("names the failed step first, whatever else happened", () => {
    const v = judge({
      ...homeCardThrew,
      failedStep: {
        n: 3,
        action: "see",
        target: "role=button",
        error: "Timeout",
      },
    });
    expect(v.reason).toBe("step 3 (see role=button): Timeout");
  });
});

const r = (
  id: string,
  verdict: FeatureResult["verdict"],
  round = 1,
  problems: FeatureResult["problems"] = []
): FeatureResult => ({
  id,
  title: id,
  expected: "what it shows",
  round,
  verdict,
  reason: verdict === "pass" ? undefined : "why",
  ms: 10,
  steps: [],
  problems,
});

describe("summarise", () => {
  it("passes only when every feature passed", () => {
    const s = summarise([r("a", "pass"), r("b", "pass")]);
    expect(s.verdict).toBe("pass");
    expect(s.exitCode).toBe(0);
  });

  it("never counts a feature that did not run as a pass", () => {
    const s = summarise([r("a", "pass"), r("b", "not-run")]);
    expect(s.verdict).toBe("incomplete");
    expect(s.exitCode).toBe(2);
    expect(s.passed).toEqual(["a"]);
    expect(s.notRun).toEqual(["b"]);
  });

  it("fails on any failure, over a not-run", () => {
    const s = summarise([r("a", "fail"), r("b", "not-run")]);
    expect(s.verdict).toBe("fail");
    expect(s.exitCode).toBe(1);
  });

  it("calls a verdict that moved between rounds flaky, and fails the run", () => {
    const s = summarise([r("a", "pass", 1), r("a", "fail", 2), r("b", "pass")]);
    expect(s.flaky).toEqual(["a"]);
    expect(s.failed).toEqual(["a"]);
    expect(s.verdict).toBe("fail");
    expect(s.rounds).toBe(2);
  });

  it("is incomplete, not a pass, when nothing ran at all", () => {
    expect(summarise([]).verdict).toBe("incomplete");
  });

  it("counts page errors that are not environment noise", () => {
    const s = summarise([
      r("a", "pass", 1, [
        { kind: "pageerror", text: "x is undefined", url: "/", noise: false },
        { kind: "console.error", text: "blocked", url: "/", noise: true },
      ]),
    ]);
    expect(s.problems).toBe(1);
  });
});

describe("renderReport", () => {
  it("says an incomplete run is not a pass and carries the diagnosis", () => {
    const results = [r("a", "pass"), r("b", "not-run")];
    const md = renderReport(results, summarise(results), {
      base: "http://127.0.0.1:4173/Maiin/",
      build: "abc",
      firestore: false,
      diagnosis: "storage.googleapis.com was blocked",
      timings: { build: 1000 },
    });
    expect(md).toMatch(/^# Verify: INCOMPLETE/);
    expect(md).toContain("Incomplete is not a pass");
    expect(md).toContain("storage.googleapis.com was blocked");
    expect(md).toContain("Expected: what it shows");
  });
});

describe("isNoise", () => {
  it("never calls a failure on the app's own server noise", () => {
    expect(
      isNoise(
        "Failed to load resource: 404",
        "http://127.0.0.1:4173/Maiin/sw.js"
      )
    ).toBe(false);
  });
  it("calls blocked Google hosts and the favicon noise", () => {
    expect(isNoise("net::ERR_TUNNEL_CONNECTION_FAILED", undefined)).toBe(true);
    expect(
      isNoise("x", "https://firebaseinstallations.googleapis.com/v1/x")
    ).toBe(true);
    expect(isNoise("404", "http://127.0.0.1:4173/favicon.ico")).toBe(true);
  });
  it("keeps an app exception as a real problem", () => {
    expect(isNoise("Cannot read properties of undefined", undefined)).toBe(
      false
    );
  });
  it("calls the emulators the rig does not run (Functions, Storage) its limit", () => {
    expect(
      isNoise("net::ERR_CONNECTION_REFUSED", "http://127.0.0.1:5001/sw.js")
    ).toBe(true);
    expect(
      isNoise("net::ERR_CONNECTION_REFUSED", "http://localhost:9199/sw.js")
    ).toBe(true);
    expect(
      isNoise("FirebaseError: fetch to 127.0.0.1:5001 refused", undefined)
    ).toBe(true);
  });
  it("never calls the Auth or Firestore emulator noise: the rig runs them", () => {
    expect(isNoise("refused", "http://127.0.0.1:9099/sw.js")).toBe(false);
    expect(isNoise("refused", "http://127.0.0.1:8080/sw.js")).toBe(false);
  });
});

describe("the report's later rounds", () => {
  it("shows a round that went differently, not only round 1", () => {
    const results = [
      r("a", "pass", 1),
      { ...r("a", "fail", 2), reason: "step 2 timed out" },
      r("a", "pass", 3),
    ];
    const md = renderReport(results, summarise(results), {
      base: "x",
      build: "abc",
      firestore: true,
      timings: {},
    });
    expect(md).toContain("## Later rounds that did not pass");
    expect(md).toContain("### a, round 2: a");
    expect(md).toContain("step 2 timed out");
    expect(md).not.toContain("### a, round 3");
  });
});
