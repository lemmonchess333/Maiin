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
 * The exports have moved twice since. The Settings pass put them on a
 * Your data page with recently deleted meals; Trim1 call 7 folded that
 * page, and Subscription's one button, into Account. So the count is
 * pinned here again: three exports, once each, on the composed page.
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

const auth = vi.hoisted(() => ({
  profile: { uid: "u1", onboardingComplete: true } as Record<string, unknown>,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: USER, profile: auth.profile, signOut: vi.fn() }),
}));
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => ({ tier: "free", isInTrial: false, trialDaysLeft: 0 }),
}));
vi.mock("@/hooks/useScanUsage", () => ({
  useScanUsage: () => ({
    loading: false,
    isPro: false,
    used: 0,
    limit: 0,
    resetDate: new Date(2026, 10, 12, 0, 0),
  }),
}));
vi.mock("@/hooks/useAccountDeletionStatus", () => ({
  useAccountDeletionStatus: () => ({ pending: false, completed: false }),
}));
vi.mock("@/lib/settingsAnalytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/export", () => ({
  exportWorkoutsCSV: vi.fn().mockResolvedValue(""),
  exportRunsCSV: vi.fn().mockResolvedValue(""),
  exportMealsCSV: vi.fn().mockResolvedValue(""),
  exportBodyweightCSV: vi.fn().mockResolvedValue(""),
  exportAllDataJSON: vi.fn().mockResolvedValue("{}"),
  csvFile: vi.fn(),
  jsonFile: vi.fn(),
  downloadCSV: vi.fn(),
}));
vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import SettingsAccount from "../SettingsAccount";

function renderPage(duringSetup = false) {
  render(
    <MemoryRouter>
      <SettingsAccount duringSetup={duringSetup} />
    </MemoryRouter>
  );
}

const EXPORTS = [
  /^export workouts/i,
  /^export runs/i,
  /^export meals/i,
  /^export bodyweight/i,
  /^export all data/i,
  // The answers to the two emails a person can choose (App1 Q55).
  /^export email choices/i,
];

describe("SettingsAccount composition", () => {
  it("renders each export exactly ONCE", () => {
    // The regression. Six rows shipped; three was correct, and the email
    // choices (App1 Q55) make four.
    renderPage();
    for (const label of EXPORTS) {
      expect(screen.getAllByRole("button", { name: label })).toHaveLength(1);
    }
  });

  it("still offers export at all, and the way into deleted meals", () => {
    // The control. Without it, "exactly once" is satisfied by a page that
    // dropped export entirely — which is the other way to get this wrong,
    // and the one that silently removes a user right.
    renderPage();
    expect(screen.getAllByRole("button", { name: /^export /i })).toHaveLength(
      6
    );
    expect(
      screen.getByRole("button", { name: /recently deleted meals/i })
    ).toBeInTheDocument();
  });

  it("signs out and deletes, once each", () => {
    renderPage();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Delete account" })
    ).toHaveLength(1);
  });

  it("carries the plan, opening the Pro page, above the sign-in", () => {
    // Subscription's page was this one button (Trim1 call 7).
    renderPage();
    const plan = screen.getByRole("button", { name: /upgrade to pro/i });
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(
      plan.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("is the sign-in and the way out alone during setup", () => {
    // Setup has no plan to show and nothing logged to export.
    renderPage(true);
    expect(screen.queryAllByRole("button", { name: /^export /i })).toEqual([]);
    expect(
      screen.queryByRole("button", { name: /upgrade to pro/i })
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });
});

/* Priv1 call 1: the health-details agreement's Delete my account, and
   Social & privacy's line about it, open this page at Delete account; an
   account at the agreement gets the whole page (its exports and its plan,
   before it goes) with a way back to the agreement. */
describe("SettingsAccount from the health-details agreement", () => {
  it("lands on Delete account when linked to it", () => {
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      render(
        <MemoryRouter initialEntries={["/settings/account#delete-account"]}>
          <SettingsAccount />
        </MemoryRouter>
      );
      const target = document.getElementById("delete-account");
      expect(target).toContainElement(
        screen.getByRole("button", { name: "Delete account" })
      );
      expect(scrolled).toHaveBeenCalledTimes(1);
      expect(scrolled.mock.contexts[0]).toBe(target);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("does not move without the link", () => {
    const scrolled = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      renderPage();
      // Anchor: the row it would move to is on the page.
      expect(
        screen.getByRole("button", { name: "Delete account" })
      ).toBeInTheDocument();
      expect(scrolled).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("goes back to the agreement, with the whole page", () => {
    render(
      <MemoryRouter>
        <SettingsAccount back={{ to: "/", label: "Health details" }} />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("button", { name: "Back to health details" })
    ).toBeInTheDocument();
    // The whole page: its first export and its last row, not a count of
    // exports that grows with each new one.
    expect(
      screen.getByRole("button", { name: "Export workouts" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete account" })
    ).toBeInTheDocument();
  });
});
