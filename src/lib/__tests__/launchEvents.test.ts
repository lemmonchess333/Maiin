/**
 * App1 Q17: the launch numbers the server keeps, sent once per account by
 * whichever of its devices is open (`launchEvents.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  flushSnapshots,
  readDoc,
  readsAt,
  resetFirestore,
  seedFirestore,
  setSnapshotMetadata,
  unfiredFailures,
} from "@/test/firestoreHarness";

const h = vi.hoisted(() => ({
  settled: vi.fn(async () => true),
  track: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("../analyticsProvider", () => ({
  analyticsSettled: () => h.settled(),
}));
vi.mock("../lifecycleAnalytics", () => ({
  track: (...args: unknown[]) => h.track(...args),
}));

import { startLaunchEvents } from "../launchEvents";

const DAY = 86_400_000;
const NOW = Date.now();
const SETUP = NOW - 10 * DAY;
const USER = "users/u1";
const CLAIMS = "users/u1/settings/launchEvents";

function account(extra: Record<string, unknown> = {}) {
  return {
    onboardingComplete: true,
    onboardingCompletedAt: Timestamp.fromMillis(SETUP),
    ...extra,
  };
}

const firstSession = {
  atMs: SETUP + 2 * DAY + 3_600_000,
  kind: "run",
  daysSinceSetup: 2,
};

/** Let every queued promise settle: a claim is several awaits deep. */
const drain = () => new Promise((resolve) => setTimeout(resolve, 0));

const stops: (() => void)[] = [];
function start(uid = "u1") {
  const stop = startLaunchEvents(uid);
  stops.push(stop);
  return stop;
}

beforeEach(() => {
  resetFirestore();
  h.settled.mockReset();
  h.settled.mockResolvedValue(true);
  h.track.mockReset();
});

afterEach(() => {
  while (stops.length) stops.pop()?.();
});

describe("startLaunchEvents", () => {
  it("sends the first session once, with its sport and days since setup", async () => {
    seedFirestore({ [USER]: account({ launchMilestones: { firstSession } }) });
    start();
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith("first_session_saved", {
        kind: "run",
        daysSinceSetup: 2,
      })
    );
    expect(readDoc(CLAIMS)).toEqual({ first_session_saved: true });

    // A second device, or this one opened again, finds it claimed.
    h.track.mockClear();
    const claimReads = readsAt(CLAIMS).length;
    start();
    await vi.waitFor(() =>
      expect(readsAt(CLAIMS).length).toBeGreaterThan(claimReads)
    );
    await drain();
    expect(h.track).not.toHaveBeenCalled();
  });

  it("does not send a number again when the document changes", async () => {
    seedFirestore({ [USER]: account({ launchMilestones: { firstSession } }) });
    start();
    await vi.waitFor(() => expect(h.track).toHaveBeenCalledTimes(1));
    // An unrelated write to the profile, then the week-4 return arriving.
    seedFirestore({
      [USER]: account({ launchMilestones: { firstSession }, lastLogDate: "x" }),
    });
    await drain();
    const week4Return = {
      atMs: NOW - DAY,
      kind: "lift",
      daysSinceSetup: 21,
    };
    seedFirestore({
      [USER]: account({ launchMilestones: { firstSession, week4Return } }),
    });
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith("week_4_returned", {
        kind: "lift",
        daysSinceSetup: 21,
      })
    );
    expect(h.track).toHaveBeenCalledTimes(2);
    expect(readDoc(CLAIMS)).toEqual({
      first_session_saved: true,
      week_4_returned: true,
    });
  });

  it("sends the first trial and payment from the server's billing record", async () => {
    seedFirestore({
      [USER]: account({
        launchMilestones: {},
        activationBillingFirsts: {
          trial: { atMs: SETUP + 2 * DAY + 60_000, source: "stripe" },
          paid: { atMs: SETUP + 9 * DAY, source: "ios_iap" },
        },
      }),
    });
    start();
    await vi.waitFor(() => expect(h.track).toHaveBeenCalledTimes(2));
    expect(h.track).toHaveBeenCalledWith("trial_started", {
      purchasePlatform: "web",
      daysSinceSetup: 2,
    });
    expect(h.track).toHaveBeenCalledWith("subscription_started", {
      purchasePlatform: "ios",
      daysSinceSetup: 9,
    });
  });

  it("sends nothing for an account set up before the numbers were kept", async () => {
    const activationBillingFirsts = {
      trial: { atMs: NOW - DAY, source: "ios_iap" },
    };
    seedFirestore({ [USER]: account({ activationBillingFirsts }) });
    start();
    await flushSnapshots();
    await drain();
    expect(h.track).not.toHaveBeenCalled();
    expect(readDoc(CLAIMS)).toBeUndefined();
    // The map is the gate: with it, the same record is sent.
    seedFirestore({
      [USER]: account({ activationBillingFirsts, launchMilestones: {} }),
    });
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith(
        "trial_started",
        expect.objectContaining({ purchasePlatform: "ios" })
      )
    );
  });

  it("leaves the claim to a device whose analytics delivers", async () => {
    h.settled.mockResolvedValue(false);
    seedFirestore({ [USER]: account({ launchMilestones: { firstSession } }) });
    start();
    await vi.waitFor(() => expect(h.settled).toHaveBeenCalled());
    await drain();
    expect(readDoc(CLAIMS)).toBeUndefined();
    expect(h.track).not.toHaveBeenCalled();

    h.settled.mockResolvedValue(true);
    start();
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith(
        "first_session_saved",
        expect.anything()
      )
    );
  });

  it("does not send a number over 30 days old", async () => {
    seedFirestore({
      [USER]: account({
        launchMilestones: {
          firstSession: { ...firstSession, atMs: NOW - 31 * DAY },
          week4Return: { atMs: NOW - DAY, kind: "run", daysSinceSetup: 23 },
        },
      }),
    });
    start();
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith("week_4_returned", expect.anything())
    );
    expect(h.track).toHaveBeenCalledTimes(1);
    expect(readDoc(CLAIMS)).toEqual({ week_4_returned: true });
  });

  it("claims again after a claim that failed, and never from the cache", async () => {
    setSnapshotMetadata(USER, { fromCache: true });
    seedFirestore({ [USER]: account({ launchMilestones: { firstSession } }) });
    start();
    await flushSnapshots();
    await drain();
    expect(h.settled).not.toHaveBeenCalled();

    // The server answers, and the claim's read fails (offline again).
    failNextFirestore("getDoc", { path: CLAIMS, code: "unavailable" });
    setSnapshotMetadata(USER, { fromCache: false });
    await vi.waitFor(() => expect(unfiredFailures()).toEqual([]));
    await drain();
    expect(h.track).not.toHaveBeenCalled();
    expect(readDoc(CLAIMS)).toBeUndefined();

    // The next server snapshot claims it.
    seedFirestore({
      [USER]: account({ launchMilestones: { firstSession }, lastLogDate: "y" }),
    });
    await vi.waitFor(() =>
      expect(h.track).toHaveBeenCalledWith(
        "first_session_saved",
        expect.anything()
      )
    );
    expect(h.track).toHaveBeenCalledTimes(1);
  });

  it("sends nothing after it is stopped", async () => {
    seedFirestore({ [USER]: account({ launchMilestones: {} }) });
    const stop = start();
    await flushSnapshots();
    stop();
    seedFirestore({ [USER]: account({ launchMilestones: { firstSession } }) });
    await flushSnapshots();
    await drain();
    expect(h.track).not.toHaveBeenCalled();
    // Anchor: a running watcher sends it.
    start();
    await vi.waitFor(() => expect(h.track).toHaveBeenCalledTimes(1));
  });
});
