/**
 * Cross-test: the server's weekly-run-target resolution inside
 * fellBehindRatio (functions/lib/fellBehindWeek.js) must agree with the
 * client's getWeeklyRunTarget (src/lib/scheduleUtils.ts) — ADR-0008.
 *
 * The seam is three lines of `??` resolution, but it carries a landmine
 * both sides have independently stepped around: `??` (not `||`), so an
 * EXPLICIT `weeklyRunDaysTarget: 0` — a zeroed taper week — is
 * authoritative and must NOT fall back to the legacy `weeklyRunsTarget`.
 * The server comment says "to mirror getWeeklyRunTarget"; until this file
 * nothing executable held the two together. Exercised through the real
 * entry point (fellBehindRatio) rather than a private expression:
 * server-null ⇔ client-target < 1, else the resolved targets are equal.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { getWeeklyRunTarget } from "../scheduleUtils";

const require_ = createRequire(import.meta.url);
const { fellBehindRatio } = require_(
  "../../../functions/lib/fellBehindWeek"
) as {
  fellBehindRatio: (
    profile: Record<string, unknown> | null,
    programState: Record<string, unknown> | null,
    priorWeekRuns: unknown[]
  ) => { weeklyTarget: number } | null;
};

/** Race-prep profile so the resolution gate is actually reached
 *  (freeform short-circuits before it). */
const prof = (fields: Record<string, unknown>) => ({
  runMode: "race_prep",
  ...fields,
});

const GRID: Record<string, unknown>[] = [
  { weeklyRunDaysTarget: 0, weeklyRunsTarget: 4 }, // explicit 0 wins — the ?? landmine
  { weeklyRunDaysTarget: 2, weeklyRunsTarget: 5 }, // new field wins
  { weeklyRunsTarget: 3 }, // legacy fallback
  { weeklyRunDaysTarget: 4 }, // new field alone
  {}, // neither → 0
];

describe("server weekly-target resolution ≡ client getWeeklyRunTarget", () => {
  it("agrees across the resolution grid, including the explicit-zero landmine", () => {
    for (const fields of GRID) {
      const clientTarget = getWeeklyRunTarget(
        fields as Parameters<typeof getWeeklyRunTarget>[0]
      );
      const server = fellBehindRatio(prof(fields), {}, []);
      const label = JSON.stringify(fields);
      if (clientTarget < 1) {
        // Server expresses "no usable target" as null — same verdict.
        expect(server, label).toBeNull();
      } else {
        expect(server?.weeklyTarget, label).toBe(clientTarget);
      }
    }
  });

  it("the explicit-zero row is null because of the ZERO, not the gates", () => {
    // Guard against passing for the wrong reason: the same profile with a
    // real target flows through, so the null above is the ?? semantics.
    expect(
      fellBehindRatio(prof({ weeklyRunDaysTarget: 3 }), {}, [])?.weeklyTarget
    ).toBe(3);
  });
});
