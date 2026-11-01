/**
 * A challenge join copies the name and photo the person's PUBLIC profile
 * shows onto their leaderboard row. That name is the one the word filter
 * screens (onPublicProfileWritten), and firestore.rules refuses a row
 * whose name is any other; the private user document's name is never
 * screened, so a join that copied it was refused, or showed a name nobody
 * checked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  flushSnapshots,
  readDoc,
  readsAt,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
} from "@/test/firestoreHarness";
import { useChallenges } from "../useChallenges";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ useUid: () => "athlete-a" }));
vi.mock("@/hooks/useRestrictedStatus", () => ({
  useRestrictedStatus: () => ({ isRestricted: false, loading: false }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

const ID = "featured-monthly-2026-10-01";
const ROW = `challenges/${ID}/participants/athlete-a`;
const PUBLIC = "users/athlete-a/public/profile";
const PHOTO =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/profile-photos%2Fathlete-a%2F1.jpg?alt=media";
const timestamp = (day: string) =>
  Timestamp.fromDate(new Date(`${day}T00:00:00Z`));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
  resetFirestore();
  seedFirestore({
    [`challenges/${ID}`]: {
      name: "October Training Minutes",
      metric: "training_minutes",
      type: "monthly",
      icon: "clock",
      tiers: { bronze: 120, silver: 300, gold: 600 },
      startDate: timestamp("2026-10-01"),
      endDate: timestamp("2026-11-01"),
      participantCount: 0,
    },
    // The private document's name and photo, which no filter screens.
    "users/athlete-a": {
      displayName: "Unscreened private name",
      photoURL: "https://lh3.googleusercontent.com/a/private-only",
    },
  });
});
afterEach(async () => {
  cleanup();
  resumeReads();
  releaseAllReads();
  await flushSnapshots();
  vi.useRealTimers();
});

async function join() {
  const { result } = renderHook(() => useChallenges());
  await flushSnapshots();
  let joined = false;
  await act(async () => {
    joined = await result.current.joinChallenge(ID);
    await flushSnapshots();
  });
  return joined;
}

describe("joinChallenge copies the public profile's identity", () => {
  it("writes the public profile's name and photo", async () => {
    seedFirestore({ [PUBLIC]: { displayName: "Ann Public", photoURL: PHOTO } });
    expect(await join()).toBe(true);
    // Anchor on the read, then the row: the join read the public profile.
    expect(readsAt(PUBLIC).length).toBeGreaterThan(0);
    expect(readDoc(ROW)).toMatchObject({
      currentValue: 0,
      tierAchieved: null,
      displayName: "Ann Public",
      photoURL: PHOTO,
    });
  });

  it("writes no name or photo when the public profile has none", async () => {
    seedFirestore({ [PUBLIC]: { displayName: null, photoURL: "" } });
    expect(await join()).toBe(true);
    const row = readDoc(ROW);
    expect(row).toMatchObject({ currentValue: 0, tierAchieved: null });
    expect(row).not.toHaveProperty("displayName");
    expect(row).not.toHaveProperty("photoURL");
  });

  it("writes no name past the display-name limit, which the rules refuse", async () => {
    seedFirestore({ [PUBLIC]: { displayName: "a".repeat(51) } });
    expect(await join()).toBe(true);
    const row = readDoc(ROW);
    expect(row).toMatchObject({ currentValue: 0 });
    expect(row).not.toHaveProperty("displayName");
  });
});
