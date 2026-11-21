import { describe, expect, it } from "vitest";
import type { FeatureResult } from "./drive";
import { isNoise } from "./drive";
import { renderReport, summarise } from "./report";

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
});
