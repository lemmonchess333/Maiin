import { describe, it, expect } from "vitest";
import { planEasierWeek, EASY_TEMPLATE_ID } from "../adjustWeek";
import type { ScheduledRunDay } from "@/features/program/programTypes";

/* Run13 (RUN-02) — the "take it easier" planner. Only THIS week's remaining,
 * still-planned QUALITY days ease to easy_30; race day, easy days, completed/
 * skipped days, and past days never move. */

const TODAY = "2026-07-10";

function day(over: Partial<ScheduledRunDay>): ScheduledRunDay {
  return {
    id:
      over.id ??
      `rd-${Math.abs(JSON.stringify(over).length)}-${over.templateId}`,
    dayIndex: 2,
    templateId: "tempo_20",
    date: "2026-07-11",
    completed: false,
    ...over,
  } as ScheduledRunDay;
}

describe("planEasierWeek", () => {
  it("eases remaining planned quality days to easy_30", () => {
    const swaps = planEasierWeek(
      [
        day({ id: "a", templateId: "tempo_20", date: "2026-07-11" }),
        day({ id: "b", templateId: "long_10k", date: "2026-07-12" }),
      ],
      TODAY
    );
    expect(swaps.map((s) => s.key)).toEqual(["a", "b"]);
    expect(swaps.every((s) => s.toTemplateId === EASY_TEMPLATE_ID)).toBe(true);
  });

  it("NEVER touches race day (type-based, not id matching)", () => {
    const swaps = planEasierWeek(
      [day({ id: "race", templateId: "5k_race", date: "2026-07-12" })],
      TODAY
    );
    expect(swaps).toEqual([]);
  });

  it("leaves easy days, completed days, and skipped days alone", () => {
    const swaps = planEasierWeek(
      [
        day({ id: "e", templateId: "easy_30" }),
        day({ id: "c", templateId: "tempo_20", status: "completed_exact" }),
        day({ id: "s", templateId: "long_10k", status: "skipped" }),
      ] as ScheduledRunDay[],
      TODAY
    );
    expect(swaps).toEqual([]);
  });

  it("leaves PAST days alone (history is the server's business)", () => {
    const swaps = planEasierWeek(
      [day({ id: "p", templateId: "tempo_20", date: "2026-07-08" })],
      TODAY
    );
    expect(swaps).toEqual([]);
  });

  it("today itself is still adjustable", () => {
    const swaps = planEasierWeek(
      [day({ id: "t", templateId: "tempo_20", date: TODAY })],
      TODAY
    );
    expect(swaps.map((s) => s.key)).toEqual(["t"]);
  });

  it("respects a userOverride when resolving the current template", () => {
    // Planned as tempo but the user already swapped it to easy → nothing to do.
    const swaps = planEasierWeek(
      [day({ id: "o", templateId: "tempo_20", userOverride: "easy_30" })],
      TODAY
    );
    expect(swaps).toEqual([]);
  });

  it("falls back to dayIndex as the key for legacy days without an id", () => {
    const swaps = planEasierWeek(
      [day({ id: undefined, dayIndex: 4, templateId: "long_10k" })],
      TODAY
    );
    expect(swaps.map((s) => s.key)).toEqual([4]);
  });
});
