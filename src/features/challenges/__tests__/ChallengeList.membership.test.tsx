import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const h = vi.hoisted(() => ({
  user: { uid: "weekly-member" },
  profile: { displayName: "Test member" },
  toastError: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: h.user, profile: h.profile }),
  useUid: () => h.user.uid,
}));
vi.mock("@/lib/leaderboard", () => ({ buildLeaderboard: async () => [] }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: h.toastError } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { ChallengeList } from "../ChallengeList";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  flushSnapshots,
  readDoc,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const ID = "weekly-2026-09-07";
const PATH = "challenges/" + ID + "/participants/weekly-member";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
  resetFirestore();
  h.toastError.mockClear();
  seedFirestore({
    "users/weekly-member": h.profile,
    ["challenges/" + ID]: {
      name: "Weekly Warrior",
      description: "Train twice this week",
      type: "weekly",
      metric: "workout_count",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: Timestamp.fromDate(new Date("2026-09-07T00:00:00Z")),
      endDate: Timestamp.fromDate(new Date("2026-09-14T00:00:00Z")),
      participantCount: 0,
    },
  });
});

afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
  vi.useRealTimers();
});

async function openList() {
  render(
    <MemoryRouter>
      <ChallengeList />
    </MemoryRouter>
  );
  await flushSnapshots();
  return screen.findByRole("button", { name: "Join weekly challenge" });
}

describe("weekly challenge membership", () => {
  it("offers Join without enrolling on mount; joining and leaving update stored membership", async () => {
    const join = await openList();
    expect(readDoc(PATH)).toBeUndefined();
    fireEvent.click(join);
    const leave = await screen.findByRole("button", {
      name: "Leave weekly challenge",
    });
    expect(readDoc(PATH)).toMatchObject({
      displayName: "Test member",
      currentValue: 0,
    });
    expect(
      screen.getByRole("button", { name: /Start today's session/ })
    ).toBeInTheDocument();
    fireEvent.click(leave);
    await screen.findByRole("button", { name: "Join weekly challenge" });
    expect(readDoc(PATH)).toBeUndefined();
    expect(
      screen.queryByRole("button", { name: "Leave weekly challenge" })
    ).not.toBeInTheDocument();
  });

  it("preserves the unjoined state and permits retry when Join fails", async () => {
    const join = await openList();
    failNextFirestore("setDoc", { path: PATH, code: "permission-denied" });
    fireEvent.click(join);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(
        "Couldn't join the challenge. Try again."
      )
    );
    await waitFor(() => expect(join).toBeEnabled());
    expect(readDoc(PATH)).toBeUndefined();
    fireEvent.click(join);
    await screen.findByRole("button", { name: "Leave weekly challenge" });
    expect(readDoc(PATH)).toBeDefined();
  });

  it("preserves membership and permits retry when Leave fails", async () => {
    const join = await openList();
    fireEvent.click(join);
    const leave = await screen.findByRole("button", {
      name: "Leave weekly challenge",
    });
    failNextFirestore("deleteDoc", { path: PATH, code: "permission-denied" });
    fireEvent.click(leave);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(
        "Couldn't leave the challenge. Try again."
      )
    );
    await waitFor(() => expect(leave).toBeEnabled());
    expect(readDoc(PATH)).toBeDefined();
    fireEvent.click(leave);
    await screen.findByRole("button", { name: "Join weekly challenge" });
    expect(readDoc(PATH)).toBeUndefined();
  });
});
