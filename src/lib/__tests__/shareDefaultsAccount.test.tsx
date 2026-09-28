// @vitest-environment jsdom
/**
 * The share answer is the ACCOUNT's, end to end.
 *
 * "Share sessions automatically?" decides whether a finished session posts
 * itself. It was kept per device, so Settings on one device could say
 * "Runs are no longer shared" while a phone that had answered "Share
 * publicly" went on posting publicly. The answer is now `shareDefaults` on
 * `users/{uid}`, and every surface reads and writes it there.
 *
 * Run against the real AuthProvider, the real guarded writers and the one
 * Firestore fake (ADR-0009), because every property here is about where
 * the answer lives: a component test with `useAuth` stood in could pass
 * with the answer still on the device. A "device" below is one mount of
 * AuthProvider over its own local storage; the fake's store is the server
 * they share.
 *
 * Also pinned: moving each device's own saved answers to the account, where
 * two devices that answered differently must never leave the less private
 * answer standing. Privacy order, most private first: "never", no answer,
 * followers, public.
 */
import { useState, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  act,
  cleanup,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

type FakeUser = {
  uid: string;
  emailVerified: boolean;
  providerData: { providerId: string }[];
};

const H = vi.hoisted(() => ({
  mockAuth: { currentUser: null as FakeUser | null },
  authCb: null as ((u: FakeUser | null) => void) | null,
}));

vi.mock("../firebase", () => ({
  auth: H.mockAuth,
  db: {},
  app: {},
  storage: {},
  functions: {},
  firebaseConfig: {},
}));
vi.mock("../firebaseApp", () => ({
  auth: H.mockAuth,
  app: {},
  firebaseConfig: {},
}));
vi.mock("@/lib/pushNotifications", () => ({
  invalidatePushTokenLifecycle: vi.fn(),
  stopListeningForForegroundPush: vi.fn(),
  unregisterDeviceToken: vi.fn().mockResolvedValue(undefined),
  waitForPendingPushRegistration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: FakeUser | null) => void) => {
    H.authCb = cb;
    return () => {
      H.authCb = null;
    };
  },
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signInWithCredential: vi.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
  signOut: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("../errorReporting", () => ({ setErrorReportingUid: vi.fn() }));
vi.mock("@/lib/lifecycleAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/accountSecurity", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("@/lib/captureTimezone", () => ({
  getDeviceTimezone: () => "UTC",
  shouldUpdateTimezone: () => false,
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/socialApi", () => ({
  postActivity: vi.fn(),
  getBlockedUsers: vi.fn().mockResolvedValue([]),
  unblockUser: vi.fn(),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: new Set<string>(),
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: vi.fn(),
  }),
}));

import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth";
import SettingsPrivacy from "@/pages/settings/SettingsPrivacy";
import SessionShareRow from "@/components/workout/SessionShareRow";
import type { SessionShareAction, ShareOutcome } from "@/lib/sessionPost";
import { savedShareDefault } from "@/lib/shareDefaults";
import { toast } from "@/lib/toast";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
  deferWrites,
  pendingWrites,
  releaseAllWrites,
  failNextFirestore,
} from "@/test/firestoreHarness";

const UID = "u1";

function user(uid: string): FakeUser {
  return {
    uid,
    emailVerified: true,
    providerData: [{ providerId: "password" }],
  };
}

function seedAccount(uid: string, extra: Record<string, unknown> = {}) {
  seedFirestore({
    [`users/${uid}`]: {
      uid,
      displayName: "Alex",
      onboardingComplete: true,
      ...extra,
    },
  });
}

/** What the account holds now. */
function accountAnswers(uid = UID) {
  return readDoc(`users/${uid}`)?.shareDefaults;
}

/** An answer saved on a device by a build that kept answers per device. */
function deviceAnswer(uid: string, type: "run" | "workout", value: string) {
  localStorage.setItem(`tropos.share.always.${uid}.${type}`, value);
}

function deviceKeys(): string[] {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith("tropos.share.always"))
    .sort();
}

/** Settings → Privacy, the real page. */
function SettingsScreen() {
  return (
    <MemoryRouter>
      <SettingsPrivacy />
    </MemoryRouter>
  );
}

/** A finish screen: it appears after the save, long after sign-in. */
function FinishScreen({ action }: { action: SessionShareAction }) {
  const { profile } = useAuth();
  return profile ? <SessionShareRow action={action} /> : null;
}

/** An app left open: what this device holds for runs, a run that
 *  finishes whenever the test says, and Settings opened later. */
function OpenApp({ action }: { action: SessionShareAction }) {
  const { profile } = useAuth();
  const [done, setDone] = useState(false);
  const [settings, setSettings] = useState(false);
  if (!profile) return null;
  return (
    <>
      <p>Runs: {savedShareDefault(profile.shareDefaults, "run") ?? "ask"}</p>
      <button type="button" onClick={() => setDone(true)}>
        Finish a run
      </button>
      <button type="button" onClick={() => setSettings(true)}>
        Open privacy settings
      </button>
      {done && <SessionShareRow action={action} />}
      {settings && <SettingsScreen />}
    </>
  );
}

let sessions = 0;
function finished(type: "run" | "workout"): SessionShareAction {
  const post = vi.fn(
    async (d?: {
      visibility: "followers" | "public";
    }): Promise<ShareOutcome> =>
      d
        ? { status: "posted", visibility: d.visibility, activityId: "act-1" }
        : { status: "declined" }
  );
  return {
    uid: UID,
    type,
    source: { kind: type, id: `session-${++sessions}` },
    post,
  };
}

/** Starts a device: AuthProvider over whatever local storage holds now,
 *  signed in as `uid`. */
async function startDevice(ui: ReactNode, uid = UID) {
  render(<AuthProvider>{ui}</AuthProvider>);
  H.mockAuth.currentUser = user(uid);
  await act(async () => {
    H.authCb?.(H.mockAuth.currentUser);
  });
}

/** Closes the app on this device. The server (the fake's store) stays. */
function closeDevice() {
  cleanup();
  H.mockAuth.currentUser = null;
  H.authCb = null;
}

/**
 * Lets anything the sign-in set off run to its end. The move of a device's
 * answers is fire-and-forget, and every step of it is a microtask against
 * the fake, so one macrotask later it has either finished or never started.
 * An assertion that it did NOT happen means nothing before this.
 */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function group(noun: string) {
  return screen.getByRole("radiogroup", {
    name: new RegExp(`default sharing for ${noun}`, "i"),
  });
}

function pick(noun: string, option: string) {
  fireEvent.click(
    within(group(noun)).getByRole("radio", {
      name: new RegExp(`^${option}$`, "i"),
    })
  );
}

function selected(noun: string): string | null {
  const checked = within(group(noun))
    .getAllByRole("radio")
    .find((el) => el.getAttribute("aria-checked") === "true");
  return checked?.textContent ?? null;
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  setOnline(true);
  vi.mocked(toast.error).mockClear();
  H.mockAuth.currentUser = null;
  H.authCb = null;
});
afterEach(() => {
  releaseAllWrites();
  closeDevice();
  resetFirestore();
  setOnline(true);
});

describe("one answer, on the account", () => {
  it("Settings saves it on users/{uid}, one field per type, and a device that had 'public' saved no longer auto-posts", async () => {
    seedAccount(UID, { shareDefaults: { workout: "followers" } });
    await startDevice(<SettingsScreen />);
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });

    pick("runs", "Never");

    await waitFor(() =>
      expect(accountAnswers()).toEqual({ run: "never", workout: "followers" })
    );
    // One field path per type, through the guarded updateDoc: saving runs
    // does not rewrite workouts.
    expect(writeLog().filter((w) => w.path === `users/${UID}`)).toEqual([
      {
        op: "update",
        path: `users/${UID}`,
        data: { "shareDefaults.run": "never" },
      },
    ]);
    closeDevice();

    // The phone: it answered "Share publicly" when answers were kept per
    // device, and has not opened the app since.
    localStorage.clear();
    deviceAnswer(UID, "run", "public");
    const run = finished("run");
    await startDevice(<FinishScreen action={run} />);

    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(run.post).not.toHaveBeenCalled();
    // Its answer is gone, and did not win: the account still says never.
    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ run: "never", workout: "followers" });
  });

  it("a finish screen acts on a change another device made while this one kept the app open", async () => {
    seedAccount(UID, { shareDefaults: { run: "public" } });
    const run = finished("run");
    // This device loads "public" and stays open...
    await startDevice(<OpenApp action={run} />);
    expect(await screen.findByText("Runs: public")).toBeInTheDocument();
    // ...while another device turns runs off.
    seedAccount(UID, { shareDefaults: { run: "never" } });

    // A run finishes here later. The finish screen reads the account
    // before acting on the answer this device loaded.
    fireEvent.click(screen.getByRole("button", { name: "Finish a run" }));

    expect(
      await screen.findByRole("button", { name: "Share this session" })
    ).toBeInTheDocument();
    expect(run.post).not.toHaveBeenCalled();
    expect(screen.getByText("Runs: never")).toBeInTheDocument();
  });

  it("Settings shows an answer another device saved while this one kept the app open", async () => {
    seedAccount(UID, { shareDefaults: { run: "public" } });
    await startDevice(<OpenApp action={finished("run")} />);
    expect(await screen.findByText("Runs: public")).toBeInTheDocument();
    seedAccount(UID, { shareDefaults: { run: "never" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Open privacy settings" })
    );

    await waitFor(() => expect(selected("runs")).toBe("Never"));
    expect(screen.getByText("Runs: never")).toBeInTheDocument();
  });

  it("answering the question saves every type without an answer, and keeps one that has", async () => {
    seedAccount(UID, { shareDefaults: { run: "never" } });
    const workout = finished("workout");
    await startDevice(<FinishScreen action={workout} />);

    expect(
      await screen.findByText(/Applies to every workout from now on/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Share publicly" }));

    await waitFor(() =>
      expect(accountAnswers()).toEqual({ run: "never", workout: "public" })
    );
    expect(workout.post).toHaveBeenCalledWith({
      visibility: "public",
      caption: "",
    });
  });

  it("answering with nothing saved sets runs and workouts together", async () => {
    seedAccount(UID);
    const run = finished("run");
    await startDevice(<FinishScreen action={run} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Share with followers" })
    );

    await waitFor(() =>
      expect(accountAnswers()).toEqual({
        run: "followers",
        workout: "followers",
      })
    );
  });

  it("a save shows at once, before the write lands", async () => {
    seedAccount(UID, { shareDefaults: { run: "public" } });
    await startDevice(<SettingsScreen />);
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });

    deferWrites();
    pick("runs", "Never");

    expect(selected("runs")).toBe("Never");
    // Issued a tick later, after the provider's Firestore loader.
    await waitFor(() => expect(pendingWrites()).toEqual([`users/${UID}`]));
    expect(selected("runs")).toBe("Never");
    expect(accountAnswers()).toEqual({ run: "public" });
    await act(async () => {
      releaseAllWrites();
    });
    await waitFor(() => expect(accountAnswers()).toEqual({ run: "never" }));
  });

  it("a refused save moves back and says so", async () => {
    seedAccount(UID, { shareDefaults: { run: "public" } });
    await startDevice(<SettingsScreen />);
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });

    failNextFirestore("updateDoc", { path: `users/${UID}` });
    pick("runs", "Never");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't save your settings. Try again.",
        expect.anything()
      )
    );
    await waitFor(() => expect(selected("runs")).toBe("Public"));
    expect(accountAnswers()).toEqual({ run: "public" });
  });
});

describe("moving a device's own answers to the account", () => {
  it("moves an answer the account does not have, then forgets it", async () => {
    seedAccount(UID);
    deviceAnswer(UID, "workout", "followers");
    await startDevice(<SettingsScreen />);

    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ workout: "followers" });
  });

  it("keeps the account's answer when the device's is less private", async () => {
    seedAccount(UID, { shareDefaults: { run: "never", workout: null } });
    deviceAnswer(UID, "run", "public");
    deviceAnswer(UID, "workout", "followers");
    await startDevice(<SettingsScreen />);

    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ run: "never", workout: null });
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });
    expect(selected("runs")).toBe("Never");
    expect(selected("workouts")).toBe("Ask");
  });

  it("moves the device's answer when it is more private", async () => {
    seedAccount(UID, { shareDefaults: { run: "public", workout: null } });
    deviceAnswer(UID, "run", "followers");
    deviceAnswer(UID, "workout", "never");
    await startDevice(<SettingsScreen />);

    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ run: "followers", workout: "never" });
  });

  it("moves a legacy 'crews' answer as followers", async () => {
    seedAccount(UID);
    deviceAnswer(UID, "run", "crews");
    await startDevice(<SettingsScreen />);

    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ run: "followers" });
  });

  it("never touches another account's answers on the same device", async () => {
    seedAccount(UID);
    seedAccount("u2", { shareDefaults: { run: "public" } });
    deviceAnswer(UID, "run", "never");
    deviceAnswer("u2", "run", "never");
    deviceAnswer("u2", "workout", "public");
    await startDevice(<SettingsScreen />);

    // u1's own answer moved and went, which is what shows the move has
    // run; u2's stayed.
    await waitFor(() =>
      expect(deviceKeys()).toEqual([
        "tropos.share.always.u2.run",
        "tropos.share.always.u2.workout",
      ])
    );
    expect(accountAnswers()).toEqual({ run: "never" });
    expect(accountAnswers("u2")).toEqual({ run: "public" });
  });

  it("two devices that answered differently end on the more private answer, whichever moves first", async () => {
    for (const order of [
      ["public", "never"],
      ["never", "public"],
    ]) {
      resetFirestore();
      seedAccount(UID);
      for (const answer of order) {
        localStorage.clear();
        deviceAnswer(UID, "run", answer);
        await startDevice(<SettingsScreen />);
        await waitFor(() => expect(deviceKeys()).toEqual([]));
        closeDevice();
      }
      expect(accountAnswers(), `moved ${order.join(" then ")}`).toEqual({
        run: "never",
      });
    }
  });

  it("offline, applies the device's answer without moving it, and moves it once online", async () => {
    setOnline(false);
    seedAccount(UID, { shareDefaults: { run: "public" } });
    deviceAnswer(UID, "run", "never");
    await startDevice(<SettingsScreen />);

    // The profile this device loaded carries its more private answer...
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });
    expect(selected("runs")).toBe("Never");
    // ...and it stays on the device until a session online moves it.
    await settle();
    expect(deviceKeys()).toEqual([`tropos.share.always.${UID}.run`]);
    expect(accountAnswers()).toEqual({ run: "public" });
    closeDevice();

    setOnline(true);
    await startDevice(<SettingsScreen />);
    await waitFor(() => expect(deviceKeys()).toEqual([]));
    expect(accountAnswers()).toEqual({ run: "never" });
  });

  it("an answer given in Settings replaces the device's, and is not moved over", async () => {
    setOnline(false);
    seedAccount(UID, { shareDefaults: { run: "public" } });
    deviceAnswer(UID, "run", "never");
    await startDevice(<SettingsScreen />);
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });

    pick("runs", "Followers");

    expect(selected("runs")).toBe("Followers");
    expect(deviceKeys()).toEqual([]);
    await waitFor(() => expect(accountAnswers()).toEqual({ run: "followers" }));
    closeDevice();

    // Back online, a later session finds nothing of the device's to move.
    setOnline(true);
    await startDevice(<SettingsScreen />);
    await screen.findByRole("radiogroup", {
      name: /default sharing for runs/i,
    });
    await settle();
    expect(selected("runs")).toBe("Followers");
    expect(accountAnswers()).toEqual({ run: "followers" });
  });
});
