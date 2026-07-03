import { describe, it, expect } from "vitest";
import {
  selectFreshInsight,
  recordInsightShown,
  isCoolingDown,
  pruneLedger,
  MAX_CONSECUTIVE_DAYS,
  COOLDOWN_DAYS,
  type InsightLedger,
} from "../insightFreshness";

const A = { id: "protein-low", priority: 3 };
const B = { id: "calorie-inconsistent", priority: 2 };
const C = { id: "protein-consistent", priority: 1 };

describe("selectFreshInsight", () => {
  it("shows the top insight when nothing is cooling down", () => {
    expect(selectFreshInsight([A, B, C], {}, "2026-07-03")).toBe(A);
  });

  it("rotates to the next insight once the top one exhausts its consecutive days", () => {
    let ledger: InsightLedger = {};
    ledger = recordInsightShown(ledger, A.id, "2026-07-01");
    ledger = recordInsightShown(ledger, A.id, "2026-07-02");
    // Day 3: A has held the slot MAX_CONSECUTIVE_DAYS days → cooldown.
    expect(selectFreshInsight([A, B, C], ledger, "2026-07-03")).toBe(B);
  });

  it("goes SILENT (null) when every candidate is cooling down — silence beats nagging", () => {
    let ledger: InsightLedger = {};
    for (const day of ["2026-07-01", "2026-07-02"]) {
      ledger = recordInsightShown(ledger, A.id, day);
    }
    for (const day of ["2026-07-03", "2026-07-04"]) {
      ledger = recordInsightShown(ledger, B.id, day);
    }
    for (const day of ["2026-07-05", "2026-07-06"]) {
      ledger = recordInsightShown(ledger, C.id, day);
    }
    // 07-06: A cooling (day 4 of 5), B cooling (day 2), C cooling (just
    // exhausted its 2 days) → silence. (On 07-07 A releases — see the
    // release test below.)
    expect(selectFreshInsight([A, B, C], ledger, "2026-07-06")).toBeNull();
  });

  it("releases an insight after its cooldown elapses", () => {
    let ledger: InsightLedger = {};
    ledger = recordInsightShown(ledger, A.id, "2026-07-01");
    ledger = recordInsightShown(ledger, A.id, "2026-07-02");
    const afterCooldown = `2026-07-0${2 + COOLDOWN_DAYS}`; // 07-07
    expect(selectFreshInsight([A, B], ledger, afterCooldown)).toBe(A);
  });
});

describe("recordInsightShown", () => {
  it("increments consecutive days only on adjacent days; a gap resets", () => {
    let ledger: InsightLedger = {};
    ledger = recordInsightShown(ledger, A.id, "2026-07-01");
    ledger = recordInsightShown(ledger, A.id, "2026-07-02");
    expect(ledger[A.id].consecutiveDays).toBe(2);
    // Gap (cooldown passed) → streak resets to 1.
    ledger = recordInsightShown(ledger, A.id, "2026-07-10");
    expect(ledger[A.id].consecutiveDays).toBe(1);
  });

  it("is idempotent within a day (re-renders don't inflate the streak)", () => {
    let ledger: InsightLedger = {};
    ledger = recordInsightShown(ledger, A.id, "2026-07-01");
    const again = recordInsightShown(ledger, A.id, "2026-07-01");
    expect(again).toBe(ledger);
    expect(again[A.id].consecutiveDays).toBe(1);
  });
});

describe("isCoolingDown boundaries", () => {
  it(`needs ${MAX_CONSECUTIVE_DAYS} consecutive days to trigger`, () => {
    expect(
      isCoolingDown({ lastShown: "2026-07-02", consecutiveDays: 1 }, "2026-07-03")
    ).toBe(false);
    expect(
      isCoolingDown({ lastShown: "2026-07-02", consecutiveDays: 2 }, "2026-07-03")
    ).toBe(true);
  });

  it("cooldown window is exactly COOLDOWN_DAYS", () => {
    const entry = { lastShown: "2026-07-02", consecutiveDays: 2 };
    expect(isCoolingDown(entry, "2026-07-06")).toBe(true); // day 4
    expect(isCoolingDown(entry, "2026-07-07")).toBe(false); // day 5 — released
  });
});

describe("pruneLedger", () => {
  it("drops entries older than 2× cooldown", () => {
    const ledger: InsightLedger = {
      old: { lastShown: "2026-06-01", consecutiveDays: 2 },
      fresh: { lastShown: "2026-07-01", consecutiveDays: 1 },
    };
    const pruned = pruneLedger(ledger, "2026-07-03");
    expect(pruned.old).toBeUndefined();
    expect(pruned.fresh).toBeDefined();
  });
});
