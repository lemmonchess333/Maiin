import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { applyRunningProposal } = require("../lib/runningAuthority");
function fixture() {
  return {
    current: {
      schemaVersion: 1,
      timeZone: "UTC",
      accountId: "runner",
      revision: 8,
      plan: {
        raceGoalId: "race",
        sessions: [
          {
            id: "new",
            date: "2026-11-12",
            templateId: "easy20",
            minutes: 20,
            kind: "easy",
          },
        ],
      },
      constraints: { capacity: { daysPerWeek: 2, longestMinutes: 15 } },
      holds: [],
      history: [{ id: "completed" }],
      manualCompletions: { manual: true },
      recoveryEvidence: { completionId: "saved-race" },
    },
    proposal: {
      id: "proposal",
      windowStart: "2026-11-09",
      accountId: "runner",
      baseRevision: 8,
      expiresAtMs: 200,
      validation: { policyVersion: 1, authorityRevision: 8 },
      plan: {
        raceGoalId: "race",
        sessions: [
          {
            id: "new",
            date: "2026-11-12",
            templateId: "easy15",
            minutes: 15,
            kind: "easy",
          },
        ],
      },
    },
    request: {
      uid: "runner",
      proposalId: "proposal",
      expectedRevision: 8,
      idempotencyKey: "accept-1",
      accepted: true,
    },
    nowMs: 100,
  };
}
describe("dormant running authority proposal protocol", () => {
  it("changes only the prescription plan and revision", () => {
    const input = fixture();
    const before = structuredClone(input);
    const result = applyRunningProposal(input);
    expect(result.outcome).toBe("applied");
    expect(result.next).toEqual({
      ...input.current,
      revision: 9,
      plan: input.proposal.plan,
    });
    expect(input).toEqual(before);
    expect(result.receipt).toEqual({
      accountId: "runner",
      proposalId: "proposal",
      idempotencyKey: "accept-1",
      baseRevision: 8,
      appliedRevision: 9,
    });
  });
  it.each([
    "injury",
    "marathon-recovery",
    "unresolved-completion",
    "clinician",
  ])("preserves and refuses to bypass the %s hold", (hold) => {
    const input = fixture();
    input.current.holds = [hold];
    input.proposal.holds = [];
    input.request.holds = [];
    expect(() => applyRunningProposal(input)).toThrow("active-hold");
  });
  it("rejects a stale proposal when any authoritative input changes", () => {
    const input = fixture();
    input.current.revision++;
    expect(() => applyRunningProposal(input)).toThrow("revision-conflict");
  });
  it("replays exact receipts without writing even after later state changes and expiry", () => {
    const input = fixture();
    const { receipt } = applyRunningProposal(input);
    input.current.revision = 12;
    input.current.holds = ["injury"];
    expect(applyRunningProposal({ ...input, receipt, nowMs: 1000 })).toEqual({
      outcome: "replayed",
      receipt,
    });
  });
  it("rejects reusing an idempotency key for another proposal", () => {
    const input = fixture();
    const { receipt } = applyRunningProposal(input);
    input.current.revision = 9;
    input.request.proposalId = "other";
    expect(() => applyRunningProposal({ ...input, receipt })).toThrow(
      "idempotency-conflict"
    );
  });
  it.each([
    [
      "wrong-account",
      (x) => {
        x.request.uid = "other";
      },
    ],
    [
      "unknown-proposal",
      (x) => {
        x.proposal.accountId = "other";
      },
    ],
    [
      "unknown-proposal",
      (x) => {
        x.proposal.id = "other";
      },
    ],
    [
      "revision-conflict",
      (x) => {
        x.proposal.baseRevision = 7;
      },
    ],
    [
      "unvalidated-proposal",
      (x) => {
        delete x.proposal.validation;
      },
    ],
    [
      "unvalidated-proposal",
      (x) => {
        x.proposal.validation.authorityRevision = 7;
      },
    ],
    [
      "unvalidated-proposal",
      (x) => {
        x.proposal.validation.policyVersion = 2;
      },
    ],
    [
      "invalid-plan",
      (x) => {
        x.proposal.plan.holds = [];
      },
    ],
    [
      "proposal-expired",
      (x) => {
        x.nowMs = 200;
      },
    ],
    [
      "proposal-expired",
      (x) => {
        x.proposal.expiresAtMs = NaN;
      },
    ],
    [
      "invalid-acceptance",
      (x) => {
        x.request.accepted = false;
      },
    ],
    [
      "invalid-acceptance",
      (x) => {
        x.request.expectedRevision = 8.5;
      },
    ],
    [
      "invalid-acceptance",
      (x) => {
        x.request.idempotencyKey = "a/b";
      },
    ],
    [
      "unsupported-authority",
      (x) => {
        x.current.schemaVersion = 2;
      },
    ],
    [
      "invalid-authority",
      (x) => {
        delete x.current.holds;
      },
    ],
    [
      "invalid-authority",
      (x) => {
        x.current.constraints = null;
      },
    ],
    [
      "goal-conflict",
      (x) => {
        x.proposal.plan.raceGoalId = "replacement-race";
      },
    ],
    [
      "invalid-plan",
      (x) => {
        x.proposal.plan.sessions[0].date = "2026-02-30";
      },
    ],
    [
      "invalid-plan",
      (x) => {
        x.proposal.plan.sessions[0].minutes = Infinity;
      },
    ],
    [
      "invalid-plan",
      (x) => {
        x.proposal.plan.sessions[0].kind = "intervals";
      },
    ],
    [
      "invalid-plan",
      (x) => {
        x.proposal.plan.sessions.push({ ...x.proposal.plan.sessions[0] });
      },
    ],
  ])("fails closed: %s", (error, change) => {
    const input = fixture();
    change(input);
    expect(() => applyRunningProposal(input)).toThrow(error);
  });
  it("accepts an empty prescription week without losing recovery evidence", () => {
    const input = fixture();
    input.proposal.plan.sessions = [];
    const result = applyRunningProposal(input);
    expect(result.next.plan.sessions).toEqual([]);
    expect(result.next.recoveryEvidence).toEqual(
      input.current.recoveryEvidence
    );
  });
  it("cannot reapply a previously accepted proposal without its receipt", () => {
    const input = fixture();
    const result = applyRunningProposal(input);
    expect(() =>
      applyRunningProposal({ ...input, current: result.next })
    ).toThrow("revision-conflict");
  });
  it("preserves unrelated weeks and plan metadata when applying a bounded patch", () => {
    const input = fixture();
    const earlier = {
      id: "earlier",
      date: "2026-11-02",
      kind: "quality",
      completed: true,
    };
    const later = { id: "later", date: "2026-11-20", kind: "quality" };
    input.current.plan.sessions.push(earlier, later);
    input.current.plan.recoveryWeekKey = "2026-11-09";
    const result = applyRunningProposal(input);
    expect(result.next.plan.sessions).toEqual([
      earlier,
      ...input.proposal.plan.sessions,
      later,
    ]);
    expect(result.next.plan.recoveryWeekKey).toBe("2026-11-09");
  });
  it.each(["protected", "completed", "manual", "status"])(
    "rejects %s entries inside the patch window",
    (kind) => {
      const input = fixture();
      if (kind === "manual") input.current.manualCompletions.new = true;
      else if (kind === "status")
        input.current.plan.sessions[0].status = "skipped";
      else input.current.plan.sessions[0][kind] = true;
      expect(() => applyRunningProposal(input)).toThrow("protected-entry");
    }
  );
  it("rejects moving a selected identity or adding a new identity", () => {
    const input = fixture();
    input.proposal.plan.sessions[0].date = "2026-11-13";
    expect(() => applyRunningProposal(input)).toThrow("invalid-window");
    input.proposal.plan.sessions[0].date = "2026-11-12";
    input.proposal.plan.sessions[0].id = "injected";
    expect(() => applyRunningProposal(input)).toThrow("invalid-window");
  });
  it("rejects a window that has started in the authoritative timezone", () => {
    const input = fixture();
    input.current.timeZone = "Pacific/Kiritimati";
    input.nowMs = Date.parse("2026-11-08T12:00:00Z");
    input.proposal.expiresAtMs = input.nowMs + 100000;
    expect(() => applyRunningProposal(input)).toThrow("window-not-future");
    input.current.timeZone = "America/Los_Angeles";
    expect(applyRunningProposal(input).outcome).toBe("applied");
  });
  it("rejects missing or invalid timezone instead of guessing", () => {
    const input = fixture();
    delete input.current.timeZone;
    expect(() => applyRunningProposal(input)).toThrow("invalid-authority");
    input.current.timeZone = "not/a-timezone";
    expect(() => applyRunningProposal(input)).toThrow("invalid-authority");
  });
  it.each([null, false, 0, ""])(
    "does not treat malformed falsy status %s as planned",
    (status) => {
      const input = fixture();
      input.current.plan.sessions[0].status = status;
      expect(() => applyRunningProposal(input)).toThrow("protected-entry");
    }
  );
  it.each([
    "completed",
    "protected",
    "movedFromDate",
    "movedToDate",
    "userOverride",
  ])("does not overwrite unknown %s metadata", (field) => {
    const input = fixture();
    input.current.plan.sessions[0][field] = null;
    expect(() => applyRunningProposal(input)).toThrow("protected-entry");
  });
  it("protects manual-entry presence even when its value is malformed", () => {
    const input = fixture();
    input.current.manualCompletions.new = false;
    expect(() => applyRunningProposal(input)).toThrow("protected-entry");
    input.current.manualCompletions = [];
    expect(() => applyRunningProposal(input)).toThrow("invalid-authority");
  });
  it.each(["constructor", "toString"])(
    "ignores inherited manual completion property %s",
    (id) => {
      const input = fixture();
      input.current.manualCompletions = {};
      input.current.plan.sessions[0].id = id;
      input.proposal.plan.sessions[0].id = id;
      expect(applyRunningProposal(input).outcome).toBe("applied");
    }
  );
  it("unfinished enrollment cannot be bypassed by an accidentally empty holds list", () => {
    const input = fixture();
    input.current.migration = { version: 1, status: "review_required" };
    expect(() => applyRunningProposal(input)).toThrow("active-hold");
  });
});
