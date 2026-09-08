import type { PropsWithChildren } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Layout from "../Layout";

const state = vi.hoisted(() => ({
  uid: "account-a" as string | null,
  queue: {} as Record<string, number>,
  failed: {} as Record<string, number>,
  outbox: {} as Record<string, number>,
  listeners: new Set<() => void>(),
  flush: vi.fn(),
  db: {},
}));
vi.mock("@/lib/auth", () => ({ useUid: () => state.uid }));
vi.mock("@/lib/firebase", () => ({ db: state.db }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/hooks/useUnreadCount", () => ({
  useUnreadCount: () => ({ count: 0, markSeen: vi.fn() }),
}));
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("@/lib/offlineQueue", () => ({
  getQueueLength: (uid: string) => state.queue[uid] ?? 0,
  getFailedWorkoutCompletionCount: (uid: string) => state.failed[uid] ?? 0,
  subscribeQueuedWrites: (listener: () => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
  flushQueue: (...args: unknown[]) => state.flush(...args),
}));
vi.mock("@/features/program/commandOutbox", () => ({
  outboxLength: (uid: string) => state.outbox[uid] ?? 0,
}));
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  // Status is the subject, not the exit animation's final frame.
  AnimatePresence: ({ children }: PropsWithChildren) => children,
}));

function App() {
  return (
    <MemoryRouter>
      <Layout />
    </MemoryRouter>
  );
}
function banner() {
  return document.querySelector('[aria-live="polite"]')!;
}
function notifyQueue() {
  act(() => state.listeners.forEach((listener) => listener()));
}
function setNetwork(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
  act(() => window.dispatchEvent(new Event(online ? "online" : "offline")));
}

beforeEach(() => {
  vi.useFakeTimers();
  state.uid = "account-a";
  state.queue = {};
  state.failed = {};
  state.outbox = {};
  state.listeners.clear();
  state.flush.mockReset();
  state.flush.mockResolvedValue(0);
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Layout pending changes", () => {
  it("shows this account's two queues even when the app starts online", () => {
    state.queue = { "account-a": 1, "account-b": 20 };
    state.outbox = { "account-a": 1, "account-b": 10 };
    render(<App />);
    expect(banner()).toHaveTextContent(
      "2 changes saved on this phone · waiting to sync"
    );
    expect(banner()).not.toHaveTextContent("synced");
  });

  it("does not hide pending writes on reconnect or when the reconnect notice expires", () => {
    setNetwork(false);
    state.queue["account-a"] = 2;
    render(<App />);
    expect(banner()).toHaveTextContent(
      "You're offline · 2 changes saved on this phone"
    );
    setNetwork(true);
    expect(banner()).not.toHaveTextContent("You're offline");
    expect(banner()).toHaveTextContent(
      "2 changes saved on this phone · waiting to sync"
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(banner()).toHaveTextContent(
      "2 changes saved on this phone · waiting to sync"
    );
  });

  it("updates immediately when an online durable write enters and leaves the queue", () => {
    render(<App />);
    expect(banner()).toBeEmptyDOMElement();
    state.queue["account-a"] = 1;
    notifyQueue();
    expect(banner()).toHaveTextContent(
      "1 change saved on this phone · waiting to sync"
    );
    state.queue["account-a"] = 0;
    notifyQueue();
    expect(banner()).toBeEmptyDOMElement();
  });

  it("keeps polling programme commands while online", () => {
    render(<App />);
    state.outbox["account-a"] = 1;
    act(() => vi.advanceTimersByTime(3000));
    expect(banner()).toHaveTextContent("1 change saved on this phone");
    state.outbox["account-a"] = 0;
    act(() => vi.advanceTimersByTime(3000));
    expect(banner()).toBeEmptyDOMElement();
  });

  it("never carries another account's queued or failed records across sign-in changes", () => {
    state.queue = { "account-a": 1, "account-b": 2 };
    state.failed["account-a"] = 1;
    const view = render(<App />);
    expect(banner()).toHaveTextContent("1 workout needs attention");
    state.uid = "account-b";
    view.rerender(<App />);
    expect(banner()).toHaveTextContent("2 changes saved on this phone");
    expect(banner()).not.toHaveTextContent("needs attention");
    expect(
      screen.queryByRole("button", { name: "Retry syncing workouts" })
    ).not.toBeInTheDocument();
    state.uid = null;
    view.rerender(<App />);
    expect(banner()).toBeEmptyDOMElement();
    expect(state.listeners.size).toBe(0);
  });

  it("offers a scoped retry for failed workouts without hiding unrelated pending changes", async () => {
    state.queue["account-a"] = 2;
    state.failed["account-a"] = 1;
    state.flush.mockRejectedValueOnce(new Error("unavailable"));
    render(<App />);
    expect(banner()).toHaveTextContent(
      "1 workout needs attention · saved on this phone. 1 other change waiting to sync"
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Retry syncing workouts" })
      )
    );
    expect(state.flush).toHaveBeenCalledWith(state.db, "account-a");
    expect(banner()).toHaveTextContent("1 workout needs attention");
    expect(
      screen.getByRole("button", { name: "Retry syncing workouts" })
    ).toBeEnabled();
  });

  it("does not let a late retry acknowledgement change the next account's status", async () => {
    let resolveRetry!: (value: number) => void;
    state.flush.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveRetry = resolve;
        })
    );
    state.queue = { "account-a": 1, "account-b": 2 };
    state.failed["account-a"] = 1;
    const view = render(<App />);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry syncing workouts" })
    );
    state.uid = "account-b";
    view.rerender(<App />);
    await act(async () => resolveRetry(1));
    expect(banner()).toHaveTextContent(
      "2 changes saved on this phone · waiting to sync"
    );
    expect(banner()).not.toHaveTextContent("needs attention");
  });

  it("reports connectivity alone when no local changes are known", () => {
    setNetwork(false);
    render(<App />);
    expect(banner()).toHaveTextContent("You're offline");
    expect(banner()).not.toHaveTextContent("saved");
    setNetwork(true);
    expect(banner()).toHaveTextContent("Back online");
    expect(banner()).not.toHaveTextContent("syncing");
  });
});
