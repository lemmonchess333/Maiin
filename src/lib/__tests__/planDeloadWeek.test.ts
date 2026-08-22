/**
 * The run half of a PI-suggested deload: every scheduled run steps down
 * one rung on its own ladder.
 *
 * The design was reached by stress-testing two earlier answers to death,
 * and the tests here pin what survived rather than the mechanism alone:
 *
 *   1. NOT a flat percentage. The P1d lock words this as "reduce long run
 *      volume by 25%", and the running evidence handoff's non-adoptions
 *      forbid "a universal taper duration/percentage". A rung is a step in
 *      the plan's own vocabulary, so the reduction is whatever the plan's
 *      spacing already says.
 *   2. NOT the shipped ease-week swap. That converts quality to `easy_30`,
 *      which is right when the athlete taps "I'm struggling" and wrong for
 *      an algorithmic deload — it deletes the week's intensity family and,
 *      mid-build, its specificity. A tempo must stay a tempo.
 *
 * The ladder-integrity tests exist because the tables are hand-ordered.
 * Derivation from RUN_TEMPLATES is not available (nothing in a template
 * encodes its rung), so the tables are pinned against the real catalogue
 * instead: every id must exist, and a ladder may not mix families.
 */
import { describe, it, expect } from "vitest";
import {
  DELOAD_LADDERS,
  planDeloadWeek,
  stepDownOneRung,
} from "../planDeloadWeek";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "@/features/program/programTypes";

function day(
  over: Partial<ScheduledRunDay> & { templateId: string }
): ScheduledRunDay {
  return {
    id: `rd-${over.templateId}-${over.dayIndex ?? 1}`,
    dayIndex: 1,
    type: "easy",
    status: "planned",
    date: "2026-08-12",
    ...over,
  } as ScheduledRunDay;
}

const TODAY = "2026-08-10";

describe("DELOAD_LADDERS — integrity against the real catalogue", () => {
  it("every laddered id is a real template", () => {
    const known = new Set(RUN_TEMPLATES.map((t) => t.id));
    const missing = DELOAD_LADDERS.flat().filter((id) => !known.has(id));
    expect(missing, `unknown template ids in a ladder: ${missing}`).toEqual([]);
  });

  it("a ladder never mixes session families", () => {
    // A ladder that spanned two types would silently convert one kind of
    // session into another — the exact failure of the ease-week swap this
    // mechanism was chosen over.
    for (const ladder of DELOAD_LADDERS) {
      const types = new Set(
        ladder.map((id) => RUN_TEMPLATES.find((t) => t.id === id)?.type)
      );
      expect(
        types.size,
        `ladder ${ladder.join(" < ")} spans ${[...types]}`
      ).toBe(1);
    }
  });

  it("no race template is on any ladder", () => {
    // Race identity is immutable. Absence from the ladders is the first of
    // two guards; the server's own refusal is the second.
    const raceIds = RUN_TEMPLATES.filter((t) => t.type === "race").map(
      (t) => t.id
    );
    const laddered = new Set(DELOAD_LADDERS.flat());
    for (const id of raceIds) expect(laddered.has(id)).toBe(false);
  });

  it("no id appears on two ladders", () => {
    const all = DELOAD_LADDERS.flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("stepDownOneRung", () => {
  it("steps down within the family, keeping what the session IS", () => {
    expect(stepDownOneRung("tempo_40")).toBe("tempo_30");
    expect(stepDownOneRung("6x1k")).toBe("5x1k");
    expect(stepDownOneRung("long_20k")).toBe("long_15k");
    expect(stepDownOneRung("easy_50")).toBe("easy_40");
  });

  it("keeps strides sessions on the strides ladder", () => {
    // The strides ARE the session's purpose; dropping to a plain easy run
    // would be a family change wearing a dose change's clothes.
    expect(stepDownOneRung("easy_40_strides")).toBe("easy_30_strides");
  });

  it("returns null at a floor — nothing below is worth inventing", () => {
    expect(stepDownOneRung("tempo_20")).toBeNull();
    expect(stepDownOneRung("4x1k")).toBeNull();
    expect(stepDownOneRung("long_6k")).toBeNull();
    expect(stepDownOneRung("easy_30")).toBeNull();
    expect(stepDownOneRung("easy_30_strides")).toBeNull();
  });

  it("leaves 8x400 alone — it is a different stimulus, not a smaller one", () => {
    // Already the lowest-volume interval session (3.2 km of work vs 4 km),
    // and stepping 4x1k onto it would change rep length 1 km → 400 m.
    expect(stepDownOneRung("8x400")).toBeNull();
    expect(DELOAD_LADDERS.flat()).not.toContain("8x400");
  });

  it("returns null for races and unknown ids", () => {
    expect(stepDownOneRung("marathon_race")).toBeNull();
    expect(stepDownOneRung("5k_race")).toBeNull();
    expect(stepDownOneRung("not_a_template")).toBeNull();
  });
});

describe("planDeloadWeek", () => {
  it("steps every eligible run down one rung", () => {
    const swaps = planDeloadWeek(
      [
        day({ templateId: "tempo_40", dayIndex: 2 }),
        day({ templateId: "6x1k", dayIndex: 3 }),
        day({ templateId: "long_20k", dayIndex: 6 }),
      ],
      TODAY
    );
    expect(swaps.map((s) => [s.fromTemplateId, s.toTemplateId])).toEqual([
      ["tempo_40", "tempo_30"],
      ["6x1k", "5x1k"],
      ["long_20k", "long_15k"],
    ]);
  });

  it("preserves the session family on every swap — the whole point", () => {
    // Asserted structurally rather than by listing pairs, so a future
    // ladder edit that mixed families fails HERE and not only in the
    // integrity test above.
    const swaps = planDeloadWeek(
      [
        day({ templateId: "tempo_40", dayIndex: 2 }),
        day({ templateId: "6x1k", dayIndex: 3 }),
        day({ templateId: "long_25k", dayIndex: 6 }),
        day({ templateId: "easy_50", dayIndex: 1 }),
      ],
      TODAY
    );
    expect(swaps).toHaveLength(4);
    for (const s of swaps) {
      const from = RUN_TEMPLATES.find((t) => t.id === s.fromTemplateId);
      const to = RUN_TEMPLATES.find((t) => t.id === s.toTemplateId);
      expect(to!.type, `${s.fromTemplateId} → ${s.toTemplateId}`).toBe(
        from!.type
      );
      // And never the ease-week's destination.
      expect(s.toTemplateId).not.toBe("easy_30");
    }
  });

  it("skips floors rather than emitting a no-op swap", () => {
    const swaps = planDeloadWeek(
      [
        day({ templateId: "tempo_20", dayIndex: 2 }),
        day({ templateId: "long_6k", dayIndex: 6 }),
        day({ templateId: "long_15k", dayIndex: 3 }),
      ],
      TODAY
    );
    expect(swaps.map((s) => s.fromTemplateId)).toEqual(["long_15k"]);
  });

  it("never touches a race day", () => {
    const swaps = planDeloadWeek(
      [
        day({ templateId: "marathon_race", type: "race", dayIndex: 6 }),
        day({ templateId: "tempo_30", dayIndex: 2 }),
      ],
      TODAY
    );
    expect(swaps.map((s) => s.fromTemplateId)).toEqual(["tempo_30"]);
  });

  it("leaves the past alone — completed work is a fact, not a prescription", () => {
    const swaps = planDeloadWeek(
      [
        day({ templateId: "long_20k", dayIndex: 0, date: "2026-08-09" }),
        day({ templateId: "tempo_40", dayIndex: 2, date: "2026-08-12" }),
      ],
      TODAY
    );
    expect(swaps.map((s) => s.fromTemplateId)).toEqual(["tempo_40"]);
  });

  it("skips days that are no longer startable", () => {
    const swaps = planDeloadWeek(
      [
        day({ templateId: "long_20k", dayIndex: 6, status: "completed_exact" }),
        day({ templateId: "tempo_40", dayIndex: 2, status: "skipped" }),
        day({ templateId: "6x1k", dayIndex: 3 }),
      ],
      TODAY
    );
    expect(swaps.map((s) => s.fromTemplateId)).toEqual(["6x1k"]);
  });

  it("steps down from an existing userOverride, not the original template", () => {
    // The athlete already swapped this day. The deload reduces what they
    // will actually run, and the snapshot restores their choice on undo.
    const swaps = planDeloadWeek(
      [day({ templateId: "6x1k", userOverride: "tempo_40", dayIndex: 3 })],
      TODAY
    );
    expect(swaps[0].fromTemplateId).toBe("tempo_40");
    expect(swaps[0].toTemplateId).toBe("tempo_30");
  });

  it("returns nothing for an all-floor week — a legitimate no-op", () => {
    expect(
      planDeloadWeek(
        [
          day({ templateId: "easy_30", dayIndex: 1 }),
          day({ templateId: "tempo_20", dayIndex: 3 }),
        ],
        TODAY
      )
    ).toEqual([]);
  });
});
