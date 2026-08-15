/**
 * The delete affordance for a logged session (ADR-0012's client half).
 *
 * The copy is the load-bearing part, not the button, so that is what these
 * pin. ADR-0012 is explicit that deleting a session can lower the user's
 * standing in a live challenge, that this is correct for a mis-log, and
 * that "the copy should not pretend otherwise". It also leaves three
 * things standing on purpose — partner streaks, milestone badges and
 * `fastest_effort` bests — which a user reading the word "delete" would
 * reasonably assume are coming back.
 *
 * The other property here is that a cancelled confirmation deletes
 * nothing. That reads as trivially true and is exactly the kind of thing
 * that breaks silently: the failure is invisible until someone loses a
 * session they meant to keep.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom"
    );
  return { ...actual, useNavigate: () => navigate };
});

import DeleteSessionAction from "../DeleteSessionAction";
import { toast } from "@/lib/toast";
import {
  resetFirestore,
  seedFirestore,
  allPaths,
  failNextFirestore,
  unfiredFailures,
} from "@/test/firestoreHarness";

function renderAction(props: Partial<React.ComponentProps<typeof DeleteSessionAction>> = {}) {
  return render(
    <MemoryRouter>
      <DeleteSessionAction uid="u1" kind="workout" id="w-1" {...props} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  seedFirestore({
    "users/u1/workouts/w-1": { date: "2026-08-05", totalVolume: 6000 },
    "users/u1/runs/r-1": { date: "2026-08-05", distance: 6000 },
    "activities/act-1": { authorId: "u1", type: "workout" },
  });
});

afterEach(() => cleanup());

describe("DeleteSessionAction", () => {
  it("names the session type in both the trigger and the confirmation", async () => {
    renderAction({ kind: "run", id: "r-1" });

    fireEvent.click(screen.getByRole("button", { name: /delete this run/i }));
    expect(
      await screen.findByRole("alertdialog", { name: /delete this run\?/i })
    ).toBeInTheDocument();
  });

  it("warns that challenge standing can drop, and that streaks and badges stay", async () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));

    const dialog = await screen.findByRole("alertdialog");
    // The consequence ADR-0012 says the copy must not hide.
    expect(dialog).toHaveTextContent(/challenge progress and lifetime totals/i);
    expect(dialog).toHaveTextContent(/can go down/i);
    // And the three things that deliberately do NOT come back.
    expect(dialog).toHaveTextContent(/streaks and badges .* stay/i);
  });

  it("says the feed post goes when the session was shared, and stays when it wasn't", async () => {
    const { unmount } = renderAction({ sharedActivityId: "act-1" });
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      /post is removed from your feed/i
    );
    unmount();

    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));
    // A session with no recorded link — anything shared before
    // `recordSharedActivity` covered its path (runs and all offline
    // shares, pre-fix) — has an unreachable post, so the copy must not
    // promise a removal that cannot happen.
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      /stays on your feed/i
    );
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(allPaths()).toContain("users/u1/workouts/w-1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("deletes the session, confirms, and leaves the detail page", async () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(allPaths()).not.toContain("users/u1/workouts/w-1")
    );
    expect(toast.success).toHaveBeenCalledWith("Workout deleted");
    // `replace`, so Back cannot return to a detail page whose document is
    // gone — that lands on the not-found state for a session the user just
    // deleted on purpose.
    expect(navigate).toHaveBeenCalledWith("/history", { replace: true });
  });

  it("keeps the session and stays put when the delete fails", async () => {
    failNextFirestore("deleteDoc", { path: "users/u1/workouts/w-1" });
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: /delete this workout/i }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The armed failure actually fired — otherwise this test would be
    // asserting the happy path with an error message bolted on.
    expect(unfiredFailures()).toEqual([]);
    expect(allPaths()).toContain("users/u1/workouts/w-1");
    expect(navigate).not.toHaveBeenCalled();
  });
});
