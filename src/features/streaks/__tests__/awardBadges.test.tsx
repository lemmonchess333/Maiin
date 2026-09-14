/**
 * The badge award is a transaction on streaks/data, and awards are
 * serialised — pinned here against the one Firestore fake (ADR-0009).
 *
 * Why it matters: the server awards badges into the SAME array
 * (onWorkoutCreated → Plate-Club, run milestones). The old client award
 * rebuilt the whole `badges` array from local state and wrote it back, so
 *   - a server award this client had not seen yet was reverted, and
 *   - two client awards fired in one tick (a 100 kg lift earns plate_club
 *     AND two_plate) each wrote an array missing the other's earnedAt —
 *     the second reverted the first until a later snapshot re-derived it.
 * Both shapes are asserted below; both fail against the batch version.
 *
 * Also pinned: an id the transaction finds ALREADY earned is neither
 * queued for reveal nor registered as seen, so the snapshot path can
 * still celebrate a server award as new.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  writeLog,
} from "@/test/firestoreHarness";
import { doc, setDoc } from "firebase/firestore";
import { pendingBadgeIds } from "../pendingBadgeReveals";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

const h = vi.hoisted(() => ({ uid: "u1" }));
vi.mock("@/lib/auth", () => ({ useUid: () => h.uid }));
vi.mock("@/hooks/useNutritionBadgeData", () => ({
  useNutritionBadgeData: () => ({
    macroTargetsByDay: new Map(),
    waterByDay: new Map(),
    loaded: true,
  }),
}));

import { StreaksProvider, useStreaks } from "../useStreaks";

const SERVER_EARNED_AT = "2026-01-01T00:00:00.000Z";
const streaksPath = (uid: string) => `users/${uid}/streaks/data`;

function mount() {
  const view = renderHook(() => useStreaks(), { wrapper: StreaksProvider });
  return view;
}

async function loaded(view: ReturnType<typeof mount>) {
  await waitFor(() => expect(view.result.current.loading).toBe(false));
}

type Stored = { badges: { id: string; earnedAt: string | null }[] };
const stored = (uid: string) => readDoc(streaksPath(uid)) as Stored | undefined;
const earnedAt = (uid: string, id: string) =>
  stored(uid)?.badges.find((b) => b.id === id)?.earnedAt ?? null;

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
});
afterEach(() => cleanup());

describe("awardEventBadges — transactional, against the live document", () => {
  it("keeps a server award it had not seen, and adds its own, in one write", async () => {
    // pendingBadgeReveals caches per uid for the process; a fresh uid per
    // test keeps the reveal-queue assertions honest.
    h.uid = "u1";
    // Server-minimal shape, already earned — exactly what onWorkoutCreated
    // appends. The client must not touch this earnedAt.
    seedFirestore({
      [streaksPath("u1")]: {
        badges: [{ id: "plate_club", earnedAt: SERVER_EARNED_AT }],
      },
    });
    const view = mount();
    await loaded(view);
    const writesBefore = writeLog().length;

    await act(async () => {
      view.result.current.awardEventBadges(["plate_club", "two_plate"]);
    });
    await waitFor(() => expect(earnedAt("u1", "two_plate")).not.toBeNull());

    expect(earnedAt("u1", "plate_club")).toBe(SERVER_EARNED_AT);
    // One transaction: streaks/data + the public mirror, nothing else.
    expect(writeLog().length - writesBefore).toBe(2);
    const pub = readDoc("users/u1/public/profile") as {
      badgeSummary: { count: number; earnedMap: Record<string, string> };
    };
    expect(pub.badgeSummary.count).toBe(2);
    expect(pub.badgeSummary.earnedMap.plate_club).toBe(SERVER_EARNED_AT);

    // Only the id THIS call set is queued for the reveal. plate_club was
    // the server's; the snapshot path owns celebrating that one.
    expect([...pendingBadgeIds("u1")]).toEqual(["two_plate"]);
  });

  it("two awards fired in the same tick both land — the second reads the first's commit", async () => {
    h.uid = "u2";
    seedFirestore({ [streaksPath("u2")]: { badges: [] } });
    const view = mount();
    await loaded(view);

    await act(async () => {
      // Same closure, same stale local state, no await between them: the
      // shape the pre-transaction code got wrong.
      view.result.current.awardEventBadge("plate_club");
      view.result.current.awardEventBadge("two_plate");
    });
    await waitFor(() => expect(earnedAt("u2", "two_plate")).not.toBeNull());

    expect(earnedAt("u2", "plate_club")).not.toBeNull();
    expect([...pendingBadgeIds("u2")].sort()).toEqual([
      "plate_club",
      "two_plate",
    ]);
  });

  it("an id already earned on the document writes nothing and queues nothing", async () => {
    h.uid = "u3";
    seedFirestore({
      [streaksPath("u3")]: {
        badges: [{ id: "plate_club", earnedAt: SERVER_EARNED_AT }],
      },
    });
    const view = mount();
    await loaded(view);
    const writesBefore = writeLog().length;

    await act(async () => {
      view.result.current.awardEventBadges(["plate_club"]);
    });
    // Give any errant write a chance to land before asserting it did not.
    await new Promise((r) => setTimeout(r, 20));

    expect(writeLog().length).toBe(writesBefore);
    expect(earnedAt("u3", "plate_club")).toBe(SERVER_EARNED_AT);
    expect([...pendingBadgeIds("u3")]).toEqual([]);
  });

  it("the race it exists for: the server awards first, unseen by this client → no write, no reveal queued", async () => {
    /* The one the earlier "already earned" test cannot reach. There, the
       client's own state already said earned, so the cheap local
       pre-filter rejected the id and the transaction never ran — which is
       why the mutation that queued every candidate up front sailed past
       it. Here the client still believes plate_club is unearned, so the
       pre-filter lets it through and only the LIVE read can stop it.

       Staleness is staged through the captured callback, not through
       component state: `awardEventBadges` closes over `streakData.badges`,
       so a reference taken before the server's write carries the old
       array — exactly what a component holds between renders. (Writing to
       the doc cannot make the hook stale here at all: the fake delivers
       onSnapshot synchronously, so state catches up before the next
       line.) */
    h.uid = "u4";
    seedFirestore({ [streaksPath("u4")]: { badges: [] } });
    const view = mount();
    await loaded(view);

    // Captured while the client believes nothing is earned.
    const staleAward = view.result.current.awardEventBadges;
    expect(
      view.result.current.allBadges.find((b) => b.id === "plate_club")?.earnedAt
    ).toBeNull();

    // "Server" write: the minimal {id, earnedAt} pair onWorkoutCreated
    // appends, merged into the same array.
    await act(async () => {
      await setDoc(
        doc({} as never, "users", "u4", "streaks", "data"),
        { badges: [{ id: "plate_club", earnedAt: SERVER_EARNED_AT }] },
        { merge: true }
      );
    });
    const writesBefore = writeLog().length;

    await act(async () => {
      staleAward(["plate_club"]);
    });
    // Give an errant write time to land before asserting it did not.
    await new Promise((r) => setTimeout(r, 20));

    // Nothing written: the transaction read the live doc, found the
    // server's earnedAt, and left it exactly as it was.
    expect(writeLog().length).toBe(writesBefore);
    expect(earnedAt("u4", "plate_club")).toBe(SERVER_EARNED_AT);
    // Queued ONCE, and by the snapshot's external-award path rather than
    // by this call — that path is what celebrates a badge the client did
    // not award, and it ran the moment the server's write landed.
    expect([...pendingBadgeIds("u4")]).toEqual(["plate_club"]);
  });
});
