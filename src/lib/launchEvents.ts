/**
 * The launch numbers the server decides, sent to analytics once per account
 * (App1 Q17, 13 November 2026): `first_session_saved`, `week_4_returned`,
 * `trial_started` and `subscription_started`. The fifth, finished setup, is
 * `onboarding_completed`, sent by Onboarding.tsx as the plan is saved.
 *
 * What is true comes from the account's own document, written only by the
 * server: `launchMilestones` (the session triggers,
 * functions/lib/launchMilestones.js) and `activationBillingFirsts` (the
 * first verified trial and paid period, from RevenueCat's webhook and the
 * sync after a purchase, on the App Store or the website,
 * functions/lib/activationBilling.js). So a purchase the app never saw
 * finish, closed after Apple's sheet or a trial that turned paid with the
 * app shut, is still sent, by the next device that opens. The money events
 * come from that record and never from a checkout's own answer, which can
 * miss a sale and, on the web, cannot tell a trial from a payment.
 *
 * Once per account, across devices: each event is claimed in a transaction
 * on `users/{uid}/settings/launchEvents` before it is sent, and only the
 * device whose claim commits sends it. A device claims nothing until
 * analytics is delivering (`analyticsSettled`), so a build or browser whose
 * events go nowhere leaves the claim for one whose events arrive, and an
 * event is never claimed before the provider can take it. The event goes
 * to the provider as the claim commits; one lost after that (a blocker on
 * the network, the app killed before the provider sends) is not sent
 * again: never twice is the rule.
 *
 * Only an account set up since this was built is sent anything: its
 * profile carries `launchMilestones` (stamped empty at the first setup). An
 * older account's next session is not its first, and its numbers were never
 * kept from the start. A number more than 30 days old by the time a device
 * sees it is not sent, as it would be counted in the wrong month.
 *
 * Parameters are enums and whole numbers only: no id, no name, no time.
 */
import {
  doc,
  onSnapshot,
  runTransaction,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { analyticsSettled } from "./analyticsProvider";
import {
  track,
  type LifecycleEvent,
  type LifecycleEventMetadata,
} from "./lifecycleAnalytics";
import { logger } from "./logger";

type LaunchEvent = Extract<
  LifecycleEvent,
  | "first_session_saved"
  | "week_4_returned"
  | "trial_started"
  | "subscription_started"
>;

interface DueEvent {
  event: LaunchEvent;
  params: LifecycleEventMetadata;
}

const DAY_MS = 86_400_000;
/** How old a number may be when a device first sees it and still be sent. */
const FRESH_FOR_MS = 30 * DAY_MS;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function timestampMs(value: unknown): number | null {
  if (!isRecord(value) || typeof value.toMillis !== "function") return null;
  const ms = (value.toMillis as () => unknown)();
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

function wholeDays(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : undefined;
}

/** The events this account's document says are due, before any claim. */
function dueEvents(data: DocumentData, nowMs: number): DueEvent[] {
  const milestones = data.launchMilestones;
  if (!isRecord(milestones)) return [];
  const fresh = (atMs: unknown): atMs is number =>
    Number.isSafeInteger(atMs) && nowMs - (atMs as number) <= FRESH_FOR_MS;
  const due: DueEvent[] = [];

  const session = (event: LaunchEvent, value: unknown) => {
    if (!isRecord(value) || !fresh(value.atMs)) return;
    if (value.kind !== "lift" && value.kind !== "run") return;
    due.push({
      event,
      params: {
        kind: value.kind,
        daysSinceSetup: wholeDays(value.daysSinceSetup),
      },
    });
  };
  session("first_session_saved", milestones.firstSession);
  session("week_4_returned", milestones.week4Return);

  const setupMs = timestampMs(data.onboardingCompletedAt);
  const firsts = isRecord(data.activationBillingFirsts)
    ? data.activationBillingFirsts
    : {};
  const billing = (event: LaunchEvent, value: unknown) => {
    if (!isRecord(value) || !fresh(value.atMs)) return;
    if (value.source !== "ios_iap" && value.source !== "stripe") return;
    due.push({
      event,
      params: {
        purchasePlatform: value.source === "ios_iap" ? "ios" : "web",
        daysSinceSetup:
          setupMs === null
            ? undefined
            : wholeDays(Math.floor((value.atMs - setupMs) / DAY_MS)),
      },
    });
  };
  billing("trial_started", firsts.trial);
  billing("subscription_started", firsts.paid);
  return due;
}

/** Claim what no device has sent yet; returns the events this device won. */
function claim(uid: string, due: DueEvent[]): Promise<DueEvent[]> {
  const ref = doc(db, "users", uid, "settings", "launchEvents");
  return runTransaction(db, async (transaction) => {
    const claimed = (await transaction.get(ref)).data() ?? {};
    const won = due.filter(({ event }) => claimed[event] !== true);
    if (won.length > 0)
      transaction.set(
        ref,
        Object.fromEntries(won.map(({ event }) => [event, true])),
        { merge: true }
      );
    return won;
  });
}

/**
 * Watch the account's document and send each launch number it holds once.
 * Returns the stop. Mounted once for a signed-in, set-up account (App.tsx).
 */
export function startLaunchEvents(uid: string): () => void {
  /** Events this run has claimed, or found claimed by another device. */
  const settledHere = new Set<LaunchEvent>();
  let stopped = false;
  let chain: Promise<void> = Promise.resolve();

  const report = async (data: DocumentData) => {
    const due = dueEvents(data, Date.now()).filter(
      ({ event }) => !settledHere.has(event)
    );
    if (stopped || due.length === 0) return;
    if (!(await analyticsSettled()) || stopped) return;
    let won: DueEvent[];
    try {
      won = await claim(uid, due);
    } catch (err) {
      // Offline, or refused: nothing is claimed, so a later snapshot (the
      // one that arrives on reconnecting) tries again.
      logger.warn("[launchEvents] claim failed", { err: String(err) });
      return;
    }
    for (const { event } of due) settledHere.add(event);
    for (const { event, params } of won) track(event, params);
  };

  const unsubscribe = onSnapshot(
    doc(db, "users", uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      // The server's copy only: the cache's is followed by it, and a
      // claim made from the cache would fail offline anyway.
      if (stopped || !snapshot.exists() || snapshot.metadata.fromCache) return;
      const data = snapshot.data();
      chain = chain
        .then(() => report(data))
        .catch((err) =>
          logger.warn("[launchEvents] report failed", { err: String(err) })
        );
    },
    (err) => logger.warn("[launchEvents] listener failed", { err: String(err) })
  );

  return () => {
    stopped = true;
    unsubscribe();
  };
}
