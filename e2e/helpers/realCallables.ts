/**
 * The app's callables, answered by their real handlers.
 *
 * The emulator rig serves Auth and Firestore, not Functions. A callable the
 * page sends goes to `127.0.0.1:5001` and fails as transport, and the app
 * carries on: a programme command waits in the outbox and nothing is saved.
 * A spec that taps Save, Skip or Start my plan has to answer the call.
 *
 * Each route here verifies the caller's ID token with the Admin SDK and runs
 * the handler `functions/index.js` exports, as `run(data, { auth })`, so the
 * write is the one production makes: its transaction, its allow-list, its
 * refusals. A refusal goes back to the page as the callable's error, which
 * the client handles as it does in production.
 *
 * The handlers run in this process, on its clock (`nodeClock.ts`): move it
 * with the page's.
 */
import type { Page, Route } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { onRealClock } from "./nodeClock";

const require = createRequire(import.meta.url);

/** The callables the plan's screens send. */
export type PlanCallable =
  | "completeOnboarding"
  | "configurePlan"
  | "applyProgramCommand";

export const PLAN_CALLABLES: readonly PlanCallable[] = [
  "completeOnboarding",
  "configurePlan",
  "applyProgramCommand",
];

interface CallableHandler {
  run: (
    data: unknown,
    context: { auth: { uid: string; token: unknown } }
  ) => Promise<unknown>;
}

/** The Admin SDK on the emulator, one app for the whole process. */
export function emulatorAdmin() {
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-tropos" });
  return { auth: getAuth(app), db: getFirestore(app), Timestamp };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

/** What a callable sends back for a thrown error, as the Functions runtime
 *  sends it: an `HttpsError`'s code, message and details, with its HTTP
 *  status, or INTERNAL for anything else. The client SDK reads the body
 *  into the `FunctionsError` the app handles. */
function errorReply(error: unknown) {
  const e = error as {
    message?: string;
    details?: unknown;
    httpErrorCode?: { canonicalName?: string; status?: number };
  };
  const { canonicalName, status } = e.httpErrorCode ?? {};
  if (typeof canonicalName !== "string" || typeof status !== "number")
    return { status: 500, error: { status: "INTERNAL", message: "INTERNAL" } };
  return {
    status,
    error: {
      status: canonicalName,
      message: e.message ?? "",
      ...(e.details !== undefined ? { details: e.details } : {}),
    },
  };
}

async function answer(route: Route, name: string, handler: CallableHandler) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const { auth } = emulatorAdmin();
  const bearer = (route.request().headers().authorization ?? "").replace(
    /^Bearer /,
    ""
  );
  // The emulator mints tokens at the real time; checked against a moved
  // clock, every one would read as expired.
  const token = await onRealClock(() => auth.verifyIdToken(bearer));
  try {
    const result = await handler.run(route.request().postDataJSON().data, {
      auth: { uid: token.uid, token },
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify({ result }),
    });
  } catch (error) {
    const reply = errorReply(error);
    // A refusal is the handler's answer, and a spec may expect one; the
    // log says which, for the one that didn't.
    console.log(
      `[realCallables] ${name}: ${reply.error.status} ${(error as Error)?.message ?? ""}`
    );
    await route.fulfill({
      status: reply.status,
      contentType: "application/json",
      headers: CORS,
      body: JSON.stringify({ error: reply.error }),
    });
  }
}

/**
 * Routes the page's calls to `names` into their real handlers. Call before
 * the page sends the first one; the routes last for the page's life.
 */
export async function routeRealCallables(
  page: Page,
  names: readonly PlanCallable[] = PLAN_CALLABLES
): Promise<void> {
  const exported = require("../../functions/index.js") as Record<
    string,
    CallableHandler
  >;
  for (const name of names) {
    const handler = exported[name];
    if (!handler || typeof handler.run !== "function")
      throw new Error(`functions/index.js exports no callable "${name}"`);
    await page.route(`**/demo-tropos/us-central1/${name}`, (route) =>
      answer(route, name, handler)
    );
  }
}
