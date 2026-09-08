// @vitest-environment jsdom — the outbox is a localStorage queue; the rest of
// this directory runs in the fast node environment.
/**
 * The programme command outbox (P6).
 *
 * The queue exists because migrating writers to the command boundary otherwise
 * trades a clobbering bug for offline data loss — `saveProgram` rides
 * Firestore's `persistentLocalCache` and replays; a callable does not. So these
 * tests are about the three ways a replay queue goes wrong:
 *
 *   1. **Retrying poison.** A command the server REJECTED must be dropped, not
 *      retried forever. CLAUDE.md records this exact defect from the offline
 *      queue — "a raw write that fails online fails forever on every flush" —
 *      and it cost a ~25-call-site migration to fix.
 *   2. **Crossing accounts.** PR #820 fixed one account's queued work flushing
 *      under another's auth on a shared device.
 *   3. **Losing work silently.** Shedding on quota is necessary; doing it
 *      quietly is how the offline queue's CORE-01 bug lost everything.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import { logger } from "@/lib/logger";
import {
  MAX_OUTBOX_ENTRIES,
  __resetCommandOutboxForTests,
  enqueueCommand,
  flushCommandOutbox,
  isTransportFailure,
  outboxLength,
} from "../commandOutbox";

const cmd = (commandId: string, kind = "applyDeloadWeek") => ({
  kind,
  commandId,
  expectedWeekNumber: 3,
});

/** A Firebase callable error, which carries a `code`. */
const callableError = (code: string) =>
  Object.assign(new Error(code), { code });

beforeEach(() => {
  __resetCommandOutboxForTests();
});

describe("isTransportFailure — what may be retried", () => {
  it("treats the network codes as retryable", () => {
    for (const code of [
      "functions/unavailable",
      "functions/deadline-exceeded",
      "functions/cancelled",
    ]) {
      expect(isTransportFailure(callableError(code)), code).toBe(true);
    }
    // A raw fetch rejection carries no code at all — the airplane-mode case
    // this module exists for.
    expect(isTransportFailure(new Error("Failed to fetch"))).toBe(true);
  });

  it("does NOT retry a server judgement", () => {
    // The distinction the whole design rests on: these fail identically on
    // every replay, so queuing them builds a queue that never drains.
    for (const code of [
      "functions/invalid-argument",
      "functions/failed-precondition",
      "functions/permission-denied",
      "functions/unauthenticated",
      // `internal` usually means the handler threw — it will throw again.
      "functions/internal",
    ]) {
      expect(isTransportFailure(callableError(code)), code).toBe(false);
    }
  });
});

describe("enqueueCommand", () => {
  it("queues and counts per uid", () => {
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("bob", cmd("c2"));
    expect(outboxLength("alice")).toBe(1);
    expect(outboxLength("bob")).toBe(1);
    expect(outboxLength()).toBe(2);
  });

  it("replaces rather than appends on a repeated commandId", () => {
    // A locally-retried send must not grow the queue. The server would dedupe
    // them anyway, so two entries would only mean two round trips.
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c1"));
    expect(outboxLength("alice")).toBe(1);
  });

  it("is bounded, shedding the oldest", () => {
    for (let i = 0; i < MAX_OUTBOX_ENTRIES + 5; i++) {
      enqueueCommand("alice", cmd(`c${i}`));
    }
    expect(outboxLength("alice")).toBe(MAX_OUTBOX_ENTRIES);
  });
});

describe("flushCommandOutbox", () => {
  it("sends queued commands oldest first and clears them", async () => {
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c2"));
    const seen: string[] = [];
    const sent = await flushCommandOutbox("alice", async (c) => {
      seen.push(c.commandId);
    });
    expect(seen).toEqual(["c1", "c2"]);
    expect(sent).toBe(2);
    expect(outboxLength("alice")).toBe(0);
  });

  it("keeps the queue when the network is still down, in order", async () => {
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c2"));
    await flushCommandOutbox("alice", async () => {
      throw callableError("functions/unavailable");
    });
    expect(outboxLength("alice")).toBe(2);

    // …and the retained order is preserved on the next attempt.
    const seen: string[] = [];
    await flushCommandOutbox("alice", async (c) => {
      seen.push(c.commandId);
    });
    expect(seen).toEqual(["c1", "c2"]);
  });

  it("stops at the first transport failure rather than walking the queue", async () => {
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c2"));
    enqueueCommand("alice", cmd("c3"));
    let calls = 0;
    await flushCommandOutbox("alice", async () => {
      calls += 1;
      if (calls === 2) throw callableError("functions/unavailable");
    });
    // c1 sent, c2 failed — c3 is not attempted, and both remain queued in
    // order. Commands can depend on each other, so skipping ahead is wrong.
    expect(calls).toBe(2);
    expect(outboxLength("alice")).toBe(2);
  });

  it("DROPS a command the server rejected, loudly", async () => {
    // The defect this guards: a poison entry that retries forever. Dropping is
    // right; dropping silently is not — a user action that vanished must leave
    // a trace.
    // Spy on the LOGGER, not on console.error: `logger.error` is
    // `console.error.bind(console)` captured at module load, so a late spy on
    // console never sees it.
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c2"));
    const cleared = await flushCommandOutbox("alice", async (c) => {
      if (c.commandId === "c1") {
        throw callableError("functions/failed-precondition");
      }
    });
    expect(cleared).toBe(2); // the rejected one is done, not pending
    expect(outboxLength("alice")).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never touches another account's queue", async () => {
    // PR #820's lesson at command scope: on a shared device, alice's flush
    // must not send bob's work under alice's auth, and must not delete it.
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("bob", cmd("c2"));
    const seen: string[] = [];
    await flushCommandOutbox("alice", async (c) => {
      seen.push(c.commandId);
    });
    expect(seen).toEqual(["c1"]);
    expect(outboxLength("bob")).toBe(1);
  });

  it("is a no-op for a uid with nothing queued", async () => {
    enqueueCommand("bob", cmd("c1"));
    const send = vi.fn();
    expect(await flushCommandOutbox("alice", send)).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("discards a malformed entry rather than sending a command with no id", async () => {
    // An entry with no `commandId` would post a command the server cannot
    // dedupe, defeating the property the whole design rests on.
    localStorage.setItem(
      "tropos.program.commandOutbox",
      JSON.stringify([
        { uid: "alice", command: { kind: "applyDeloadWeek" }, queuedAt: 1 },
        { uid: "alice", command: cmd("good"), queuedAt: 2 },
      ])
    );
    const seen: string[] = [];
    await flushCommandOutbox("alice", async (c) => {
      seen.push(c.commandId);
    });
    expect(seen).toEqual(["good"]);
  });

  it("survives a corrupt store instead of throwing", () => {
    localStorage.setItem("tropos.program.commandOutbox", "{not json");
    expect(outboxLength("alice")).toBe(0);
    expect(() => enqueueCommand("alice", cmd("c1"))).not.toThrow();
    expect(outboxLength("alice")).toBe(1);
  });
});

describe("flushCommandOutbox — a command enqueued DURING a flush survives it", () => {
  /**
   * The flush snapshotted the queue, awaited every send, then wrote the
   * snapshot's leftovers back — so anything enqueued while a send was in
   * flight (another failed write, or the auth-change flush racing the
   * online one) was erased. Silent loss, no test. The write-back now
   * removes only what this pass finished from the LIVE queue.
   */
  it("keeps a command queued mid-flush, for this account and another", async () => {
    enqueueCommand("alice", cmd("c1"));
    const seen: string[] = [];
    await flushCommandOutbox("alice", async (c) => {
      seen.push(c.commandId);
      if (c.commandId === "c1") {
        // Arrives while c1's send is in flight.
        enqueueCommand("alice", cmd("c2"));
        enqueueCommand("bob", cmd("c3"));
      }
    });
    expect(seen).toEqual(["c1"]);
    expect(outboxLength("alice")).toBe(1);
    expect(outboxLength("bob")).toBe(1);

    // The retained command is intact and sends on the next pass.
    const next: string[] = [];
    await flushCommandOutbox("alice", async (c) => {
      next.push(c.commandId);
    });
    expect(next).toEqual(["c2"]);
    expect(outboxLength("alice")).toBe(0);
    expect(outboxLength("bob")).toBe(1);
  });

  it("still clears what it sent when the queue changed underneath it", async () => {
    enqueueCommand("alice", cmd("c1"));
    enqueueCommand("alice", cmd("c2"));
    await flushCommandOutbox("alice", async (c) => {
      if (c.commandId === "c1") enqueueCommand("alice", cmd("c9"));
    });
    // c1 and c2 sent; c9 (mid-flush) remains — nothing sent is left behind,
    // nothing new is lost.
    expect(outboxLength("alice")).toBe(1);
  });
});

describe("enqueueCommand — shedding on the cap is loud", () => {
  it("logs what it drops when the queue is full", () => {
    const spy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    for (let i = 0; i < MAX_OUTBOX_ENTRIES; i++) {
      enqueueCommand("alice", cmd(`c${i}`));
    }
    expect(spy).not.toHaveBeenCalled();
    enqueueCommand("alice", cmd("overflow"));
    expect(outboxLength("alice")).toBe(MAX_OUTBOX_ENTRIES);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/shedding the oldest 1 queued command/),
      ["applyDeloadWeek"]
    );
    spy.mockRestore();
  });
});
