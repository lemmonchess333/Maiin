/**
 * /segment/:segmentId (Run26 call 3): the segment's name and length, your
 * best as the page's one large figure, your efforts fastest first with
 * their dates, and the board of the people you follow with you placed
 * among them. Nobody else is on it: the board comes from the server's
 * getSegmentBoard, which shows only who you follow (the server's tests
 * hold that), and someone blocked since is left out here too. Its maker
 * can delete it.
 *
 * Firestore runs on the one fake (ADR-0009); the callables are stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const H = vi.hoisted(() => ({
  call: vi.fn(),
  blocked: new Set<string>(),
}));

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("firebase/functions", () => ({
  httpsCallable: (_f: unknown, name: string) => (data: unknown) =>
    H.call(name, data),
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "me",
  useAuth: () => ({ profile: { displayName: "Me" } }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: H.blocked,
    youBlocked: new Set(),
    blockedYou: new Set(),
    ready: true,
    addBlocked: () => {},
    removeBlocked: () => {},
  }),
}));
vi.mock("@/hooks/useDistanceUnit", () => ({ useDistanceUnit: () => "km" }));
vi.mock("@/hooks/useIsDarkTheme", () => ({ useIsDarkTheme: () => false }));
vi.mock("@/components/run/RunMapLazy", () => ({ default: () => null }));
vi.mock("@/components/social/BlockAwareAvatar", () => ({
  default: () => null,
}));
vi.mock("@/components/Avatar", () => ({ default: () => null }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import Segment from "../Segment";
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";

const line = [
  { lat: 51.4433, lon: -0.1517 },
  { lat: 51.4433, lon: -0.1373 },
];
const effort = (runId: string, elapsedSeconds: number, day: string) => ({
  uid: "me",
  segmentId: "hill",
  runId,
  lap: 1,
  elapsedSeconds,
  startedAtMs: 1,
  day,
});

function boardOf(entries: Record<string, unknown>[]) {
  H.call.mockImplementation(async (name: string) =>
    name === "getSegmentBoard" ? { data: { entries } } : { data: {} }
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/history", "/segment/hill"]}>
      <Routes>
        <Route path="/segment/:segmentId" element={<Segment />} />
        <Route path="/history" element={<p>History page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  H.call.mockReset();
  H.blocked = new Set();
  seedFirestore({
    "segments/hill": {
      name: "Common hill",
      lengthMeters: 800,
      points: line,
      startCell: "gcpuc",
    },
    "users/me/segmentEfforts/r1_hill_1": effort("r1", 262, "2026-11-02"),
    "users/me/segmentEfforts/r2_hill_1": effort("r2", 251, "2026-11-09"),
  });
  boardOf([
    {
      uid: "bea",
      name: "Bea",
      elapsedSeconds: 240,
      day: "2026-11-08",
      activityId: "p1",
    },
    {
      uid: "cal",
      name: "Cal",
      elapsedSeconds: 300,
      day: "2026-11-01",
      activityId: "p2",
    },
  ]);
});
afterEach(() => cleanup());

describe("Segment page", () => {
  it("leads with your best, then your efforts fastest first", async () => {
    renderPage();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Common hill" })
    ).toBeVisible();
    expect(screen.getByText(/800 m/)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText("4:11", { selector: "p" })).toBeVisible()
    );
    expect(screen.getByText(/fastest of 2 runs/)).toBeVisible();
    const yours = screen.getByRole("region", { name: "Your efforts" });
    const rows = within(yours).getAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      "19 Nov 20264:11",
      "22 Nov 20264:22",
    ]);
    expect(rows[0]).toHaveAttribute("href", "/run/r2");
  });

  it("places you on the board of the people you follow, fastest first", async () => {
    renderPage();
    const board = await screen.findByRole("list", {
      name: "Common hill board",
    });
    const rows = within(board).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "1Bea8 Nov 20264:00",
      "2You9 Nov 20264:11",
      "3Cal1 Nov 20265:00",
    ]);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute(
      "href",
      "/activity/p1"
    );
    expect(H.call).toHaveBeenCalledWith("getSegmentBoard", {
      segmentId: "hill",
    });
  });

  it("leaves out someone blocked since the board was read", async () => {
    H.blocked = new Set(["bea"]);
    renderPage();
    const board = await screen.findByRole("list", {
      name: "Common hill board",
    });
    expect(
      within(board)
        .getAllByRole("listitem")
        .map((r) => r.textContent?.slice(0, 4))
    ).toEqual(["1You", "2Cal"]);
  });

  it("says how the board fills when nobody you follow is on it", async () => {
    boardOf([]);
    renderPage();
    expect(
      await screen.findByText(
        "When people you follow share a run along it, their times show here."
      )
    ).toBeVisible();
    // You are on it, alone.
    expect(
      within(screen.getByRole("list", { name: "Common hill board" })).getByText(
        "You"
      )
    ).toBeVisible();
  });

  it("starts a segment you haven't run with the first step, not an empty list", async () => {
    resetFirestore();
    seedFirestore({
      "segments/hill": { name: "Common hill", lengthMeters: 800, points: line },
    });
    boardOf([]);
    renderPage();
    expect(
      await screen.findByText(
        "Run it with Tropos recording, and your time shows here."
      )
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "Your efforts" })).toBeNull();
  });

  it("lets its maker delete it, after asking", async () => {
    seedFirestore({ "segmentOwners/hill": { uid: "me", sourceRunId: "r1" } });
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete segment" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(H.call).toHaveBeenCalledWith("deleteSegment", {
        segmentId: "hill",
      })
    );
    expect(await screen.findByText("History page")).toBeVisible();
  });

  it("offers no delete to anyone else", async () => {
    renderPage();
    // POSITIVE anchor: the page and its board drew.
    await screen.findByRole("list", { name: "Common hill board" });
    expect(screen.queryByRole("button", { name: "Delete segment" })).toBeNull();
  });

  it("says a deleted segment is gone", async () => {
    resetFirestore();
    renderPage();
    expect(await screen.findByText("Segment not found")).toBeVisible();
  });
});
