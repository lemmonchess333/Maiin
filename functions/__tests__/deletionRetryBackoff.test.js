/**
 * A deletion that keeps failing waits longer each time, and the owner is
 * told once. It was retried a minute after every failure, which the
 * five-minute resume job made "every five minutes, for good", and nobody
 * heard about it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { deleteAccount } = require("../accountDeletion");
const { nextRetryAt } = require("../lib/accountDeletionLedger");
const {
  alertIfStuck,
  resumeDeletions,
} = require("../lib/accountDeletionRetry");
const {
  STUCK_AFTER_ATTEMPTS,
  buildStuckDeletionEmail,
} = require("../lib/deletionAlert");

const now = Date.UTC(2026, 9, 20, 12);
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
const MINUTE = 60 * 1000;

afterEach(() => vi.useRealTimers());

describe("a failed deletion's next attempt", () => {
  it("waits 1, 2, then 4 minutes after successive failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const firestore = memoryFirestore({ "users/alice": { displayName: "A" } });
    firestore.failures.set("recursiveDelete:users/alice", new Error("outage"));
    const ctx = {
      firestore,
      auth: { deleteUser: vi.fn() },
      storageBucket: { deleteFiles: vi.fn() },
      uid: "alice",
      logger,
    };
    const waits = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const at = Date.now();
      await expect(deleteAccount({ ...ctx, now: at })).rejects.toThrow(
        "outage"
      );
      const request = firestore.data.get("accountDeletionRequests/alice");
      expect(request.status).toBe("failed_cleanup");
      waits.push(request.nextAttemptAt.getTime() - at);
      vi.setSystemTime(request.nextAttemptAt.getTime());
    }
    // Before: 1 minute, every time.
    expect(waits).toEqual([MINUTE, 2 * MINUTE, 4 * MINUTE]);
  });

  it("settles at six hours", () => {
    expect(nextRetryAt(9, now).getTime() - now).toBe(256 * MINUTE);
    expect(nextRetryAt(10, now).getTime() - now).toBe(6 * 60 * MINUTE);
    expect(nextRetryAt(40, now).getTime() - now).toBe(6 * 60 * MINUTE);
  });
});

describe("telling the owner", () => {
  const stuck = (fields = {}) =>
    memoryFirestore({
      "accountDeletionRequests/alice": {
        resumeVersion: 2,
        status: "failed_cleanup",
        attemptCount: STUCK_AFTER_ATTEMPTS,
        supportCode: "DL-ABC234",
        failedStage: "users",
        lastErrorCode: "unavailable",
        nextAttemptAt: new Date(now),
        ...fields,
      },
    });

  it("sends the alert once, when the request has failed often enough", async () => {
    const firestore = stuck();
    const sendAlert = vi.fn().mockResolvedValue({ sent: true });
    await alertIfStuck({ firestore, uid: "alice", sendAlert, logger });
    await alertIfStuck({ firestore, uid: "alice", sendAlert, logger });
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(sendAlert).toHaveBeenCalledWith(
      expect.objectContaining({ supportCode: "DL-ABC234" })
    );
    expect(
      firestore.data.get("accountDeletionRequests/alice").stuckAlertedAt
    ).toBeDefined();
  });

  it("waits for the threshold, and tries again after an alert that did not send", async () => {
    const early = stuck({ attemptCount: STUCK_AFTER_ATTEMPTS - 1 });
    const sendAlert = vi.fn().mockResolvedValue({ sent: false });
    await alertIfStuck({ firestore: early, uid: "alice", sendAlert, logger });
    expect(sendAlert).not.toHaveBeenCalled();

    const due = stuck();
    await alertIfStuck({ firestore: due, uid: "alice", sendAlert, logger });
    await alertIfStuck({ firestore: due, uid: "alice", sendAlert, logger });
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it("is checked by the resume job after a retry fails", async () => {
    const firestore = stuck();
    const sendAlert = vi.fn().mockResolvedValue({ sent: true });
    const execute = vi.fn().mockRejectedValue(new Error("outage"));
    await resumeDeletions({
      firestore,
      deleteAccount: execute,
      logger,
      sendAlert,
      now,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(sendAlert).toHaveBeenCalledOnce();
  });

  it("names the request by its support code, never by uid", () => {
    const email = buildStuckDeletionEmail({
      uid: "alice-uid-123",
      supportCode: "DL-ABC234",
      attemptCount: 6,
      failedStage: "users",
      lastErrorCode: "unavailable",
      lastErrorMessage: "failed for alice@example.com",
    });
    expect(email.subject).toBe("An account deletion is stuck (DL-ABC234)");
    expect(email.text).toContain("has failed 6 times");
    expect(email.text).toContain('"users" with "unavailable"');
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain("alice-uid-123");
      expect(part).not.toContain("alice@example.com");
    }
  });
});
