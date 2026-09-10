/**
 * Unblocking updates the SHARED blocked Set, not just the settings list.
 *
 * `useBlockedUsers` exists so every consumer sees one set — Social's feed
 * filter reads it — and the block direction already pairs its Firestore
 * write with `addBlocked`. Unblock wrote to Firestore and pruned its own
 * local list only, so the feed kept hiding the unblocked account's posts
 * until a reload. This pins the pairing on the way back.
 *
 * Same harness as the privacy-zones suite; the blocked list is fetched on
 * demand ("Show") and enriched from each account's public profile mirror,
 * which is read straight through Firestore — so the house fake is seeded
 * with one mirror doc rather than mocking a helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
import PrivacySection from "../PrivacySection";
import { seedFirestore, resetFirestore } from "@/test/firestoreHarness";

const unblockUser = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/socialApi", () => ({
  getBlockedUsers: vi.fn().mockResolvedValue(["them"]),
  unblockUser: (...a: unknown[]) => unblockUser(...a),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
const removeBlocked = vi.fn();
vi.mock("@/hooks/useBlockedUsers", () => ({
  useBlockedUsers: () => ({
    blocked: new Set<string>(["them"]),
    ready: true,
    addBlocked: vi.fn(),
    removeBlocked: (uid: string) => removeBlocked(uid),
  }),
}));

function renderSignedIn() {
  return render(
    <PrivacySection
      inline
      user={{ uid: "me" } as never}
      profile={{ aiAnalysisEnabled: false, hideSharedRouteEnds: false }}
      updateProfile={vi.fn().mockResolvedValue({ ok: true })}
      defaultVisibility="private"
      setDefaultVisibility={vi.fn()}
      privacyZones={[]}
      addZone={vi.fn().mockResolvedValue(undefined)}
      removeZone={vi.fn().mockResolvedValue(undefined)}
      newZoneName=""
      setNewZoneName={vi.fn()}
      newZoneRadius={200}
      setNewZoneRadius={vi.fn()}
    />
  );
}

beforeEach(() => {
  resetFirestore();
  unblockUser.mockClear();
  removeBlocked.mockClear();
  seedFirestore({ "users/them/public/profile": { displayName: "Them" } });
});
afterEach(cleanup);

describe("PrivacySection — unblocking", () => {
  it("writes the unblock AND drops the account from the shared Set", async () => {
    renderSignedIn();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unblock" }));

    await waitFor(() => expect(unblockUser).toHaveBeenCalledWith("me", "them"));
    // The half that was missing. Without it the feed's filter keeps the
    // account hidden until the next reload.
    expect(removeBlocked).toHaveBeenCalledWith("them");
  });

  it("removes the row from the settings list — the counterweight", async () => {
    // A fix that only touched the shared Set would leave the row on
    // screen; this keeps the visible half honest too.
    renderSignedIn();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText("Them")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(screen.queryByText("Them")).toBeNull());
  });
});
