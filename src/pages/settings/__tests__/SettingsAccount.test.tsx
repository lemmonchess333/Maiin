/**
 * SettingsAccount — page COMPOSITION.
 *
 * This exists because of a bug no other test could have caught. #1923
 * rendered `DataExportSection` on this page, believing the page advertised
 * data export ("Sign-in, data export, delete account") and shipped none.
 * `AccountSection` had been carrying a byte-for-byte inline copy the whole
 * time, so the screen shipped SIX export rows.
 *
 * Everything was green throughout. `DataExportSection.test.tsx` passes —
 * the component works. `AccountSection.test.tsx` passes — that copy works
 * too. `componentReachability` passes — the component is now referenced.
 * Each part was correct in isolation and the page was wrong, which is
 * precisely the shape unit tests cannot see. A screenshot caught it.
 *
 * So the assertion here is about the composed page: how many of a thing
 * the user actually ends up looking at. That is the only level at which
 * "rendered twice" is even expressible.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { User } from "firebase/auth";

// `providerData` is load-bearing, not decoration: SecuritySection reads it
// to decide whether a password change is even offered, and destructures it
// without a guard.
const USER = {
  uid: "u1",
  email: "e2e@tropos.test",
  emailVerified: true,
  providerData: [{ providerId: "password" }],
} as unknown as User;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: USER, signOut: vi.fn() }),
}));
vi.mock("@/lib/export", () => ({
  exportWorkoutsCSV: vi.fn().mockResolvedValue(""),
  exportMealsCSV: vi.fn().mockResolvedValue(""),
  exportBodyweightCSV: vi.fn().mockResolvedValue(""),
  downloadCSV: vi.fn(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SettingsAccount from "../SettingsAccount";

function renderPage() {
  render(
    <MemoryRouter>
      <SettingsAccount />
    </MemoryRouter>
  );
}

describe("SettingsAccount composition", () => {
  it("renders each export exactly ONCE", () => {
    // The regression. Six rows shipped; three is correct.
    renderPage();
    for (const label of [
      /export workouts \(csv\)/i,
      /export meals \(csv\)/i,
      /export bodyweight \(csv\)/i,
    ]) {
      expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    }
  });

  it("still offers export at all", () => {
    // The control. Without it, "exactly once" is satisfied by a page that
    // dropped export entirely — which is the other way to get this wrong,
    // and the one that silently removes a user right.
    renderPage();
    expect(
      screen.getAllByRole("button", { name: /export .*\(csv\)/i })
    ).toHaveLength(3);
  });

  /*
   * Deliberately NOT asserting that export appears before Delete Account.
   *
   * It reads like a natural third test — you want to take your data with
   * you BEFORE deleting the account — but export now lives inside
   * AccountSection's own block rather than at this page's level, so the
   * ordering is that component's business and not this page's
   * composition. Written as a DOM-index comparison it also failed on
   * first run, which means the ordering I would have been pinning is not
   * the one I had in my head. Asserting it anyway would pin a guess, and
   * the visual order is what actually matters here — that is a
   * screenshot's job, and a screenshot is what caught the bug this file
   * exists for.
   */
});
