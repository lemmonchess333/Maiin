// @vitest-environment jsdom
/**
 * A device that has had an account starts Firestore and the signed-in
 * shell when the app's code loads; one that never has starts neither.
 *
 * Almost every launch on a phone that has signed in before restores that
 * session, and both the profile read (Firestore) and the shell's chunks
 * used to wait for Auth to say so: IndexedDB first, then the downloads.
 * Starting them at module load overlaps the two. A first visit is the
 * other side: the person is about to see Login, and Firestore is the
 * largest thing the login form never reads, so nothing starts until
 * someone signs in (the eager-graph test holds the static half of that).
 *
 * The loads are observed where they land: each module below is replaced,
 * and its factory runs only when something imports it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const started = vi.hoisted(() => new Set<string>());

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => {
  started.add("firestore");
  return { db: {}, storage: {}, functions: {} };
});
vi.mock("@/components/MotionRoot", () => {
  started.add("MotionRoot");
  return { default: () => null };
});
vi.mock("@/features/streaks/useStreaks", () => {
  started.add("StreaksProvider");
  return { StreaksProvider: () => null, useStreaks: () => ({}) };
});
vi.mock("@/hooks/RemindersProvider", () => {
  started.add("RemindersProvider");
  return { RemindersProvider: () => null };
});
vi.mock("@/hooks/DailyLogsProvider", () => {
  started.add("DailyLogsProvider");
  return { DailyLogsProvider: () => null };
});
vi.mock("@/components/Layout", () => {
  started.add("Layout");
  return { default: () => null };
});
vi.mock("@/pages/Home", () => {
  started.add("Home");
  return { default: () => null };
});

const SHELL = [
  "firestore",
  "MotionRoot",
  "StreaksProvider",
  "RemindersProvider",
  "DailyLogsProvider",
  "Layout",
  "Home",
];

/** Long enough for every import() the module load started to land. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.resetModules();
  started.clear();
  localStorage.clear();
});

describe("loading the app's code", () => {
  it("on a first-ever visit, starts neither Firestore nor the shell", async () => {
    await import("@/App");
    await settle();
    expect([...started]).toEqual([]);
  });

  it("on a device that has signed in before, starts both before Auth answers", async () => {
    localStorage.setItem("tropos.signed_in_before", "1");
    await import("@/App");
    await vi.waitFor(() =>
      expect([...started].sort()).toEqual([...SHELL].sort())
    );
  });
});
