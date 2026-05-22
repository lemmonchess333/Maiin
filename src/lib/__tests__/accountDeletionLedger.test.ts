/**
 * R1A-Deletion Chunk 1 — ledger schema tests.
 *
 * Pure-function pinning for STATE_GRAPH, support code format,
 * minimisation enforcement on accountDeletionRequests records.
 * Wiring into deleteMyAccount lands in Chunk 3; these tests stand
 * up first so any wiring implementation is held to the schema.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ledger = require("../../../functions/lib/accountDeletionLedger.js");

const {
  STATUS,
  STATE_GRAPH,
  ALLOWED_FIELDS,
  COLLECTION,
  LEASE_DURATION_MS,
  LEDGER_RETENTION_MS,
  generateSupportCode,
  assertValidTransition,
  assertMinimisedRecord,
} = ledger;

describe("accountDeletionLedger constants", () => {
  it("collection name and retention windows match spec", () => {
    expect(COLLECTION).toBe("accountDeletionRequests");
    expect(LEASE_DURATION_MS).toBe(540 * 1000);
    expect(LEDGER_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("STATUS enum exposes all 8 states", () => {
    expect(Object.values(STATUS).sort()).toEqual([
      "cancelled",
      "completed",
      "failed_cleanup",
      "operator_review",
      "pending_auth_deletion",
      "pending_cleanup",
      "requested",
      "running",
    ]);
  });

  it("ALLOWED_FIELDS covers the spec's required ledger fields", () => {
    const required = [
      "uid",
      "status",
      "operationId",
      "leaseOwner",
      "leaseExpiresAt",
      "leaseGeneration",
      "lastHeartbeatAt",
      "attemptCount",
      "startedAt",
      "updatedAt",
      "completedAt",
      "expiresAt",
      "cleanupAfter",
      "failedStage",
      "lastErrorCode",
      "lastErrorMessage",
      "cleanupSummary",
      "pendingCleanupShards",
      "supportCode",
    ];
    for (const f of required) {
      expect(ALLOWED_FIELDS, `missing required field: ${f}`).toContain(f);
    }
  });
});

describe("STATE_GRAPH transitions", () => {
  it("requested can go to running or cancelled", () => {
    assertValidTransition(STATUS.REQUESTED, STATUS.RUNNING);
    assertValidTransition(STATUS.REQUESTED, STATUS.CANCELLED);
  });

  it("running can go to completed / failed_cleanup / pending_cleanup / pending_auth_deletion / operator_review", () => {
    assertValidTransition(STATUS.RUNNING, STATUS.COMPLETED);
    assertValidTransition(STATUS.RUNNING, STATUS.FAILED_CLEANUP);
    assertValidTransition(STATUS.RUNNING, STATUS.PENDING_CLEANUP);
    assertValidTransition(STATUS.RUNNING, STATUS.PENDING_AUTH_DELETION);
    assertValidTransition(STATUS.RUNNING, STATUS.OPERATOR_REVIEW);
  });

  it("failed_cleanup can retry to running or escalate to operator_review", () => {
    assertValidTransition(STATUS.FAILED_CLEANUP, STATUS.RUNNING);
    assertValidTransition(STATUS.FAILED_CLEANUP, STATUS.OPERATOR_REVIEW);
  });

  it("pending_auth_deletion can resolve to completed or escalate to operator_review", () => {
    assertValidTransition(STATUS.PENDING_AUTH_DELETION, STATUS.COMPLETED);
    assertValidTransition(STATUS.PENDING_AUTH_DELETION, STATUS.OPERATOR_REVIEW);
  });

  it("operator_review can resume to running or be cancelled", () => {
    assertValidTransition(STATUS.OPERATOR_REVIEW, STATUS.RUNNING);
    assertValidTransition(STATUS.OPERATOR_REVIEW, STATUS.CANCELLED);
  });

  it("terminal states (cancelled / completed) reject any further transition", () => {
    expect(STATE_GRAPH[STATUS.CANCELLED]).toEqual([]);
    expect(STATE_GRAPH[STATUS.COMPLETED]).toEqual([]);
    expect(() => assertValidTransition(STATUS.COMPLETED, STATUS.RUNNING)).toThrow(/disallowed/);
    expect(() => assertValidTransition(STATUS.CANCELLED, STATUS.RUNNING)).toThrow(/disallowed/);
  });

  it("rejects unknown source status", () => {
    expect(() => assertValidTransition("garbage", STATUS.RUNNING)).toThrow(/unknown source status/);
  });

  it("rejects unmapped destination from a known source", () => {
    expect(() => assertValidTransition(STATUS.REQUESTED, STATUS.COMPLETED)).toThrow(/disallowed/);
  });
});

describe("generateSupportCode", () => {
  it("matches DL-XXXXXX format with the safe alphabet", () => {
    const code = generateSupportCode();
    expect(code).toMatch(/^DL-[A-Z2-9]{6}$/);
    // safe alphabet excludes 0, 1, I, L, O — verify
    const tail = code.slice(3);
    expect(tail).not.toMatch(/[01ILO]/);
  });

  it("supports a deterministic rng for testing", () => {
    let i = 0;
    const fixed = generateSupportCode(() => {
      const v = i;
      i = (i + 1) % 31;
      return v;
    });
    expect(fixed).toBe("DL-ABCDEF");
  });
});

describe("assertMinimisedRecord", () => {
  it("accepts allowlisted fields", () => {
    expect(() =>
      assertMinimisedRecord({
        uid: "abc",
        status: "running",
        leaseGeneration: 1,
        operationId: "op-1",
      }),
    ).not.toThrow();
  });

  it("rejects forbidden personal-data fields", () => {
    expect(() =>
      assertMinimisedRecord({ uid: "abc", displayName: "Alice" }),
    ).toThrow(/forbidden field on accountDeletionRequests/);
    expect(() =>
      assertMinimisedRecord({ uid: "abc", email: "a@b.com" }),
    ).toThrow(/forbidden field on accountDeletionRequests/);
  });
});
