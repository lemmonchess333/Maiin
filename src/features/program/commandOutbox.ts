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
 * The queue is bounded and sheds the OLDEST entry on quota, logging each drop —
 * the offline queue's CORE-01 lesson, where the original code cleared the queue
 * entirely and lost everything silently.
 */

import { logger } from "@/lib/logger";
import { readJson, remove, writeJson } from "@/lib/localStore";

const OUTBOX_KEY = "tropos.program.commandOutbox";

/**
 * Most commands to hold. A user offline for a long session generates a handful;
 * anything approaching this is a bug or an attack, and shedding is preferable
 * to a localStorage value that cannot be written at all.
 */
export const MAX_OUTBOX_ENTRIES = 50;

/**
 * Firebase callable error codes that mean "the network did not deliver this",
 * as opposed to "the server considered it and said no".
 *
 * Deliberately narrow. `internal` is NOT here: it usually means the handler
 * threw, which will happen again on every replay. An error with no code at all
 * (a raw fetch failure) IS treated as transport — that is the airplane-mode
 * case this module exists for.
 */
const TRANSPORT_CODES = new Set([
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

/** True when the failure was the network rather than the server's judgement. */
export function isTransportFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code !== "string") {
    // No code at all — a raw network/fetch rejection. This is the offline case.
    return err instanceof Error;
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

function write(entries: OutboxEntry[]): void {
  let working = entries;
  for (;;) {
    if (writeJson(OUTBOX_KEY, working)) return;
    if (working.length === 0) {
      // Nothing fits even when empty — drop the key so a corrupt giant value
      // cannot wedge every future write.
      remove(OUTBOX_KEY);
      return;
    }
    logger.error(
      "[commandOutbox] storage full — shedding the oldest queued command",
      working[0]?.command.kind
    );
    working = working.slice(1);
  }
}

/** Queue a command for replay. Caller must have established that the failure
 *  was transport — see `isTransportFailure`. */
export function enqueueCommand(
  uid: string,
  command: OutboxEntry["command"]
): void {
  const queue = read();
  // Same commandId already waiting: the send was retried locally. Replacing
  // rather than appending keeps the queue from growing on a retry loop, and
  // the server would dedupe them anyway.
  const deduped = queue.filter(
    (e) => e.command.commandId !== command.commandId
  );
  deduped.push({ uid, command, queuedAt: Date.now() });
  if (deduped.length > MAX_OUTBOX_ENTRIES) {
    // The cap sheds the OLDEST entries. Shedding is necessary; shedding
    // silently is how the offline queue's CORE-01 bug lost everything —
    // and this path did exactly that (only the quota path logged). A dropped command is a user action that vanished.
    const shed = deduped.slice(0, deduped.length - MAX_OUTBOX_ENTRIES);
    logger.error(
      `[commandOutbox] queue full — shedding the oldest ${shed.length} queued command(s)`,
      shed.map((e) => e.command.kind)
    );
  }
  write(
    deduped.length > MAX_OUTBOX_ENTRIES
      ? deduped.slice(deduped.length - MAX_OUTBOX_ENTRIES)
      : deduped
  );
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

  for (const entry of mine) {
    try {
      await send(entry.command);
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
  write(live.filter((e) => !done.has(e.command.commandId)));
  return cleared;
}

/** Test seam — clears every uid's entries. */
export function __resetCommandOutboxForTests(): void {
  remove(OUTBOX_KEY);
}
