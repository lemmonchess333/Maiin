import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useNavigate,
} from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { uid: "history-owner" },
    profile: { preferredDistanceUnit: "km" },
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useLocalDateKey", () => ({
  useLocalDateKey: () => "2026-10-29",
}));

import TrainingHistory from "../TrainingHistory";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";
import { savedRunDoc, savedWorkoutDoc } from "@/test/sessionFixtures";
import { queueDurableWrite } from "@/lib/offlineQueue";
import * as savedSessions from "@/hooks/useSavedSessions";

function Detail() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back to saved list</button>;
}
function open(query = "") {
  const router = createMemoryRouter(
    [
      { path: "/history/sessions", element: <TrainingHistory /> },
      { path: "/workout/:id", element: <Detail /> },
      { path: "/run/:id", element: <Detail /> },
    ],
    { initialEntries: [`/history/sessions${query}`] }
  );
  render(<RouterProvider router={router} />);
  return router;
}
function sessionLinks() {
  return within(
    screen.getByRole("region", { name: "Saved sessions" })
  ).queryAllByRole("link");
}

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  seedFirestore({
    "users/history-owner/workouts/lift": savedWorkoutDoc("2026-10-28", {
      notes: "Full body B — Programme Week 1",
    }),
    "users/history-owner/runs/run": savedRunDoc("2026-10-27", {
      activityType: "tempo",
    }),
    "users/history-owner/runs/older": savedRunDoc("2026-08-01"),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Training history", () => {
  it("shows an unanswered retry as loading even if a previous query had failed", () => {
    vi.spyOn(savedSessions, "useSavedSessions").mockReturnValue({
      items: [],
      loading: true,
      answered: false,
      failed: true,
      readFailed: false,
      evidenceReady: false,
      refresh: vi.fn(),
    });
    open();
    expect(screen.getByText("Loading sessions…")).toBeInTheDocument();
    expect(
      screen.queryByText("This period isn't fully loaded")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0 sessions shown")).not.toBeInTheDocument();
  });
  it("does not treat an empty local-cache answer as proof of no saved sessions", async () => {
    vi.spyOn(savedSessions, "useSavedSessions").mockReturnValue({
      items: [],
      loading: false,
      answered: true,
      failed: false,
      readFailed: false,
      evidenceReady: false,
      refresh: vi.fn(),
    });
    open("?q=tempo");
    await screen.findByText("This period isn't fully loaded");
    expect(screen.queryByText("No matching sessions")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No saved sessions in this period")
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" })
    ).toBeInTheDocument();
  });
  it("combines real reader results and pins the selected local period in the URL", async () => {
    const router = open();
    expect(screen.queryByText("0 sessions")).not.toBeInTheDocument();
    await screen.findByText("2 sessions");
    expect(sessionLinks().map((row) => row.textContent)).toEqual([
      expect.stringContaining("Full body B"),
      expect.stringContaining("Tempo run"),
    ]);
    expect(router.state.location.search).toBe("?from=2026-09-30&to=2026-10-29");
    expect(screen.queryByText("Easy run")).not.toBeInTheDocument();
  });

  it("keeps more than 50 same-day records reachable without skipping any at a page boundary", async () => {
    resetFirestore();
    seedFirestore(
      Object.fromEntries(
        Array.from({ length: 70 }, (_, i) => [
          `users/history-owner/workouts/same-day-${i}`,
          savedWorkoutDoc("2026-10-28", { notes: `Saved lift ${i}` }),
        ])
      )
    );
    open("?sport=lifts");
    await screen.findByText("70 lifts");
    expect(sessionLinks()).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "Show more sessions" }));
    expect(sessionLinks()).toHaveLength(60);
    fireEvent.click(screen.getByRole("button", { name: "Show more sessions" }));
    expect(sessionLinks()).toHaveLength(70);
    expect(
      screen.queryByRole("button", { name: "Show more sessions" })
    ).not.toBeInTheDocument();
  });

  it("preserves sport, search and dates after opening a run and going Back", async () => {
    const router = open();
    await screen.findByText("2 sessions");
    fireEvent.click(screen.getByRole("radio", { name: "Runs" }));
    await screen.findByText("1 run");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "tempo" },
    });
    const before = router.state.location.search;
    fireEvent.click(sessionLinks()[0]);
    expect(router.state.location).toMatchObject({
      pathname: "/run/run",
      state: { trainingHistoryReturnTo: `/history/sessions${before}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to saved list" }));
    await screen.findByText("1 run");
    expect(router.state.location.search).toBe(before);
    expect(screen.getByRole("radio", { name: "Runs" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("searchbox")).toHaveValue("tempo");
  });

  it("retains available lifts when runs fail and retries the missing source", async () => {
    failNextFirestore("onSnapshot", { path: "users/history-owner/runs" });
    open();
    await screen.findByText("Run history couldn't load");
    expect(unfiredFailures()).toEqual([]);
    expect(screen.getByText("Full body B")).toBeInTheDocument();
    expect(screen.getByText("1 session shown")).toBeInTheDocument();
    expect(screen.queryByText(/No saved sessions/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("2 sessions");
    expect(
      screen.queryByText("Run history couldn't load")
    ).not.toBeInTheDocument();
  });

  it("never calls a failed run history an empty search result", async () => {
    failNextFirestore("onSnapshot", { path: "users/history-owner/runs" });
    open("?sport=runs&q=tempo");
    await screen.findByText("Run history couldn't load");
    expect(unfiredFailures()).toEqual([]);
    expect(screen.getByText("History unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No matching sessions")).not.toBeInTheDocument();
  });

  it("shows an unsynced invalid run without calling its local queue a complete history", async () => {
    queueDurableWrite(
      "history-owner",
      "users/history-owner/runs",
      "queued",
      savedRunDoc("2026-10-29", { activityType: "long", savedAnyway: true })
    );
    open("?sport=runs");
    await screen.findByText("Saved on this phone · Waiting to sync");
    expect(screen.getByText("Saved · Not counted")).toBeInTheDocument();
    await screen.findByText("2 runs shown");
    expect(
      screen.getByText(/This period may be incomplete/)
    ).toBeInTheDocument();
  });

  it("clears a no-match search without losing the sport or dates", async () => {
    const router = open("?from=2026-10-20&to=2026-10-29&sport=lifts&q=missing");
    await screen.findByText("No matching sessions");
    fireEvent.click(screen.getAllByRole("button", { name: "Clear search" })[0]);
    await screen.findByText("1 lift");
    expect(router.state.location.search).toBe(
      "?from=2026-10-20&to=2026-10-29&sport=lifts"
    );
  });

  it("cancels date changes and prevents a reversed range from being applied", async () => {
    const router = open("?from=2026-10-20&to=2026-10-29");
    await screen.findByText("2 sessions");
    const before = router.state.location.search;
    fireEvent.click(screen.getByRole("button", { name: /20 Oct 2026/ }));
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-10-30" },
    });
    expect(screen.getByRole("button", { name: "Apply dates" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.state.location.search).toBe(before);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("loads an older period selected in the date sheet", async () => {
    open();
    await screen.findByText("2 sessions");
    fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-08-01" },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Apply dates" }))
    );
    await screen.findByText("1 session");
    expect(screen.getByText("Easy run")).toBeInTheDocument();
    expect(screen.queryByText("Full body B")).not.toBeInTheDocument();
  });
});
