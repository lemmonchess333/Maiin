/**
 * Tests for the ScheduledRunStatus state machine · P0-A · spec v7
 * (PR-D + PR-J revisions).
 *
 * The validator is a pure boolean function. Tests pin which
 * transitions are legal (positive cases) and which are blocked
 * (negative cases).
 *
 * PR-D changes (historical):
 *   - `race_completed_unlinked` dropped from the enum (was paper).
 *   - `race_no_show → completed_*` was legal — recovery flow.
 *
 * PR-J Q2 chunk B2 revisions (this PR):
 *   - `completeRunDay` is deleted. `planned → completed_*` is no
 *     longer a writer-driven transition (completion derives from
 *     the saved-run match per Q1 P27); removed from the table.
 *   - Q1 P7: `skipped → planned` is now legal (skip is reversible,
 *     supports the "undo skip" + manual-complete two-step P20).
 *   - Q2 P15: `race_no_show → planned` is now legal (reversal
 *     trigger when a matching saved run lands post-no-show).
 *   - `race_no_show → completed_*` removed — reversal is to
 *     planned, not direct to legacy completion.
 *   - Legacy completed_* values stay terminal (no outgoing
 *     transitions) so existing data continues to type-check.
 */

import { describe, it, expect } from "vitest";
import { transitionStatus } from "../programTypes";
import type { AnyScheduledRunStatus } from "@/lib/scheduledRunStatus";

describe("transitionStatus · legal forward transitions (PR-J)", () => {
  it("planned → skipped (skip the slot)", () => {
    expect(transitionStatus("planned", "skipped")).toBe(true);
  });

  it("planned → race_no_show (auto-write on grace expiry)", () => {
    expect(transitionStatus("planned", "race_no_show")).toBe(true);
  });

  it("skipped → planned is LEGAL (Q1 P7 — skip is reversible)", () => {
    expect(transitionStatus("skipped", "planned")).toBe(true);
  });

  it("race_no_show → planned is LEGAL (Q2 P15 — reversal trigger)", () => {
    expect(transitionStatus("race_no_show", "planned")).toBe(true);
  });
});

describe("transitionStatus · removed writer transitions (PR-J)", () => {
  // Q1 P27: completion derives from saved-run match — no writer
  // produces completed_* anymore.
  it("planned → completed_exact is BLOCKED (no completeRunDay writer)", () => {
    expect(transitionStatus("planned", "completed_exact")).toBe(false);
  });

  it("planned → completed_modified is BLOCKED", () => {
    expect(transitionStatus("planned", "completed_modified")).toBe(false);
  });

  it("planned → completed_late is BLOCKED", () => {
    expect(transitionStatus("planned", "completed_late")).toBe(false);
  });

  it("race_no_show → completed_exact is BLOCKED (reversal goes to planned, not direct)", () => {
    expect(transitionStatus("race_no_show", "completed_exact")).toBe(false);
  });

  it("race_no_show → completed_modified is BLOCKED", () => {
    expect(transitionStatus("race_no_show", "completed_modified")).toBe(false);
  });

  it("race_no_show → completed_late is BLOCKED", () => {
    expect(transitionStatus("race_no_show", "completed_late")).toBe(false);
  });
});

describe("transitionStatus · disallowed reverts", () => {
  it("blocks completed_exact → planned (legacy values stay terminal)", () => {
    expect(transitionStatus("completed_exact", "planned")).toBe(false);
  });

  it("blocks completed_modified → planned", () => {
    expect(transitionStatus("completed_modified", "planned")).toBe(false);
  });

  it("blocks completed_late → planned", () => {
    expect(transitionStatus("completed_late", "planned")).toBe(false);
  });

  it("blocks completed_exact → skipped", () => {
    expect(transitionStatus("completed_exact", "skipped")).toBe(false);
  });

  it("blocks skipped → completed_* (legacy completed isn't a destination)", () => {
    expect(transitionStatus("skipped", "completed_exact")).toBe(false);
    expect(transitionStatus("skipped", "completed_modified")).toBe(false);
    expect(transitionStatus("skipped", "completed_late")).toBe(false);
  });

  it("blocks race_no_show → skipped (reversal goes to planned only)", () => {
    expect(transitionStatus("race_no_show", "skipped")).toBe(false);
  });
});

describe("transitionStatus · legacy completed values are terminal", () => {
  // PR-J Q2 chunk B2: the three legacy completed values stay in
  // LEGAL_TRANSITIONS as terminal so existing data still
  // type-checks. They have NO outgoing transitions.
  const legacyTerminalStates: AnyScheduledRunStatus[] = [
    "completed_exact",
    "completed_modified",
    "completed_late",
  ];
  const allStates: AnyScheduledRunStatus[] = [
    "planned",
    "completed_exact",
    "completed_modified",
    "completed_late",
    "skipped",
    "race_no_show",
  ];

  legacyTerminalStates.forEach((from) => {
    allStates.forEach((to) => {
      it(`${from} → ${to} is blocked`, () => {
        expect(transitionStatus(from, to)).toBe(false);
      });
    });
  });
});
