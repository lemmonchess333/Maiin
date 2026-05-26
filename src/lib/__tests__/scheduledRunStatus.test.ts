/**
 * Tests for the central scheduled-run status helpers
 * (PR-0b-iii, updated for PR-D).
 *
 * The helpers project the ScheduledRunStatus enum into the
 * decisions the UI needs (startable / editable / terminal /
 * completed). Each helper × each enum value gets pinned here so
 * a future enum addition can't silently misclassify itself.
 *
 * PR-D revisions:
 *   - `race_completed_unlinked` dropped from the enum entirely;
 *     `isScheduledRunReconciliation` removed.
 *   - `race_no_show` no longer in TERMINAL_STATUSES because the
 *     auto-transition in useProgram's load effect writes it as an
 *     inferred state, and the reconciliation flow allows
 *     `race_no_show → completed_*`.
 *
 * Plus the legacy-completed resolution path — the migration
 * already aligns these on read, but the helper exists as a
 * defensive read for any caller (analytics, future codepath)
 * that hasn't been through the migration.
 */
import { describe, it, expect } from "vitest";
import {
  getScheduledRunStatus,
  isScheduledRunTerminal,
  isScheduledRunStartable,
  isScheduledRunEditable,
  isScheduledRunCompleted,
  isLegacyCompleted,
  COMPLETED_STATUSES,
  type AnyScheduledRunStatus,
} from "../scheduledRunStatus";
import type {
  ScheduledRunDay,
  ScheduledRunStatus,
} from "@/features/program/programTypes";

// PR-J Q8 P102: union typed via AnyScheduledRunStatus so tests can
// iterate across both active + legacy values.
const ALL_STATUSES: AnyScheduledRunStatus[] = [
  "planned",
  "completed_exact",
  "completed_modified",
  "completed_late",
  "skipped",
  "race_no_show",
];

function makeRunDay(overrides: Partial<ScheduledRunDay> = {}): ScheduledRunDay {
  return {
    dayIndex: 2,
    templateId: "easy_30",
    type: "easy",
    completed: false,
    ...overrides,
  };
}

describe("getScheduledRunStatus", () => {
  it("returns the present status field when set", () => {
    expect(getScheduledRunStatus(makeRunDay({ status: "skipped" }))).toBe(
      "skipped"
    );
    expect(
      getScheduledRunStatus(makeRunDay({ status: "completed_late" }))
    ).toBe("completed_late");
    expect(getScheduledRunStatus(makeRunDay({ status: "race_no_show" }))).toBe(
      "race_no_show"
    );
  });

  it("resolves legacy completed: true + no status → completed_exact", () => {
    const rd = makeRunDay({ completed: true });
    delete (rd as { status?: ScheduledRunStatus }).status;
    expect(getScheduledRunStatus(rd)).toBe("completed_exact");
  });

  it("resolves legacy completed: false + no status → planned", () => {
    const rd = makeRunDay({ completed: false });
    delete (rd as { status?: ScheduledRunStatus }).status;
    expect(getScheduledRunStatus(rd)).toBe("planned");
  });

  it("resolves missing completed + missing status → planned (defensive)", () => {
    const rd = {
      dayIndex: 0,
      templateId: "easy_30",
      type: "easy",
    } as ScheduledRunDay;
    expect(getScheduledRunStatus(rd)).toBe("planned");
  });

  it("prefers status over a contradictory completed flag", () => {
    const rd = makeRunDay({ completed: false, status: "completed_exact" });
    expect(getScheduledRunStatus(rd)).toBe("completed_exact");
  });
});

describe("isScheduledRunTerminal", () => {
  it("true for all completed_* states", () => {
    expect(isScheduledRunTerminal("completed_exact")).toBe(true);
    expect(isScheduledRunTerminal("completed_modified")).toBe(true);
    expect(isScheduledRunTerminal("completed_late")).toBe(true);
  });

  it("true for skipped", () => {
    expect(isScheduledRunTerminal("skipped")).toBe(true);
  });

  it("false for race_no_show (PR-D: now recoverable, not hard-terminal)", () => {
    // The auto-transition writes race_no_show as an inferred
    // state. The reconciliation flow allows
    // race_no_show → completed_*. Therefore not hard-terminal —
    // a legal outgoing transition exists.
    expect(isScheduledRunTerminal("race_no_show")).toBe(false);
  });

  it("false for planned", () => {
    expect(isScheduledRunTerminal("planned")).toBe(false);
  });
});

describe("isScheduledRunStartable", () => {
  it("true only for planned", () => {
    expect(isScheduledRunStartable("planned")).toBe(true);
    for (const s of ALL_STATUSES.filter((s) => s !== "planned")) {
      expect(isScheduledRunStartable(s)).toBe(false);
    }
  });

  it("false for skipped", () => {
    expect(isScheduledRunStartable("skipped")).toBe(false);
  });

  it("false for race_no_show", () => {
    // race_no_show is recoverable but not "startable" in the
    // day-to-day sense — recovery goes via reconciliation
    // (saving a past-dated run), not a fresh Run flow.
    expect(isScheduledRunStartable("race_no_show")).toBe(false);
  });
});

describe("isScheduledRunEditable", () => {
  it("true only for planned", () => {
    expect(isScheduledRunEditable("planned")).toBe(true);
    for (const s of ALL_STATUSES.filter((s) => s !== "planned")) {
      expect(isScheduledRunEditable(s)).toBe(false);
    }
  });

  it("false for skipped", () => {
    expect(isScheduledRunEditable("skipped")).toBe(false);
  });

  it("false for race_no_show", () => {
    expect(isScheduledRunEditable("race_no_show")).toBe(false);
  });
});

describe("isLegacyCompleted (PR-J Q8 P103)", () => {
  it("returns true for the three legacy completed values", () => {
    expect(isLegacyCompleted("completed_exact")).toBe(true);
    expect(isLegacyCompleted("completed_modified")).toBe(true);
    expect(isLegacyCompleted("completed_late")).toBe(true);
  });

  it("returns false for all active-union values", () => {
    expect(isLegacyCompleted("planned")).toBe(false);
    expect(isLegacyCompleted("skipped")).toBe(false);
    expect(isLegacyCompleted("race_no_show")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isLegacyCompleted(undefined)).toBe(false);
  });
});

describe("isScheduledRunCompleted", () => {
  it("true for all completed_* states", () => {
    expect(isScheduledRunCompleted("completed_exact")).toBe(true);
    expect(isScheduledRunCompleted("completed_modified")).toBe(true);
    expect(isScheduledRunCompleted("completed_late")).toBe(true);
  });

  it("false for non-completed states", () => {
    expect(isScheduledRunCompleted("planned")).toBe(false);
    expect(isScheduledRunCompleted("skipped")).toBe(false);
    expect(isScheduledRunCompleted("race_no_show")).toBe(false);
  });

  it("COMPLETED_STATUSES set is the same source-of-truth as the helper", () => {
    for (const s of ALL_STATUSES) {
      // PR-J Q8 P102: COMPLETED_STATUSES is typed as
      // ReadonlySet<LegacyScheduledRunStatus>; cast at the test
      // boundary to compare across the full union. The helper
      // itself accepts the union.
      expect(isScheduledRunCompleted(s)).toBe(
        COMPLETED_STATUSES.has(s as never)
      );
    }
  });
});

describe("PR-D — behaviour matrix", () => {
  it("race_no_show: not terminal, not startable, not editable, not completed", () => {
    expect(isScheduledRunTerminal("race_no_show")).toBe(false);
    expect(isScheduledRunStartable("race_no_show")).toBe(false);
    expect(isScheduledRunEditable("race_no_show")).toBe(false);
    expect(isScheduledRunCompleted("race_no_show")).toBe(false);
  });

  it("skipped: terminal=true, startable/editable/completed all false", () => {
    expect(isScheduledRunTerminal("skipped")).toBe(true);
    expect(isScheduledRunStartable("skipped")).toBe(false);
    expect(isScheduledRunEditable("skipped")).toBe(false);
    expect(isScheduledRunCompleted("skipped")).toBe(false);
  });

  it("planned: startable=true, editable=true, others false", () => {
    expect(isScheduledRunStartable("planned")).toBe(true);
    expect(isScheduledRunEditable("planned")).toBe(true);
    expect(isScheduledRunTerminal("planned")).toBe(false);
    expect(isScheduledRunCompleted("planned")).toBe(false);
  });

  it("completed_exact: terminal=true, completed=true, others false", () => {
    expect(isScheduledRunTerminal("completed_exact")).toBe(true);
    expect(isScheduledRunCompleted("completed_exact")).toBe(true);
    expect(isScheduledRunStartable("completed_exact")).toBe(false);
    expect(isScheduledRunEditable("completed_exact")).toBe(false);
  });
});
