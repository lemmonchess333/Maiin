/**
 * Joining and leaving one Space, and what the page shows about it (Spc1).
 *
 * The page reads two things: whether this account is a member, and how
 * many members the space has. A tap flips both at once and puts them back
 * if the write is refused, with a toast that says so. A restricted
 * account (S4e) can leave but not join, and a Join tap from one says why
 * instead of writing. The member document carries a name and a photo only
 * when they are real strings, since a null fails the rules' `is string`
 * checks and denies the whole join.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

const H = vi.hoisted(() => ({
  session: {
    user: { uid: "me" } as { uid: string } | null,
    profile: {
      displayName: "Sam" as string | null,
      photoURL: "https://example.invalid/sam.jpg" as string | null,
    },
  },
  restriction: { isRestricted: false, loading: false },
  haptic: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useAuth: () => H.session }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => H.restriction,
}));
vi.mock("@/lib/haptic", () => ({
  haptic: (...args: unknown[]) => H.haptic(...args),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => H.toastError(...args) },
}));

import { useSpaceMembership } from "../useSpaceMembership";
import {
  deferReads,
  deferWrites,
  failNextFirestore,
  flushSnapshots,
  pendingReads,
  pendingWrites,
  readDoc,
  readLog,
  releaseAllWrites,
  releaseRead,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";
import { RESTRICTED_TOAST } from "@/lib/accountRestriction";

const SPACE = "runners";
const OTHER_SPACE = "trail-running";
const MINE = `spaces/${SPACE}/members/me`;

/** A member document as a join writes it. */
const member = (uid: string, displayName = "Someone") => ({
  uid,
  displayName,
  joinedAt: Timestamp.fromDate(new Date()),
});

function seedMembers(space: string, uids: string[]) {
  seedFirestore(
    Object.fromEntries(
      uids.map((uid) => [`spaces/${space}/members/${uid}`, member(uid)])
    )
  );
}

/** Render, and wait until both reads have answered. */
async function rendered(space = SPACE) {
  const hook = renderHook(
    ({ id }: { id: string | undefined }) => useSpaceMembership(id),
    { initialProps: { id: space as string | undefined } }
  );
  await waitFor(() => expect(hook.result.current.memberCount).not.toBeNull());
  await waitFor(() => expect(hook.result.current.joined).not.toBeNull());
  return hook;
}

beforeEach(() => {
  resetFirestore();
  H.session.user = { uid: "me" };
  H.session.profile = {
    displayName: "Sam",
    photoURL: "https://example.invalid/sam.jpg",
  };
  H.restriction.isRestricted = false;
  H.haptic.mockReset();
  H.toastError.mockReset();
});
afterEach(cleanup);

describe("useSpaceMembership — what the page shows", () => {
  it("shows a member as joined, with the space's member count", async () => {
    seedMembers(SPACE, ["me", "a", "b"]);
    const { result } = await rendered();
    expect(result.current.joined).toBe(true);
    expect(result.current.memberCount).toBe(3);
    expect(result.current.busy).toBe(false);
    expect(result.current.restricted).toBe(false);
  });

  it("shows someone who has not joined as not joined", async () => {
    seedMembers(SPACE, ["a", "b"]);
    const { result } = await rendered();
    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(2);
  });

  it("reads nothing for a space that is not one of the app's", async () => {
    seedMembers(SPACE, ["me"]);
    seedMembers("no-such-space", ["me"]);
    const unknown = renderHook(() => useSpaceMembership("no-such-space"));
    const missing = renderHook(() => useSpaceMembership(undefined));
    // A real space, rendered alongside, has had time to load.
    await rendered();
    expect(unknown.result.current.joined).toBeNull();
    expect(unknown.result.current.memberCount).toBeNull();
    expect(missing.result.current.joined).toBeNull();
    expect(readLog().map((r) => r.path)).toEqual([
      MINE,
      `spaces/${SPACE}/members`,
    ]);
  });

  it("reads nothing while signed out, and the space once someone signs in", async () => {
    seedMembers(SPACE, ["me", "a"]);
    H.session.user = null;
    const { result, rerender } = renderHook(() => useSpaceMembership(SPACE));
    await flushSnapshots();
    await act(async () => {
      await result.current.join();
    });
    expect(readLog()).toHaveLength(0);
    expect(writeLog()).toHaveLength(0);
    expect(result.current.joined).toBeNull();

    H.session.user = { uid: "me" };
    rerender();
    await waitFor(() => expect(result.current.joined).toBe(true));
    expect(result.current.memberCount).toBe(2);
  });

  it("leaves membership unknown when its read fails, and still shows the count", async () => {
    seedMembers(SPACE, ["me", "a"]);
    failNextFirestore("getDoc", { path: MINE, code: "unavailable" });
    const { result } = renderHook(() => useSpaceMembership(SPACE));
    await waitFor(() => expect(result.current.memberCount).toBe(2));
    expect(result.current.joined).toBeNull();
    expect(unfiredFailures()).toHaveLength(0);
  });

  it("does not let a late answer for the last space overwrite the one now open", async () => {
    seedMembers(SPACE, ["me", "a", "b"]);
    seedMembers(OTHER_SPACE, ["c"]);
    deferReads();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSpaceMembership(id),
      { initialProps: { id: SPACE } }
    );
    rerender({ id: OTHER_SPACE });
    expect(pendingReads()).toEqual([
      MINE,
      `spaces/${OTHER_SPACE}/members/me`,
    ]);

    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    await waitFor(() => expect(result.current.joined).toBe(false));
    expect(result.current.memberCount).toBe(1);

    // The first space answers last: a member, of three.
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    await flushSnapshots();
    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(1);
  });
});

describe("useSpaceMembership — joining", () => {
  it("shows the join at once and writes who joined", async () => {
    seedMembers(SPACE, ["a", "b"]);
    const { result } = await rendered();

    deferWrites();
    let joining!: Promise<void>;
    act(() => {
      joining = result.current.join();
    });
    // Before the server has answered.
    expect(result.current.joined).toBe(true);
    expect(result.current.memberCount).toBe(3);
    expect(result.current.busy).toBe(true);
    expect(pendingWrites()).toEqual([MINE]);
    expect(H.haptic).toHaveBeenCalledWith("light");

    await act(async () => {
      releaseAllWrites();
      await joining;
    });
    expect(result.current.busy).toBe(false);
    expect(result.current.joined).toBe(true);
    expect(result.current.memberCount).toBe(3);
    const stored = readDoc(MINE);
    expect(stored).toMatchObject({
      uid: "me",
      displayName: "Sam",
      photoURL: "https://example.invalid/sam.jpg",
    });
    expect(stored?.joinedAt).toBeInstanceOf(Timestamp);
    expect(H.toastError).not.toHaveBeenCalled();
  });

  it("leaves out a name or photo the profile does not have", async () => {
    H.session.profile = { displayName: null, photoURL: "" };
    seedMembers(SPACE, ["a"]);
    const { result } = await rendered();

    await act(async () => {
      await result.current.join();
    });

    const stored = readDoc(MINE);
    expect(stored).toMatchObject({ uid: "me" });
    expect(stored?.joinedAt).toBeInstanceOf(Timestamp);
    expect(stored).not.toHaveProperty("displayName");
    expect(stored).not.toHaveProperty("photoURL");
    expect(result.current.joined).toBe(true);
  });

  it("puts everything back, and says so, when the join is refused", async () => {
    seedMembers(SPACE, ["a", "b"]);
    const { result } = await rendered();
    failNextFirestore("setDoc", { path: MINE, code: "permission-denied" });

    await act(async () => {
      await result.current.join();
    });

    expect(unfiredFailures()).toHaveLength(0);
    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(2);
    expect(result.current.busy).toBe(false);
    expect(readDoc(MINE)).toBeUndefined();
    expect(H.haptic).toHaveBeenLastCalledWith("error");
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn't join the space. Try again."
    );
  });

  it("writes once when Join is tapped again while the first is on its way", async () => {
    seedMembers(SPACE, ["a"]);
    const { result } = await rendered();

    deferWrites();
    let first!: Promise<void>;
    act(() => {
      first = result.current.join();
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.join();
    });
    expect(pendingWrites()).toEqual([MINE]);

    await act(async () => {
      releaseAllWrites();
      await first;
    });
    expect(result.current.memberCount).toBe(2);
    expect(writeLog().filter((w) => w.path === MINE)).toHaveLength(1);
  });

  it("does not join a restricted account, and says why", async () => {
    H.restriction.isRestricted = true;
    seedMembers(SPACE, ["a", "b"]);
    const { result } = await rendered();
    expect(result.current.restricted).toBe(true);

    await act(async () => {
      await result.current.join();
    });

    expect(H.toastError).toHaveBeenCalledWith(
      RESTRICTED_TOAST,
      expect.objectContaining({
        action: expect.objectContaining({ label: "Contact support" }),
      })
    );
    expect(H.haptic).toHaveBeenCalledWith("error");
    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(2);
    expect(readDoc(MINE)).toBeUndefined();
    expect(writeLog()).toHaveLength(0);
  });
});

describe("useSpaceMembership — leaving", () => {
  it("shows the leave at once and deletes the member document", async () => {
    seedMembers(SPACE, ["me", "a"]);
    const { result } = await rendered();

    deferWrites();
    let leaving!: Promise<void>;
    act(() => {
      leaving = result.current.leave();
    });
    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(1);
    expect(result.current.busy).toBe(true);

    await act(async () => {
      releaseAllWrites();
      await leaving;
    });
    expect(result.current.busy).toBe(false);
    expect(readDoc(MINE)).toBeUndefined();
    expect(writeLog()).toEqual([{ op: "delete", path: MINE }]);
    expect(H.toastError).not.toHaveBeenCalled();
  });

  it("puts everything back, and says so, when leaving fails", async () => {
    seedMembers(SPACE, ["me", "a"]);
    const { result } = await rendered();
    failNextFirestore("deleteDoc", { path: MINE, code: "unavailable" });

    await act(async () => {
      await result.current.leave();
    });

    expect(unfiredFailures()).toHaveLength(0);
    expect(result.current.joined).toBe(true);
    expect(result.current.memberCount).toBe(2);
    expect(result.current.busy).toBe(false);
    expect(readDoc(MINE)).toMatchObject({ uid: "me" });
    expect(H.haptic).toHaveBeenLastCalledWith("error");
    expect(H.toastError).toHaveBeenCalledWith(
      "Couldn't leave the space. Try again."
    );
  });

  it("lets a restricted account leave", async () => {
    H.restriction.isRestricted = true;
    seedMembers(SPACE, ["me", "a"]);
    const { result } = await rendered();

    await act(async () => {
      await result.current.leave();
    });

    expect(result.current.joined).toBe(false);
    expect(result.current.memberCount).toBe(1);
    expect(readDoc(MINE)).toBeUndefined();
    expect(H.toastError).not.toHaveBeenCalled();
  });
});
