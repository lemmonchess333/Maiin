/**
 * The server's own steps on what a journey saves, run in this process.
 *
 * The emulator rig runs no Functions, so no trigger fires on a journey's
 * writes. Where a journey needs what a trigger writes, it runs that step
 * itself, with the handler `functions/index.js` exports, on this process's
 * clock (`nodeClock.ts`), as the trigger would on the same document.
 */
import { createRequire } from "node:module";
import { emulatorAdmin } from "./realCallables";

const require = createRequire(import.meta.url);

interface ServerSteps {
  _maybeWriteRecoveryEntryForRun: (uid: string, run: unknown) => Promise<void>;
}

function server(): ServerSteps {
  const exported = require("../../functions/index.js") as Partial<ServerSteps>;
  if (typeof exported._maybeWriteRecoveryEntryForRun !== "function")
    throw new Error(
      "functions/index.js no longer exports _maybeWriteRecoveryEntryForRun: point this at what onRunCreated calls now"
    );
  return exported as ServerSteps;
}

/**
 * `onRunCreated`'s step for the run saved at `users/{uid}/runs/{runId}`
 * that a race plan reads: a race run on race day starts the race's
 * recovery (`runPlan.phase`, `recoveryEndDate`). Nothing else the trigger
 * does (last active, challenges, performance) feeds the plan.
 */
export async function serverOnRunCreated(
  uid: string,
  runId: string
): Promise<void> {
  const saved = await emulatorAdmin()
    .db.doc(`users/${uid}/runs/${runId}`)
    .get();
  if (!saved.exists) throw new Error(`no run saved at ${runId}`);
  await server()._maybeWriteRecoveryEntryForRun(uid, saved.data());
}
