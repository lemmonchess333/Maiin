import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { applyProgramCommand } = require("../lib/programCommands");

const oldId = "runday_2026-09-06_2_easy_30";
const id = "runday_2026-09-07_2_easy_30";
const run = { id, legacyIds: [oldId], weekKey: "2026-09-07", date: "2026-09-08",
  dayIndex: 2, templateId: "easy_30", type: "easy", status: "planned", completed: false };
const initial = { weekNumber: 3, workouts: [], runDays: [run] };
const apply = (state, command) => applyProgramCommand({ state, profile: {}, now: 123,
  command: { commandId: "queued-before-migration", ...command } }).state;

describe("commands queued before the Monday migration", () => {
  it("marks and unmarks the canonical completion through the old ID", () => {
    const completed = apply(initial, { kind: "setManualRunCompletion", runDayId: oldId, completed: true });
    expect(completed.manualCompletions).toEqual({ [id]: { completedAt: 123 } });
    expect(apply(completed, { kind: "setManualRunCompletion", runDayId: oldId, completed: false }).manualCompletions).toEqual({});
  });
  it("moves the intended migrated slot to Sunday", () => {
    const moved = apply(initial, { kind: "moveRunDay", runDayId: oldId, targetDayIndex: 0 });
    expect(moved.runDays[0]).toMatchObject({ id, date: "2026-09-13", dayIndex: 0, legacyIds: [oldId] });
  });
  it("keeps an exact current ID ahead of another run's alias", () => {
    const exact = { ...run, id: oldId, legacyIds: undefined, date: "2026-09-10", dayIndex: 4 };
    const after = apply({ ...initial, runDays: [run, exact] }, {
      kind: "transitionRunDay", runDayId: oldId, to: "skipped",
    });
    expect(after.runDays.map((rd) => rd.status)).toEqual(["planned", "skipped"]);
  });
  it("still rejects an unknown ID", () => {
    expect(() => apply(initial, { kind: "transitionRunDay", runDayId: "missing", to: "skipped" })).toThrow();
  });
});
