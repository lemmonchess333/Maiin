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
 *
 * Since the Settings pass the exports live on Your data (/settings/data),
 * with recently deleted meals: Set1 put both in Data & Storage. So the
 * count is pinned there, and Account is pinned to carry none, beside the
 * two rows it does carry.
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
import SettingsData from "../SettingsData";

function renderPage(page: "account" | "data" = "account") {
  render(
    <MemoryRouter>
      {page === "account" ? <SettingsAccount /> : <SettingsData />}
    </MemoryRouter>
  );
}

const EXPORTS = [/^export workouts/i, /^export meals/i, /^export bodyweight/i];

describe("SettingsData composition", () => {
  it("renders each export exactly ONCE", () => {
    // The regression. Six rows shipped; three is correct.
    renderPage("data");
    for (const label of EXPORTS) {
      expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    }
  });

  it("still offers export at all, and the way into deleted meals", () => {
    // The control. Without it, "exactly once" is satisfied by a page that
    // dropped export entirely — which is the other way to get this wrong,
    // and the one that silently removes a user right.
    renderPage("data");
    expect(screen.getAllByRole("button", { name: /^export /i })).toHaveLength(
      3
    );
    expect(
      screen.getByRole("button", { name: /recently deleted meals/i })
    ).toBeInTheDocument();
  });
});

describe("SettingsAccount composition", () => {
  it("signs out and deletes, once each, and exports nothing", () => {
    renderPage("account");
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Delete account" })
    ).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: /^export /i })).toEqual([]);
  });
});
