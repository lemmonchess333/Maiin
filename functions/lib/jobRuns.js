"use strict";

/**
 * Every scheduled job leaves a record of its last run in `jobRuns/{name}`:
 * when it started, when it finished, and how.
 *
 * Before, a job left only log lines, and most of them caught their own
 * failure and returned, so Cloud Functions counted a failed run as a
 * success: the active-user sweep logged one line when its first query
 * failed and "succeeded", and a run killed at its 540 s limit left nothing
 * at all. Now the job's failure is rethrown (no scheduled job retries, so
 * nothing runs twice) and recorded, and a start with no finish after it is
 * a run that was killed.
 *
 * Read in the Firebase console. The collection has no client rules, so
 * only the Admin SDK reads or writes it. Writing the record never breaks
 * the job: a failed write is logged and the job goes on.
 */

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+/g;

/** An error message fit to store: no addresses, and short. */
function storableMessage(err) {
  const message = (err && err.message) || String(err);
  return message.replace(EMAIL, "<email>").slice(0, 300);
}

/**
 * Run `job`, recording it under `name`. Resolves to what `job` resolves to
 * (a small summary such as `{ users, failed }`, stored with the run), and
 * rejects with what it rejects with.
 */
async function recordJobRun(
  firestore,
  name,
  job,
  { now = () => new Date() } = {}
) {
  const ref = firestore.collection("jobRuns").doc(name);
  const write = async (fields) => {
    try {
      await ref.set(fields, { merge: true });
    } catch (err) {
      console.error(`jobRuns: could not record ${name}:`, storableMessage(err));
    }
  };

  const startedAt = now();
  await write({ name, lastStartedAt: startedAt, running: true });
  try {
    const summary = await job();
    const finishedAt = now();
    await write({
      lastFinishedAt: finishedAt,
      lastOutcome: "ok",
      lastDurationMs: finishedAt - startedAt,
      lastSummary: summary === undefined ? null : summary,
      lastError: null,
      running: false,
    });
    return summary;
  } catch (err) {
    const finishedAt = now();
    await write({
      lastFinishedAt: finishedAt,
      lastFailedAt: finishedAt,
      lastOutcome: "failed",
      lastDurationMs: finishedAt - startedAt,
      lastError: storableMessage(err),
      running: false,
    });
    throw err;
  }
}

module.exports = { recordJobRun, storableMessage };
