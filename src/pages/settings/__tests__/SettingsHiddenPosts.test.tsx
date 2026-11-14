/**
 * Hidden posts (App1 Q38, Settings → Social & privacy → Hidden posts): the
 * posts the person hid, each with its author, its one line and Unhide; an
 * empty state that says what hiding does; and a post from someone blocked
 * either way left out, as every social surface leaves them out.
 *
 * Runs the real hook and the real post reader on the one Firestore fake
 * (ADR-0009); only the block list is stubbed, to say who is blocked.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase/firestore";
import {
  failNextFirestore,
  readDoc,
  readsAt,
  resetFirestore,
  seedFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

const state = vi.hoisted(() => ({
  blocked: new Set<string>(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "me" } },
}));
vi.mock("@/lib/auth", () => ({
  useUid: () => "me",
  useAuth: () => ({
    user: { uid: "me" },
    profile: { preferredDistanceUnit: "km" },
  }),
}));
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: state.blocked,
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: vi.fn(),
  }),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: state.toast }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));

import SettingsHiddenPosts from "../SettingsHiddenPosts";

const at = (iso: string) => Timestamp.fromMillis(Date.parse(iso));

/** Two posts from last year, so their day carries the year whatever the
 *  clock says. */
function seedTwoHidden() {
  seedFirestore({
    "users/me/hiddenPosts/run-1": {
      hiddenAt: at("2026-11-02T09:00:00Z"),
      authorId: "maya",
    },
    "users/me/hiddenPosts/lift-1": {
      hiddenAt: at("2026-10-02T09:00:00Z"),
      authorId: "sam",
    },
    "activities/run-1": {
      authorId: "maya",
      authorName: "Maya",
      type: "run",
      visibility: "public",
      activityTitle: "Easy run",
      distance: 5200,
      createdAt: at("2025-03-20T08:00:00Z"),
    },
    "activities/lift-1": {
      authorId: "sam",
      authorName: "Sam",
      type: "workout",
      visibility: "public",
      workoutName: "Pull — Lat Focus",
      exerciseCount: 6,
      createdAt: at("2025-02-11T18:00:00Z"),
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsHiddenPosts />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  state.blocked = new Set();
});
afterEach(cleanup);

describe("SettingsHiddenPosts — the list", () => {
  it("lists each hidden post, newest hidden first: author, its line and its day", async () => {
    seedTwoHidden();
    renderPage();
    const group = await screen.findByRole("list");
    const rows = within(group).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Maya");
    expect(rows[0]).toHaveTextContent("Easy run · 5.2 km · 20 Mar 2025");
    expect(rows[1]).toHaveTextContent("Sam");
    expect(rows[1]).toHaveTextContent("Pull · 6 exercises · 11 Feb 2025");
    expect(screen.getByText("2 hidden posts")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unhide Maya’s post" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unhide Sam’s post" })
    ).toBeInTheDocument();
  });

  it("Unhide takes the post off the list and out of the account's hidden posts", async () => {
    seedTwoHidden();
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Unhide Maya’s post" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Unhide Maya’s post" })
      ).toBeNull()
    );
    expect(readDoc("users/me/hiddenPosts/run-1")).toBeUndefined();
    expect(readDoc("users/me/hiddenPosts/lift-1")).toBeDefined();
    expect(screen.getByText("1 hidden post")).toBeInTheDocument();
    expect(state.toast).toHaveBeenCalledWith(
      "Back in your feed",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      })
    );
    expect(state.toast.error).not.toHaveBeenCalled();
  });

  it("Undo hides the post again, with its author", async () => {
    seedTwoHidden();
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Unhide Maya’s post" })
    );
    await waitFor(() =>
      expect(readDoc("users/me/hiddenPosts/run-1")).toBeUndefined()
    );
    const [, options] = state.toast.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await screen.findByRole("button", { name: "Unhide Maya’s post" });
    expect(readDoc("users/me/hiddenPosts/run-1")?.authorId).toBe("maya");
  });

  it("says so when an unhide is refused", async () => {
    seedTwoHidden();
    renderPage();
    const unhide = await screen.findByRole("button", {
      name: "Unhide Maya’s post",
    });
    failNextFirestore("deleteDoc", {
      path: "users/me/hiddenPosts/run-1",
      code: "permission-denied",
    });
    fireEvent.click(unhide);
    await waitFor(() =>
      expect(state.toast.error).toHaveBeenCalledWith(
        "Couldn’t unhide it. Try again.",
        expect.anything()
      )
    );
    expect(unfiredFailures()).toEqual([]);
    expect(readDoc("users/me/hiddenPosts/run-1")).toBeDefined();
  });

  it("shows a post nobody can read any more as not available, with Remove", async () => {
    seedFirestore({
      "users/me/hiddenPosts/gone-1": {
        hiddenAt: at("2026-11-02T09:00:00Z"),
        authorId: "maya",
      },
    });
    renderPage();
    expect(await screen.findByText("Post not available")).toBeInTheDocument();
    expect(
      screen.getByText("Deleted, or no longer shared with you")
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove this post from the list" })
    );
    await waitFor(() =>
      expect(readDoc("users/me/hiddenPosts/gone-1")).toBeUndefined()
    );
  });

  it("offers Try again when the posts cannot be read", async () => {
    seedTwoHidden();
    failNextFirestore("getDoc", {
      path: "activities/run-1",
      code: "unavailable",
    });
    renderPage();
    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(unfiredFailures()).toEqual([]);
    expect(screen.queryByText("Posts you hide show here")).toBeNull();
    fireEvent.click(retry);
    expect(
      await screen.findByRole("button", { name: "Unhide Maya’s post" })
    ).toBeInTheDocument();
  });
});

describe("SettingsHiddenPosts — nothing hidden", () => {
  it("says what hiding does, and how to hide a post", async () => {
    renderPage();
    expect(
      await screen.findByText("Posts you hide show here")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/takes it out of your feed on all your devices/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Report activity/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("SettingsHiddenPosts — blocks", () => {
  it("leaves out a post whose author is blocked, without reading it", async () => {
    seedTwoHidden();
    state.blocked = new Set(["maya"]);
    renderPage();
    expect(
      await screen.findByRole("button", { name: "Unhide Sam’s post" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Maya")).toBeNull();
    expect(screen.queryByText("Post not available")).toBeNull();
    expect(screen.getByText("1 hidden post")).toBeInTheDocument();
    expect(readsAt("activities/run-1")).toEqual([]);
    // The record stays: lift the block and the post is still hidden.
    expect(readDoc("users/me/hiddenPosts/run-1")).toBeDefined();
  });

  it("leaves out a post its read shows is from someone blocked", async () => {
    // Hidden before the author was stored with it (the device's old list).
    seedFirestore({
      "users/me/hiddenPosts/run-1": { hiddenAt: at("2026-11-02T09:00:00Z") },
      "activities/run-1": {
        authorId: "maya",
        authorName: "Maya",
        type: "run",
        visibility: "public",
        distance: 5200,
        createdAt: at("2025-03-20T08:00:00Z"),
      },
    });
    state.blocked = new Set(["maya"]);
    renderPage();
    expect(
      await screen.findByText("Posts you hide show here")
    ).toBeInTheDocument();
    expect(screen.queryByText("Maya")).toBeNull();
  });
});
