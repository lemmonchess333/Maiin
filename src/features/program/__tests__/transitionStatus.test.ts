/**
 * Tests for the ScheduledRunStatus state machine · P0-A · spec v7
 * (PR-D revisions).
 *
 * The validator is a pure boolean function. Tests pin which
 * transitions are legal (positive cases) and which are blocked
 * (negative cases). Callers should throw on `false` rather than
 * silently no-op.
 *
 * PR-D changes:
 *   - `race_completed_unlinked` dropped from the enum (was paper —
 *     never written by any code path). All transitions involving it
 *     removed from this suite.
 *   - `race_no_show → completed_*` is now LEGAL (was blocked).
 *     The auto-transition writes race_no_show as an inferred state;
 *     if the user later logs the race via reconciliation, the slot
 *     transitions to completed_*. Tests below pin both directions.
 *   - "Terminal" in this suite means "no legal outgoing transitions
 *     at all." race_no_show is therefore NOT terminal under PR-D.
 */

import { describe, it, expect } from "vitest";
import { transitionStatus } from "../programTypes";
import type { ScheduledRunStatus } from "../programTypes";

describe("transitionStatus · legal forward transitions", () => {
  it("planned → completed_exact", () => {
    expect(transitionStatus("planned", "completed_exact")).toBe(true);
  });

  it("planned → completed_modified", () => {
    expect(transitionStatus("planned", "completed_modified")).toBe(true);
  });

  it("planned → completed_late", () => {
    expect(transitionStatus("planned", "completed_late")).toBe(true);
  });

  it("planned → skipped", () => {
    expect(transitionStatus("planned", "skipped")).toBe(true);
  });

  it("planned → race_no_show (race-specific)", () => {
    expect(transitionStatus("planned", "race_no_show")).toBe(true);
  });

  it("race_no_show → completed_exact (PR-D: recovery via reconciliation)", () => {
    expect(transitionStatus("race_no_show", "completed_exact")).toBe(true);
  });

  it("race_no_show → completed_modified (PR-D: recovery)", () => {
    expect(transitionStatus("race_no_show", "completed_modified")).toBe(true);
  });

  it("race_no_show → completed_late (PR-D: recovery)", () => {
    expect(transitionStatus("race_no_show", "completed_late")).toBe(true);
  });
});

describe("transitionStatus · disallowed reverts", () => {
  it("blocks completed_exact → planned (no silent revert)", () => {
    expect(transitionStatus("completed_exact", "planned")).toBe(false);
  });

  it("blocks completed_modified → planned", () => {
    expect(transitionStatus("completed_modified", "planned")).toBe(false);
  });

  it("blocks completed_exact → skipped (no retroactive skip)", () => {
    expect(transitionStatus("completed_exact", "skipped")).toBe(false);
  });

  it("blocks skipped → completed_exact (without explicit reconciliation)", () => {
    expect(transitionStatus("skipped", "completed_exact")).toBe(false);
  });

  it("blocks skipped → completed_modified", () => {
    expect(transitionStatus("skipped", "completed_modified")).toBe(false);
  });

  it("blocks completed_late → planned", () => {
    expect(transitionStatus("completed_late", "planned")).toBe(false);
  });

  it("blocks race_no_show → planned (recovery only goes to completed_*)", () => {
    expect(transitionStatus("race_no_show", "planned")).toBe(false);
  });

  it("blocks race_no_show → skipped", () => {
    expect(transitionStatus("race_no_show", "skipped")).toBe(false);
  });
});

describe("transitionStatus · completed/skipped states are hard-terminal", () => {
  const hardTerminalStates: ScheduledRunStatus[] = [
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
  ];
  const allStates: ScheduledRunStatus[] = [
    "planned",
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
  ];

  hardTerminalStates.forEach((from) => {
    allStates.forEach((to) => {
      it(`${from} → ${to} is blocked`, () => {
        expect(transitionStatus(from, to)).toBe(false);
      });
    });
  });
});
