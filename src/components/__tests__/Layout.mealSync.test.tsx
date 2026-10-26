import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  uid: "queue-grill-user",
  auth: { currentUser: { uid: "queue-grill-user" } },
  db: {},
  errors: vi.fn(),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: state.db, auth: state.auth }));
vi.mock("@/lib/auth", () => ({ useUid: () => state.uid }));
vi.mock("@/lib/errorReporting", () => ({ captureError: state.errors }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ count: 0, markSeen: vi.fn() }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@/features/program/commandOutbox", () => ({ outboxLength: () => 0 }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  AnimatePresence: ({ children }: PropsWithChildren) => children,
}));

import Layout from "@/components/Layout";
import {
  flushQueue,
  queueDurableWrite,
  getQueueLength,
  getFailedRunSaveCount,
  getFailedWorkoutCompletionCount,
  safeMerge,
  queueWorkoutCompletion,
  getFailedMealSaveCount,
} from "@/lib/offlineQueue";
import { createMealEntry } from "@/lib/mealEntry";
import { completeRun, type FinishedRun } from "@/lib/runCompletion";
import { Timestamp } from "firebase/firestore";
import {
  deferReads,
  failNextFirestore,
  pendingReads,
  readDoc,
  releaseAllReads,
  resetFirestore,
  resumeReads,
  seedFirestore,
  unfiredFailures,
  writeLog,
} from "@/test/firestoreHarness";

const uid = state.uid;
const meals = `users/${uid}/meals`;
const runs = `users/${uid}/runs`;
const workouts = `users/${uid}/workouts`;
const meal = {
  foodName: "Oats",
  totalCalories: 420,
  totalProtein: 20,
  date: "2026-10-16",
};
const banner = () => document.querySelector('[aria-live="polite"]')!;
const entries = () =>
  JSON.parse(localStorage.getItem("tropos_offline_queue") ?? "[]");
function App() {
  return (
    <MemoryRouter>
      <Layout />
    </MemoryRouter>
  );
}
function renderLayout() {
  return render(<App />);
}
function setNetwork(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
  act(() => window.dispatchEvent(new Event(online ? "online" : "offline")));
}
async function failMealOnce() {
  failNextFirestore("getDoc", { path: `${meals}/first`, code: "unavailable" });
  expect(
    await flushQueue(state.db as Parameters<typeof flushQueue>[0], uid)
  ).toBe(0);
  expect(unfiredFailures()).toEqual([]);
  expect(state.errors).toHaveBeenCalledWith(
    expect.objectContaining({ code: "unavailable" }),
    "network",
    expect.objectContaining({ collectionPath: meals, docId: "first" })
  );
}
beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  state.uid = uid;
  state.auth.currentUser = { uid };
  state.errors.mockClear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  expect(unfiredFailures()).toEqual([]);
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("meal sync status — real queue and Layout, shared Firestore fake", () => {
  it("shows the failed meal and pending changes without bypassing the failed write or auto-retrying on the status poll", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    queueDurableWrite(uid, meals, "later-meal", { ...meal, foodName: "Rice" });
    queueDurableWrite(uid, runs, "later-run", {
      distance: 5000,
      duration: 1800,
    });
    queueDurableWrite(uid, workouts, "later-workout", { totalVolume: 1000 });
    await failMealOnce();
    expect(writeLog()).toEqual([]);
    expect(
      entries().map((entry: { failed?: boolean }) => !!entry.failed)
    ).toEqual([true, false, false, false]);
    expect(getFailedRunSaveCount(uid)).toBe(0);
    expect(getFailedWorkoutCompletionCount(uid)).toBe(0);
    expect(getFailedMealSaveCount(uid)).toBe(1);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    renderLayout();
    expect(banner()).toHaveTextContent(
      "1 meal needs attention · saved on this phone. 3 other changes waiting to sync"
    );
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeEnabled();
    act(() => vi.advanceTimersByTime(9000));
    expect(getQueueLength(uid)).toBe(4);
    expect(writeLog()).toEqual([]);
    expect(state.errors).toHaveBeenCalledTimes(1);
  });

  it("keeps the same failed meal visible through a rejected UI retry and clears it only after acknowledgement", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    const queuedId = entries()[0].id;
    renderLayout();
    expect(banner()).toHaveTextContent(
      "1 meal needs attention · saved on this phone"
    );
    failNextFirestore("getDoc", {
      path: `${meals}/first`,
      code: "permission-denied",
    });
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing meals" })
      )
    );
    await waitFor(() => expect(state.errors).toHaveBeenCalledTimes(2));
    expect(entries()).toEqual([
      expect.objectContaining({ id: queuedId, docId: "first", failed: true }),
    ]);
    expect(readDoc(`${meals}/first`)).toBeUndefined();
    expect(banner()).toHaveTextContent(
      "1 meal needs attention · saved on this phone"
    );
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeEnabled();

    deferReads();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry syncing meals" })
    );
    await waitFor(() => expect(pendingReads()).toEqual([`${meals}/first`]));
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeDisabled();
    expect(banner()).toHaveTextContent("1 meal needs attention");
    expect(getQueueLength(uid)).toBe(1);
    await act(async () => {
      resumeReads();
      releaseAllReads();
    });
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(getFailedMealSaveCount(uid)).toBe(0);
    expect(writeLog().map((write) => write.path)).toEqual([`${meals}/first`]);
    expect(banner()).toBeEmptyDOMElement();
  });

  it("distinguishes an offline pending meal from a failed meal and offers Retry only online", async () => {
    setNetwork(false);
    queueDurableWrite(uid, meals, "first", meal);
    renderLayout();
    expect(banner()).toHaveTextContent(
      "You're offline · 1 change saved on this phone · waiting to sync"
    );
    expect(banner()).not.toHaveTextContent("needs attention");
    expect(
      screen.queryByRole("button", { name: /Retry syncing/ })
    ).not.toBeInTheDocument();
    setNetwork(true);
    await act(async () => failMealOnce());
    expect(banner()).toHaveTextContent("1 meal needs attention");
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeEnabled();
    setNetwork(false);
    expect(banner()).toHaveTextContent(
      "You're offline · 1 meal needs attention · saved on this phone"
    );
    expect(
      screen.queryByRole("button", { name: /Retry syncing/ })
    ).not.toBeInTheDocument();
    expect(getQueueLength(uid)).toBe(1);
    expect(entries()[0].failed).toBe(true);
  });

  it("does not let an old account's delayed retry write or change the next account's status", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    queueDurableWrite("other-user", "users/other-user/meals", "other", meal);
    const view = renderLayout();
    deferReads();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry syncing meals" })
    );
    await waitFor(() => expect(pendingReads()).toEqual([`${meals}/first`]));
    state.uid = "other-user";
    state.auth.currentUser = { uid: state.uid };
    view.rerender(<App />);
    expect(banner()).toHaveTextContent(
      "1 change saved on this phone · waiting to sync"
    );
    expect(banner()).not.toHaveTextContent("needs attention");
    expect(
      screen.queryByRole("button", { name: /Retry syncing/ })
    ).not.toBeInTheDocument();
    await act(async () => {
      resumeReads();
      releaseAllReads();
    });
    await waitFor(() => expect(state.errors).toHaveBeenCalledTimes(2));
    expect(writeLog()).toEqual([]);
    expect(getQueueLength(uid)).toBe(1);
    expect(getQueueLength("other-user")).toBe(1);
    expect(getFailedMealSaveCount(uid)).toBe(1);
    expect(getFailedMealSaveCount("other-user")).toBe(0);
    expect(banner()).toHaveTextContent(
      "1 change saved on this phone · waiting to sync"
    );
    state.uid = uid;
    state.auth.currentUser = { uid };
    view.rerender(<App />);
    expect(banner()).toHaveTextContent("1 meal needs attention");
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeEnabled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing meals" })
      )
    );
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(readDoc("users/other-user/meals/other")).toBeUndefined();
    expect(getQueueLength("other-user")).toBe(1);
    expect(banner()).toBeEmptyDOMElement();
  });

  it("acknowledges an already saved meal without duplicating it or overwriting later diary edits", async () => {
    seedFirestore({
      [`${meals}/first`]: {
        ...meal,
        foodName: "Edited oats",
        totalCalories: 500,
      },
    });
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    renderLayout();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing meals" })
      )
    );
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject({
      foodName: "Edited oats",
      totalCalories: 500,
    });
    expect(writeLog()).toEqual([]);
    expect(banner()).toBeEmptyDOMElement();
  });

  it("disproves permanent stranding: a later flush retries failed records and drains unrelated writes", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    queueDurableWrite(uid, runs, "later-run", { distance: 5000 });
    await failMealOnce();
    expect(
      await flushQueue(state.db as Parameters<typeof flushQueue>[0], uid)
    ).toBe(2);
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(readDoc(`${runs}/later-run`)).toMatchObject({ distance: 5000 });
    expect(getQueueLength(uid)).toBe(0);
  });

  it("disproves no recovery path: logging another meal automatically retries the failed meal", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    await createMealEntry(uid, { ...meal, foodName: "Rice" }, "new-meal");
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(readDoc(`${meals}/new-meal`)).toMatchObject({ foodName: "Rice" });
  });

  it("disproves all activity being blocked: an online direct safeMerge still writes", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    await safeMerge(
      state.db as Parameters<typeof safeMerge>[0],
      uid,
      `users/${uid}/logs`,
      "today",
      { weight: 82 }
    );
    expect(readDoc(`users/${uid}/logs/today`)).toMatchObject({ weight: 82 });
    expect(readDoc(`${meals}/first`)).toBeUndefined();
    expect(getQueueLength(uid)).toBe(1);
  });

  it("an actual new run completion also auto-retries the failed meal", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    const run: FinishedRun = {
      points: [],
      distance: 5000,
      elapsed: 1800,
      avgPaceSeconds: 360,
      calories: 400,
      elevationGain: 0,
      splits: [],
      runConfig: null,
      notes: "",
      relativeEffort: null,
      paceVerdictTone: null,
      isInvalid: false,
      invalidReason: null,
      routeQuality: null,
      shoeId: null,
      bestEfforts: [],
    };
    completeRun({
      uid,
      author: {},
      runId: "actual-run",
      alreadySaved: false,
      run,
      route: { routePreview: [], note: "" },
      unit: "km",
    });
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(readDoc(`${runs}/actual-run`)).toMatchObject({
      distance: 5000,
      duration: 1800,
    });
  });

  it("actual workout completion also auto-retries the failed meal and resolves synced", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    expect(
      await queueWorkoutCompletion(
        state.db as Parameters<typeof flushQueue>[0],
        uid,
        "actual-workout",
        { totalVolume: 1000 }
      )
    ).toBe("synced");
    expect(readDoc(`${meals}/first`)).toMatchObject(meal);
    expect(readDoc(`${workouts}/actual-workout`)).toMatchObject({
      totalVolume: 1000,
    });
    expect(getQueueLength(uid)).toBe(0);
  });

  it("positive control: a failed run offers actual Retry and clicking it drains the real queue", async () => {
    queueDurableWrite(uid, runs, "run", { distance: 5000 });
    failNextFirestore("getDoc", { path: `${runs}/run`, code: "unavailable" });
    expect(
      await flushQueue(state.db as Parameters<typeof flushQueue>[0], uid)
    ).toBe(0);
    renderLayout();
    expect(banner()).toHaveTextContent("1 run needs attention");
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing runs" })
      )
    );
    expect(readDoc(`${runs}/run`)).toMatchObject({ distance: 5000 });
    expect(getQueueLength(uid)).toBe(0);
    expect(banner()).toBeEmptyDOMElement();
  });

  it("preserves the deliberate create-delete-restore dependency when a create fails", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    queueDurableWrite(
      uid,
      meals,
      "first",
      { deletedAt: Timestamp.fromMillis(1_700_000_000_000) },
      true
    );
    queueDurableWrite(uid, meals, "first", { deletedAt: null }, true);
    await failMealOnce();
    expect(readDoc(`${meals}/first`)).toBeUndefined();
    expect(writeLog()).toEqual([]);
    renderLayout();
    expect(banner()).toHaveTextContent(
      "1 meal needs attention · saved on this phone. 2 other changes waiting to sync"
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing meals" })
      )
    );
    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    expect(readDoc(`${meals}/first`)).toMatchObject({
      ...meal,
      deletedAt: null,
    });
    expect(writeLog().map((write) => write.op)).toEqual([
      "set",
      "set:merge",
      "set:merge",
    ]);
    expect(getQueueLength(uid)).toBe(0);
  });
});

describe("a meal the server refuses for good", () => {
  async function refuseMeal() {
    failNextFirestore("getDoc", {
      path: `${meals}/first`,
      code: "permission-denied",
    });
    await flushQueue(state.db as Parameters<typeof flushQueue>[0], uid);
    expect(unfiredFailures()).toEqual([]);
  }

  it("can be discarded with its Undo, after a confirmation, and nothing is written", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    queueDurableWrite(
      uid,
      meals,
      "first",
      { deletedAt: Timestamp.fromMillis(1_700_000_000_000) },
      true
    );
    queueDurableWrite(uid, meals, "later", { ...meal, foodName: "Rice" });
    await refuseMeal();
    // The flush went past it: the later meal synced.
    expect(readDoc(`${meals}/later`)?.foodName).toBe("Rice");
    renderLayout();
    expect(banner()).toHaveTextContent(
      "1 meal needs attention · saved on this phone. 1 other change waiting to sync"
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Discard changes that won't save" })
    );
    expect(
      screen.getByRole("alertdialog", {
        name: "Discard the change that won't save?",
      })
    ).toHaveTextContent(
      "Retrying won't save it. Discarding removes it from this phone, and it can't be brought back."
    );
    expect(getQueueLength(uid)).toBe(2);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    );

    await waitFor(() => expect(getQueueLength(uid)).toBe(0));
    await waitFor(() => expect(banner()).toHaveTextContent(""));
    await flushQueue(state.db as Parameters<typeof flushQueue>[0], uid);
    // The Undo was discarded with its meal, never applied on its own.
    expect(readDoc(`${meals}/first`)).toBeUndefined();
  });

  it("keeps the meal when the person cancels", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await refuseMeal();
    renderLayout();
    fireEvent.click(
      screen.getByRole("button", { name: "Discard changes that won't save" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(getQueueLength(uid)).toBe(1);
    expect(banner()).toHaveTextContent("1 meal needs attention");
  });

  it("is not offered for a meal a retry can still save", async () => {
    queueDurableWrite(uid, meals, "first", meal);
    await failMealOnce();
    renderLayout();
    expect(
      screen.getByRole("button", { name: "Retry syncing meals" })
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Discard changes that won't save" })
    ).toBeNull();
  });
});
