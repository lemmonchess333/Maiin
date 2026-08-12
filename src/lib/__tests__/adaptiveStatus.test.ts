import { describe, it, expect } from "vitest";
import {
  adaptiveCalorieStatus,
  adaptiveCalorieStatusLabel,
} from "../adaptiveStatus";

const NOW = Date.parse("2026-06-11T12:00:00.000Z");

describe("adaptiveCalorieStatus", () => {
  it("manual override always wins", () => {
    expect(
      adaptiveCalorieStatus(
        {
          customCalorieTarget: 2400,
          adaptiveCapState: { lastAppliedAt: "2026-06-10T00:00:00.000Z" },
        },
        NOW
      )
    ).toEqual({ kind: "manual" });
  });

  it("adapting when a real (non-epoch) lastAppliedAt exists — days computed", () => {
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "2026-06-08T12:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "adapting", retunedDaysAgo: 3 });
    // same-day → 0
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "2026-06-11T06:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "adapting", retunedDaysAgo: 0 });
  });

  it("formula for no capState / epoch default / invalid date / null profile", () => {
    expect(adaptiveCalorieStatus(null, NOW)).toEqual({ kind: "formula" });
    expect(adaptiveCalorieStatus({}, NOW)).toEqual({ kind: "formula" });
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "1970-01-01T00:00:00.000Z" } },
        NOW
      )
    ).toEqual({ kind: "formula" });
    expect(
      adaptiveCalorieStatus(
        { adaptiveCapState: { lastAppliedAt: "garbage" } },
        NOW
      )
    ).toEqual({ kind: "formula" });
  });

  it("labels read sensibly", () => {
    expect(adaptiveCalorieStatusLabel({ kind: "manual" })).toMatch(/Manual/);
    expect(
      adaptiveCalorieStatusLabel({ kind: "adapting", retunedDaysAgo: 0 })
    ).toMatch(/retuned today/);
    expect(
      adaptiveCalorieStatusLabel({ kind: "adapting", retunedDaysAgo: 5 })
    ).toMatch(/5d ago/);
    expect(adaptiveCalorieStatusLabel({ kind: "formula" })).toMatch(/Formula/);
  });
});

describe("adaptiveCalorieStatusLabel — the adapting line names both numbers", () => {
  /* The line sits beneath Settings → Nutrition's FORMULA figure, and read
     "Adapting — retuned 3d ago from your real intake + weight" under 2500
     while Home and Food showed 2919. It asserted the number above it was the
     adapted one; it never was.

     Settings shows the baseline on purpose — it is the plan editor, and the
     macro row beside the calories is split at that same baseline. So the fix
     names the live target rather than swapping the headline, which would
     strand the macros. */
  const adapting = { kind: "adapting", retunedDaysAgo: 3 } as const;

  it("states today's target alongside the baseline", () => {
    const label = adaptiveCalorieStatusLabel(adapting, 2919);
    expect(label).toContain("retuned 3d ago");
    expect(label).toContain("2,919");
    expect(label).toMatch(/baseline/i);
  });

  it("says 'today' rather than '0d ago'", () => {
    expect(adaptiveCalorieStatusLabel({ kind: "adapting", retunedDaysAgo: 0 }, 2919))
      .toContain("retuned today");
  });

  it("falls back to the original copy when no learned value is available", () => {
    // Callers that already render the learned number pass nothing, and must
    // not gain a redundant second copy of it.
    for (const v of [undefined, null, NaN]) {
      const label = adaptiveCalorieStatusLabel(adapting, v);
      expect(label).toBe(
        "Adapting — retuned 3d ago from your real intake + weight."
      );
    }
  });

  it("leaves the manual and formula lines alone", () => {
    // The learned value is meaningless for both — manual pauses adaptation,
    // and formula means it has never applied one.
    expect(adaptiveCalorieStatusLabel({ kind: "manual" }, 2919)).not.toContain(
      "2,919"
    );
    expect(adaptiveCalorieStatusLabel({ kind: "formula" }, 2919)).not.toContain(
      "2,919"
    );
  });
});
