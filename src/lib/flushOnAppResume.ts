import { onAppResume } from "@/lib/appResume";

/** The shortest time between two retries. Coming back to the app reports
 *  itself two or three ways at once (shown, focused, active on a phone). */
export const RESUME_FLUSH_GAP_MS = 30_000;

/**
 * Retry queued work each time the person comes back to the app, at most
 * once per gap. Returns the stop.
 *
 * Signed in, the queues are otherwise flushed once at sign-in and then on
 * the browser's `online` event. That leaves two cases with nothing to
 * retry them: a flush that failed while the phone stayed connected (a
 * timeout, a 503, a token that would not refresh), and a connection that
 * came back while the app was in the background, where a WKWebView does
 * not reliably report it. A session finished with no signal then waited
 * for the next write or a restart. Each queue serialises its own flush
 * and replays by document id, so an extra retry is safe.
 *
 * The clock starts at the call, so the flush the caller has just made is
 * not repeated by a focus event in the same moment.
 */
export function flushOnAppResume(
  flush: () => void,
  gapMs: number = RESUME_FLUSH_GAP_MS,
  now: () => number = Date.now
): () => void {
  let last = now();
  return onAppResume(() => {
    const at = now();
    if (at - last < gapMs) return;
    last = at;
    flush();
  });
}
