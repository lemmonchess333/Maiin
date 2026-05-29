/**
 * Run9 phase-3 Slice A — completion-carry invariant.
 *
 * The load-bearing test surface for the lock's "carry status for not-yet-
 * elapsed days across regen (else the default Realign button orphans
 * completions)". Pins both facets: terminal-status re-stamp + manualCompletions
 * re-key, joined by date.
 */
import { describe, it, expect } from "vitest";
import { carryCompletionsAcrossRegen } from "../runCompletionCarry";
import type {
  ScheduledRunDay,
  ManualCompletion,
} from "@/features/program/programTypes";

function rd(over: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    id: "runday_2026-05-10_2_easy_30",
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    status: "planned",
    date: "2026-05-12",
    weekKey: "2026-05-10",
    ...over,
  };
}

const completion: ManualCompletion = {
  completedAt: 1_700_000_000_000,
} as ManualCompletion;

describe("carryCompletionsAcrossRegen — manualCompletions re-key", () => {
  it("re-keys a manual completion to the new id when templateId changes on the same date", () => {
    // Compress dropped a build/tempo day to easy → new id for the same date.
    const oldDay = rd({
      id: "runday_2026-05-10_2_tempo_40",
      templateId: "tempo_40",
      date: "2026-05-12",
    });
    const newDay = rd({
      id: "runday_2026-05-10_2_easy_30",
      templateId: "easy_30",
      date: "2026-05-12",
    });
    const out = carryCompletionsAcrossRegen([oldDay], [newDay], {
      "runday_2026-05-10_2_tempo_40": completion,
    });
    expect(out.manualCompletions["runday_2026-05-10_2_easy_30"]).toBe(
      completion
    );
    expect(
      out.manualCompletions["runday_2026-05-10_2_tempo_40"]
    ).toBeUndefined();
  });

  it("drops a manual completion when its date no longer exists in the new plan", () => {
    const oldDay = rd({
      id: "runday_2026-05-10_2_tempo_40",
      date: "2026-05-12",
    });
    const newDay = rd({ id: "runday_2026-05-10_4_easy_30", date: "2026-05-14" });
    const out = carryCompletionsAcrossRegen([oldDay], [newDay], {
      "runday_2026-05-10_2_tempo_40": completion,
    });
    expect(out.manualCompletions).toEqual({});
  });

  it("preserves an unmappable key (not present in oldRunDays) rather than dropping it", () => {
    const oldDay = rd({ id: "runday_2026-05-10_2_easy_30", date: "2026-05-12" });
    const out = carryCompletionsAcrossRegen([oldDay], [oldDay], {
      legacy_orphan_key: completion,
    });
    expect(out.manualCompletions["legacy_orphan_key"]).toBe(completion);
  });

  it("is a no-op when ids are unchanged (stable date + templateId)", () => {
    const day = rd({ id: "runday_2026-05-10_2_easy_30", date: "2026-05-12" });
    const out = carryCompletionsAcrossRegen([day], [day], {
      "runday_2026-05-10_2_easy_30": completion,
    });
    expect(out.manualCompletions).toEqual({
      "runday_2026-05-10_2_easy_30": completion,
    });
  });

  it("returns an empty map when there are no completions to carry", () => {
    const day = rd();
    expect(carryCompletionsAcrossRegen([day], [day], undefined).manualCompletions).toEqual(
      {}
    );
    expect(carryCompletionsAcrossRegen([day], [day], {}).manualCompletions).toEqual(
      {}
    );
  });
});

describe("carryCompletionsAcrossRegen — terminal status re-stamp", () => {
  it("re-stamps a terminal status onto the same-date new day even when templateId changed", () => {
    const oldDay = rd({
      id: "runday_2026-05-10_2_tempo_40",
      templateId: "tempo_40",
      date: "2026-05-12",
      status: "completed_exact",
      completed: true,
    });
    const newDay = rd({
      id: "runday_2026-05-10_2_easy_30",
      templateId: "easy_30",
      date: "2026-05-12",
      status: "planned",
      completed: false,
    });
    const [carried] = carryCompletionsAcrossRegen([oldDay], [newDay], undefined)
      .runDays;
    expect(carried.status).toBe("completed_exact");
    expect(carried.completed).toBe(true);
    // identity preserved: it's still the NEW day (new id/template), just
    // re-stamped with the prior terminal status.
    expect(carried.id).toBe("runday_2026-05-10_2_easy_30");
    expect(carried.templateId).toBe("easy_30");
  });

  it("carries skipped + race_no_show but never re-stamps a planned old day", () => {
    const skippedOld = rd({ date: "2026-05-12", status: "skipped" });
    const plannedOld = rd({ date: "2026-05-14", dayIndex: 4, status: "planned" });
    const newA = rd({
      id: "x",
      date: "2026-05-12",
      templateId: "easy_20",
      status: "planned",
    });
    const newB = rd({
      id: "y",
      date: "2026-05-14",
      dayIndex: 4,
      templateId: "easy_20",
      status: "planned",
    });
    const { runDays } = carryCompletionsAcrossRegen(
      [skippedOld, plannedOld],
      [newA, newB],
      undefined
    );
    expect(runDays[0].status).toBe("skipped"); // terminal → carried
    expect(runDays[1].status).toBe("planned"); // planned old → left planned
  });

  it("leaves a new day untouched when no old day shares its date", () => {
    const oldDay = rd({ date: "2026-05-12", status: "completed_exact" });
    const newDay = rd({ id: "z", date: "2026-05-19", status: "planned" });
    const { runDays } = carryCompletionsAcrossRegen([oldDay], [newDay], undefined);
    expect(runDays[0].status).toBe("planned");
  });
});
