/**
 * Durable outbox for programme commands — the prerequisite the boundary
 * migration is actually blocked on (P6).
 *
 * ── Why this exists, measured rather than assumed ────────────────────────
 *
 * The v8 evaluation's P6 says: finish the command boundary, because "an audit
 * trail over a document that 19 client writers can still clobber is an audit
 * trail over a record that lies". Both halves of that turned out to understate
 * the problem.
 *
 * **There are 32 `saveProgram` call sites, not 19** — 26 in `useProgram.ts` and
 * 7 in `Program.tsx` — against ONE command-boundary caller (the deload button).
 *
 * **And the migration cannot proceed as a mechanical rewrite.** `saveProgram`
 * calls `setDocGuarded` → Firestore `setDoc`, and `firebase.ts` initialises the
 * SDK with `persistentLocalCache`, so those writes are queued by the SDK and
 * replay on reconnect. `applyProgramCommand` is an HTTPS callable, which is not.
 * `sendDeloadCommand` already says so in its own comment — "unlike the
 * offline-queued setDocGuarded writers, a callable can't replay".
 *
 * So migrating a writer to the boundary today TRADES a clobbering bug for an
 * offline data-loss bug. For a gym app, where a basement with no signal is the
 * normal case rather than the edge case, losing a logged workout is
 * categorically worse than a two-tab race. That is why the boundary has one
 * consumer and it is the one write that genuinely requires network.
 *
 * ── Why this is safe, and why the hard half was already done ─────────────
 *
 * Replaying a command is only sound if applying it twice is the same as
 * applying it once, and the SERVER already guarantees that:
 * `runProgramCommandTransaction` reads
 * `programState/current/commandReceipts/{commandId}` inside the transaction and
 * short-circuits if it exists. So a command retried after a timeout — where the
 * client never learned whether it landed — cannot double-apply.
 *
 * This module is therefore small on purpose. It is the client half of an
 * idempotency protocol whose difficult half already shipped: persist the
 * command with its id, replay it on reconnect, and let the server decide
 * whether it is a duplicate.
 *
 * ── What is NOT retried, and why that matters more than what is ──────────
 *
 * Only TRANSPORT failures queue. A command the server rejected — bad payload,
 * failed precondition, permission — is dropped, because retrying it will fail
 * identically forever. CLAUDE.md records that exact defect from the offline
 * queue: "a raw write that fails online fails forever on every flush", which
 * cost a migration of ~25 call sites to fix. A queue that retries poison is
 * worse than no queue.
 *
 * `failed-precondition` is the case worth naming: `applyDeloadWeek` throws it
 * when the week is already deloaded. A command queued offline may well arrive
 * into a world where its precondition no longer holds — and the correct
 * response is to drop it, not to force it through.
 *
 * ── Scoping and bounds ───────────────────────────────────────────────────
 *
 * Entries are uid-scoped. PR #820 fixed exactly this leak in the offline and
 * share queues: on a shared device, one account's queued work flushing under
 * another's auth. Flushing is likewise per-uid rather than indiscriminate.
 *
 * The queue is bounded. A failed storage write leaves the existing queue
 * intact and is reported to the caller, never retried by deleting older work.
 */

import { logger } from "@/lib/logger";
import { readJson, remove, writeJson } from "@/lib/localStore";

const OUTBOX_KEY = "tropos.program.commandOutbox";
const outboxListeners = new Set<() => void>();
let outboxVersion = 0;

function notifyOutbox(): void {
  outboxVersion += 1;
  for (const listener of outboxListeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key === OUTBOX_KEY || event.key === null) notifyOutbox();
}

/** Live queue updates, including changes from another browser tab. */
export function subscribeCommandOutbox(listener: () => void): () => void {
  if (outboxListeners.size === 0 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  outboxListeners.add(listener);
  return () => {
    outboxListeners.delete(listener);
    if (outboxListeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}

export const commandOutboxVersion = () => outboxVersion;

export interface CommandSettlement {
  commandId: string;
  kind: string;
  result: "applied" | "declined";
}
const latestSettlements = new Map<string, CommandSettlement>();

/** The latest replay result belongs only to the account that sent it. */
export function lastCommandSettlement(uid: string): CommandSettlement | null {
  return latestSettlements.get(uid) ?? null;
}

/**
 * Most commands to hold. A user offline for a long session generates a handful;
 * refuse new work at the limit rather than evict unsynced commands that
 * the caller has already told the person were saved.
 */
export const MAX_OUTBOX_ENTRIES = 50;

/**
 * Firebase callable error codes that mean "the network did not deliver this",
 * as opposed to "the server considered it and said no".
 *
 * `internal` is not on the list: it means both. See `isTransportFailure`.
 */
const TRANSPORT_CODES = new Set([
  "auth/network-request-failed",
  "functions/unavailable",
  "functions/deadline-exceeded",
  "functions/cancelled",
  "unavailable",
  "deadline-exceeded",
  "cancelled",
]);

/** A command as it waits to be sent. `commandId` is what makes replay safe. */
export interface OutboxEntry {
  uid: string;
  /** The full callable payload, including its `kind` and `commandId`. */
  command: { kind: string; commandId: string } & Record<string, unknown>;
  queuedAt: number;
}

/**
 * The messages an `internal` error carries when no answer came back: the
 * SDK's own for a fetch that failed or a gateway's reply it could not read
 * (@firebase/functions: postJSON, callAtURL), and the platform's for a
 * function that crashed before it could answer. The server's own
 * `internal` says what it failed to do ("Failed to apply programme
 * command.") and fails the same way on every replay.
 */
const NO_ANSWER_INTERNAL = new Set([
  "internal",
  "INTERNAL",
  "Response is not valid JSON object.",
  "Response is missing data field.",
]);

/** True when this could be a transient failure rather than a definitive refusal. */
export function isTransportFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== "string") {
    // No code at all — a raw network/fetch rejection. This is the offline case.
    return err instanceof Error;
  }
  if (code === "functions/internal" || code === "internal") {
    // Replaying the server's own refusal would hold it, and every command
    // queued after it, at the head of the queue for good.
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" && NO_ANSWER_INTERNAL.has(message);
  }
  return TRANSPORT_CODES.has(code);
}

function read(): OutboxEntry[] {
  const parsed = readJson<unknown>(OUTBOX_KEY, null);
  if (!Array.isArray(parsed)) return [];
  // Shape-guard every entry: a malformed one would either throw at send time
  // or, worse, post a command with no id and defeat the idempotency the whole
  // design rests on.
  return parsed.filter((e): e is OutboxEntry => {
    if (!e || typeof e !== "object") return false;
    const { uid, command } = e as Partial<OutboxEntry>;
    return (
      typeof uid === "string" &&
      !!command &&
      typeof command === "object" &&
      typeof command.kind === "string" &&
      typeof command.commandId === "string"
    );
  });
}

function write(
  entries: OutboxEntry[],
  settlement?: { uid: string; result: CommandSettlement }
): boolean {
  // localStorage.setItem is atomic on failure. Never shrink or delete the
  // previous queue to make a new write fit: that would lose unsynced work.
  if (!writeJson(OUTBOX_KEY, entries)) {
    logger.error("[commandOutbox] could not persist queued commands");
    return false;
  }
  if (settlement) latestSettlements.set(settlement.uid, settlement.result);
  notifyOutbox();
  return true;
}

/** Queue a command for replay. Caller must have established that the failure
 *  was transport — see `isTransportFailure`. */
export function enqueueCommand(
  uid: string,
  command: OutboxEntry["command"]
): boolean {
  const queue = read();
  // A retry may replace its own entry without growing or reordering the
  // queue. Matching ids from another account are distinct operations.
  const index = queue.findIndex(
    (e) => e.uid === uid && e.command.commandId === command.commandId
  );
  if (index !== -1) {
    queue[index] = { ...queue[index], command };
    return write(queue);
  }
  if (queue.length >= MAX_OUTBOX_ENTRIES) {
    logger.error(
      "[commandOutbox] queue full — could not queue command",
      command.kind
    );
    return false;
  }
  return write([...queue, { uid, command, queuedAt: Date.now() }]);
}

/** How many commands are waiting, for this uid or across all of them. */
export function outboxLength(uid?: string): number {
  const queue = read();
  return uid ? queue.filter((e) => e.uid === uid).length : queue.length;
}

/**
 * Replay this uid's queued commands, oldest first. Returns how many were
 * cleared — sent successfully OR permanently rejected, since both mean the
 * entry is done.
 *
 * Stops at the first TRANSPORT failure and leaves the rest queued: if the
 * network is down again there is no point walking the whole queue, and order is
 * preserved for commands that depend on each other.
 *
 * Entries belonging to other uids are never touched, so a flush under one
 * account cannot consume another's.
 */
export async function flushCommandOutbox(
  uid: string,
  send: (command: OutboxEntry["command"]) => Promise<unknown>
): Promise<number> {
  const queue = read();
  const mine = queue.filter((e) => e.uid === uid);
  if (mine.length === 0) return 0;

  // Ids this pass finished with — sent, or rejected by the server. Kept as
  // ids rather than as a rebuilt array: see the write-back below.
  const done = new Set<string>();
  let cleared = 0;
  let settlement: CommandSettlement | undefined;

  for (const entry of mine) {
    try {
      await send(entry.command);
      settlement = {
        commandId: entry.command.commandId,
        kind: entry.command.kind,
        result: "applied",
      };
      cleared += 1;
      done.add(entry.command.commandId);
    } catch (err) {
      if (isTransportFailure(err)) {
        // Still offline. This one and everything after it stay queued, in
        // order — commands can depend on each other.
        break;
      }
      // The server considered it and said no. Retrying is guaranteed to fail
      // the same way, so drop it — loudly, because a silently discarded
      // command is a user action that vanished.
      logger.error(
        `[commandOutbox] dropping ${entry.command.kind} — server rejected it`,
        err
      );
      settlement = {
        commandId: entry.command.commandId,
        kind: entry.command.kind,
        result: "declined",
      };
      cleared += 1;
      done.add(entry.command.commandId);
    }
  }

  // Write back against the queue AS IT IS NOW, not the snapshot taken before
  // the sends. Every send above is an await; a command enqueued meanwhile — a
  // write that failed while this flush ran, or the auth-change flush racing
  // the online one (App.tsx fires both) — exists only in storage, and writing
  // the pre-flush snapshot back erased it. Removing what this pass finished
  // from the LIVE queue keeps everything else, any uid, in storage order.
  const live = read();
  if (done.size === 0) return 0;
  if (
    !write(
      live.filter((e) => e.uid !== uid || !done.has(e.command.commandId)),
      settlement ? { uid, result: settlement } : undefined
    )
  ) {
    // The server may have applied these, but they remain queued. A later
    // replay uses the same ids and cannot apply the change twice.
    return 0;
  }
  return cleared;
}

/** Test seam — clears every uid's entries. */
export function __resetCommandOutboxForTests(): void {
  remove(OUTBOX_KEY);
  latestSettlements.clear();
  notifyOutbox();
}
