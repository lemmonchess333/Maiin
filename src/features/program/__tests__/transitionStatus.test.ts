/**
 * Tests for the ScheduledRunStatus state machine · P0-A · spec v7.
 *
 * The validator is a pure boolean function. Tests pin which
 * transitions are legal (positive cases) and which are blocked
 * (negative cases). Callers should throw on `false` rather than
 * silently no-op.
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

  it("planned → race_completed_unlinked (race-specific)", () => {
    expect(transitionStatus("planned", "race_completed_unlinked")).toBe(true);
  });

  it("race_completed_unlinked → completed_exact (user links manually)", () => {
    expect(transitionStatus("race_completed_unlinked", "completed_exact")).toBe(true);
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

  it("blocks race_no_show → completed_exact (race didn't happen, can't be exact)", () => {
    expect(transitionStatus("race_no_show", "completed_exact")).toBe(false);
  });
});

describe("transitionStatus · all completed/skipped states are terminal", () => {
  const terminalStates: ScheduledRunStatus[] = [
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
  ];
  const allStates: ScheduledRunStatus[] = [
    "planned",
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
    "race_completed_unlinked",
  ];

  terminalStates.forEach((from) => {
    allStates.forEach((to) => {
      it(`${from} → ${to} is blocked`, () => {
        expect(transitionStatus(from, to)).toBe(false);
      });
    });
  });
});

describe("transitionStatus · race_completed_unlinked is only escapable to completed_exact", () => {
  const allStates: ScheduledRunStatus[] = [
    "planned",
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
    "race_completed_unlinked",
  ];

  allStates.forEach((to) => {
    if (to === "completed_exact") return; // handled in legal-forward tests
    it(`race_completed_unlinked → ${to} is blocked`, () => {
      expect(transitionStatus("race_completed_unlinked", to)).toBe(false);
    });
  });
});
