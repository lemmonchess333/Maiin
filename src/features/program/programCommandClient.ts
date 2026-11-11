/**
 * The client side of the programme command boundary — one send path, shared by
 * the direct call and the outbox replay.
 *
 * Split from `commandOutbox.ts` so the queue stays a pure, testable module: the
 * outbox takes its sender as a parameter and never imports Firebase, which is
 * what lets its ordering, dedupe and drop rules be exercised without a callable
 * mock. This module is the thin part that knows about the network.
 *
 * One send function, deliberately. Two would be two places for the callable's
 * name to drift, and the replay path is exactly the path that must behave
 * identically to the original attempt — the server dedupes on `commandId`, so a
 * replay that differed in any other field would be a different command wearing
 * a used id.
 */

import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

import { flushCommandOutbox, type OutboxEntry } from "./commandOutbox";

/** Send one command to the server boundary. Throws on any failure; callers
 *  decide whether the failure was transport (queue it) or a rejection (drop
 *  it) via `isTransportFailure`. */
export async function sendProgramCommand(
  command: OutboxEntry["command"],
  expectedUid?: string
): Promise<void> {
  const call = httpsCallable(getFunctions(), "applyProgramCommand");
  // The SDK obtains its auth token asynchronously. The server must also
  // check ownership in case the account switches after our local guard.
  await call(expectedUid === undefined ? command : { command, expectedUid });
}

/** Replay this uid's queued commands. Returns how many entries were cleared. */
export function flushProgramCommands(uid: string): Promise<number> {
  return flushCommandOutbox(uid, async (command) => {
    // A replay can await several requests. Recheck before EACH one, rather
    // than trusting the uid from the online/auth event that began the flush.
    const auth = getAuth();
    const accountChanged = () => auth.currentUser?.uid !== uid;
    const stopped = () => Object.assign(new Error("Programme replay account changed"), {
      code: "functions/cancelled",
    });
    if (accountChanged()) throw stopped();
    try {
      await sendProgramCommand(command, uid);
    } catch (err) {
      // Signing out during a request is not a permanent server refusal.
      if (accountChanged()) throw stopped();
      throw err;
    }
  });
}
