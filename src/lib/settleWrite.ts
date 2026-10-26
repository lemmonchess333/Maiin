/**
 * A Firestore write someone is waiting on, settled for the screen.
 *
 * The SDK commits a write to this device the moment it is made and sends
 * it when it can (the persistent cache, firebase.ts), but the promise it
 * returns waits for the server. Offline that is until the connection is
 * back: a "Saving…" waiting on it spun until then, the catch that says
 * "check your connection" never ran, and whatever came after the save
 * (reading today's steps after connecting Apple Health) never happened.
 *
 * Offline, this answers "queued" at once and hands the server's later
 * refusal, if there is one, to `onLateFailure`; online it is the write,
 * and a refusal throws as before. SpacePostComposer settles a text post
 * the same way.
 */
import { logger } from "./logger";

export type WriteOutcome = "saved" | "queued";

export async function settleWrite(
  write: Promise<unknown>,
  {
    label,
    onLateFailure,
    online = typeof navigator === "undefined" ? true : navigator.onLine,
  }: {
    /** Names the write in the log. */
    label: string;
    /** Offline only: the server refused the write once it was sent. */
    onLateFailure?: (err: unknown) => void;
    online?: boolean;
  }
): Promise<WriteOutcome> {
  if (online) {
    await write;
    return "saved";
  }
  write.catch((err) => {
    logger.warn(`[${label}] refused once back online`, err);
    onLateFailure?.(err);
  });
  return "queued";
}
