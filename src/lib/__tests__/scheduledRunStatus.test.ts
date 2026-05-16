/**
 * Tests for the central scheduled-run status helpers (PR-0b-iii).
 *
 * The helpers project the ScheduledRunStatus enum into the four
 * decisions the UI needs (startable / editable / terminal /
 * reconciliation / completed). Each helper × each enum value
 * gets pinned here so a future enum addition can't silently
 * misclassify itself.
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
  isScheduledRunReconciliation,
  isScheduledRunCompleted,
  COMPLETED_STATUSES,
} from "../scheduledRunStatus";
import type { ScheduledRunDay, ScheduledRunStatus } from "@/features/program/programTypes";

const ALL_STATUSES: ScheduledRunStatus[] = [
  "planned",
  "completed_exact",
  "completed_modified",
  "completed_late",
  "skipped",
  "race_no_show",
  "race_completed_unlinked",
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
    expect(getScheduledRunStatus(makeRunDay({ status: "skipped" }))).toBe("skipped");
    expect(getScheduledRunStatus(makeRunDay({ status: "completed_late" }))).toBe("completed_late");
    expect(getScheduledRunStatus(makeRunDay({ status: "race_completed_unlinked" }))).toBe(
      "race_completed_unlinked",
    );
  });

  it("resolves legacy completed: true + no status → completed_exact", () => {
    // PR-0b-iii spec test #1: a doc that pre-dates the status
    // enum (legacy completed boolean only) must resolve to a
    // terminal completed_* state so writers don't treat it as
    // planned and silently re-complete it.
    const rd = makeRunDay({ completed: true });
    delete (rd as { status?: ScheduledRunStatus }).status;
    expect(getScheduledRunStatus(rd)).toBe("completed_exact");
  });

  it("resolves legacy completed: false + no status → planned", () => {
    // PR-0b-iii spec test #2.
    const rd = makeRunDay({ completed: false });
    delete (rd as { status?: ScheduledRunStatus }).status;
    expect(getScheduledRunStatus(rd)).toBe("planned");
  });

  it("resolves missing completed + missing status → planned (defensive)", () => {
    const rd = { dayIndex: 0, templateId: "easy_30", type: "easy" } as ScheduledRunDay;
    expect(getScheduledRunStatus(rd)).toBe("planned");
  });

  it("prefers status over a contradictory completed flag", () => {
    // The PR-0b-i migration aligns these, but if a stale read
    // ever observes a contradictory pair, status wins per the
    // P0-A authoritative-status rule.
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

  it("true for skipped and race_no_show", () => {
    // PR-0b-iii spec test #3 (partial): skipped is terminal.
    expect(isScheduledRunTerminal("skipped")).toBe(true);
    expect(isScheduledRunTerminal("race_no_show")).toBe(true);
  });

  it("false for planned", () => {
    expect(isScheduledRunTerminal("planned")).toBe(false);
  });

  it("false for race_completed_unlinked (reconciliation, not terminal)", () => {
    // PR-0b-iii spec test #4 (partial): race_completed_unlinked
    // is distinct from terminal. It has a legal outgoing edge
    // (→ completed_exact) so it's not resolved yet.
    expect(isScheduledRunTerminal("race_completed_unlinked")).toBe(false);
  });
});

describe("isScheduledRunStartable", () => {
  it("true only for planned", () => {
    expect(isScheduledRunStartable("planned")).toBe(true);
    // Every other status refuses.
    for (const s of ALL_STATUSES.filter((s) => s !== "planned")) {
      expect(isScheduledRunStartable(s)).toBe(false);
    }
  });

  it("false for skipped (PR-0b-iii spec test #3 part)", () => {
    // skipped runs have completed=false but should NEVER be
    // surfaced as startable — that's the headline bug the
    // helpers fix vs the legacy `!d.completed` check.
    expect(isScheduledRunStartable("skipped")).toBe(false);
  });

  it("false for race_completed_unlinked (PR-0b-iii spec test #4 part)", () => {
    expect(isScheduledRunStartable("race_completed_unlinked")).toBe(false);
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

  it("false for race_completed_unlinked (no normal-edit path)", () => {
    expect(isScheduledRunEditable("race_completed_unlinked")).toBe(false);
  });
});

describe("isScheduledRunReconciliation", () => {
  it("true only for race_completed_unlinked", () => {
    expect(isScheduledRunReconciliation("race_completed_unlinked")).toBe(true);
    for (const s of ALL_STATUSES.filter((s) => s !== "race_completed_unlinked")) {
      expect(isScheduledRunReconciliation(s)).toBe(false);
    }
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
    expect(isScheduledRunCompleted("race_completed_unlinked")).toBe(false);
  });

  it("COMPLETED_STATUSES set is the same source-of-truth as the helper", () => {
    // Migration imports COMPLETED_STATUSES directly — the
    // helper's behaviour must match the set membership exactly.
    for (const s of ALL_STATUSES) {
      expect(isScheduledRunCompleted(s)).toBe(COMPLETED_STATUSES.has(s));
    }
  });
});

describe("PR-0b-iii — behaviour matrix (race_completed_unlinked deep-dive)", () => {
  it("race_completed_unlinked: reconciliation=true, all others false", () => {
    // The headline behavioural change of PR-0b-iii: this state
    // gets no Start/Change/Skip buttons, only passive copy.
    expect(isScheduledRunReconciliation("race_completed_unlinked")).toBe(true);
    expect(isScheduledRunStartable("race_completed_unlinked")).toBe(false);
    expect(isScheduledRunEditable("race_completed_unlinked")).toBe(false);
    expect(isScheduledRunTerminal("race_completed_unlinked")).toBe(false);
    expect(isScheduledRunCompleted("race_completed_unlinked")).toBe(false);
  });

  it("skipped: terminal=true, startable/editable/reconciliation/completed all false", () => {
    expect(isScheduledRunTerminal("skipped")).toBe(true);
    expect(isScheduledRunStartable("skipped")).toBe(false);
    expect(isScheduledRunEditable("skipped")).toBe(false);
    expect(isScheduledRunReconciliation("skipped")).toBe(false);
    expect(isScheduledRunCompleted("skipped")).toBe(false);
  });

  it("planned: startable=true, editable=true, others false", () => {
    expect(isScheduledRunStartable("planned")).toBe(true);
    expect(isScheduledRunEditable("planned")).toBe(true);
    expect(isScheduledRunTerminal("planned")).toBe(false);
    expect(isScheduledRunReconciliation("planned")).toBe(false);
    expect(isScheduledRunCompleted("planned")).toBe(false);
  });
});
