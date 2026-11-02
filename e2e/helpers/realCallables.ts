/**
 * The app's callables, answered by their real handlers.
 *
 * The emulator rig serves Auth and Firestore, not Functions. A callable the
 * page sends goes to `127.0.0.1:5001` and fails as transport, and the app
 * carries on: a programme command waits in the outbox and nothing is saved.
 * A spec that taps Save, Skip or Go to Today has to answer the call.
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
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { onRealClock } from "./nodeClock";

const require = createRequire(import.meta.url);

/** The callables the plan's screens send. */
export type PlanCallable =
  "completeOnboarding" | "configurePlan" | "applyProgramCommand";

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

/**
 * The caller's ID token, as the emulator verifies it. Against the emulator
 * the Admin SDK checks every token for revocation by its `auth_time`, and
 * the emulator's sign-up stamps that a moment before the account's
 * `validSince`: when a second ends between the two, every token from that
 * sign-in reads as revoked, though the emulator, which checks `iat`,
 * accepts it. Such a token is taken as the emulator takes it.
 */
async function verifiedCaller(bearer: string): Promise<DecodedIdToken> {
  const { auth } = emulatorAdmin();
  try {
    // The emulator mints tokens at the real time; checked against a moved
    // clock, every one would read as expired.
    return await onRealClock(() => auth.verifyIdToken(bearer));
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/id-token-revoked")
      throw error;
    const claims = JSON.parse(
      Buffer.from(bearer.split(".")[1] ?? "", "base64url").toString()
    ) as DecodedIdToken;
    const { tokensValidAfterTime } = await auth.getUser(claims.sub);
    if (
      tokensValidAfterTime !== undefined &&
      claims.iat * 1000 < new Date(tokensValidAfterTime).getTime()
    )
      throw error;
    return { ...claims, uid: claims.sub };
  }
}

function profileOf(uid: string) {
  return emulatorAdmin().db.doc(`users/${uid}`).get();
}

/**
 * A new account's first setup, dated on the journey's day. The handler
 * stamps `onboardingCompletedAt` (and the sign-up stamped `createdAt`) with
 * a server timestamp, which the emulator resolves on the real clock, not
 * this process's moved one. A journey starting on the next Monday is 7
 * days ahead when it runs on a Monday, so the account would open on its
 * eighth day, its first week already over. Production stamps both on the
 * day the person signs up and sets up, which here is the journey's day.
 * Written before the reply, so the profile the app reads next has it.
 */
async function startOnTheJourneysDay(uid: string): Promise<void> {
  const at = Timestamp.fromMillis(Date.now());
  await emulatorAdmin()
    .db.doc(`users/${uid}`)
    .update({ createdAt: at, onboardingCompletedAt: at });
}

async function answer(route: Route, name: string, handler: CallableHandler) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const bearer = (route.request().headers().authorization ?? "").replace(
    /^Bearer /,
    ""
  );
  const token = await verifiedCaller(bearer);
  try {
    const firstSetup =
      name === "completeOnboarding" &&
      !(await profileOf(token.uid)).get("onboardingCompletedAt");
    const result = await handler.run(route.request().postDataJSON().data, {
      auth: { uid: token.uid, token },
    });
    if (firstSetup) await startOnTheJourneysDay(token.uid);
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
  /* completeOnboarding puts a share of new accounts on the legacy
     journey by a hash of the uid, and the emulator's uids are random:
     0 keeps every account on the journey the specs walk. The one that
     walks the legacy journey gets there as an older app does, by sending
     no journey marker. */
  await emulatorAdmin()
    .db.doc("system/config")
    .set({ activationComparisonPercent: 0 }, { merge: true });
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
