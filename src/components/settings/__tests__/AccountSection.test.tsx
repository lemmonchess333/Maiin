/**
 * AccountSection — P0b Sub1 R1A pin (b) Apple-sub warning.
 *
 * Apple was verified 2026-05-24 to have NO admin-cancellation API
 * for standard IAP subscriptions. Apple's official "Offering
 * account deletion in your app" guidance requires the app to
 * detect active iOS subscriptions, warn the user, and deep-link
 * to App Store subscription settings — the user must cancel
 * themselves before deletion will stop billing.
 *
 * Detection signal: `profile.appleOriginalTransactionId` set =
 * user purchased Pro via IAP at some point. Pre-deletion we treat
 * this as "active" (false positive better than false negative;
 * the App Store will show "no active subs" if they already
 * cancelled and that's a benign UX outcome). A future enhancement
 * could read live Apple Server API status via a callable — the
 * presence-based check satisfies App Store review today.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

vi.mock("@/lib/socialApi", () => ({
  deleteAccount: vi.fn(),
}));
import { deleteAccount } from "@/lib/socialApi";

vi.mock("@/lib/reauth", () => ({
  reauthWithPassword: vi.fn(),
  reauthWithGoogle: vi.fn(),
  reauthWithApple: vi.fn(),
  isSupportedReauthProvider: () => true,
}));

vi.mock("@/lib/export", () => ({
  exportWorkoutsCSV: vi.fn(),
  exportMealsCSV: vi.fn(),
  exportBodyweightCSV: vi.fn(),
  downloadCSV: vi.fn(),
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const useAuthMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => useAuthMock(),
}));

import AccountSection from "../AccountSection";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: "user-abc",
    email: "test@example.com",
    providerData: [{ providerId: "password" }],
    ...overrides,
  } as never;
}

function renderSection() {
  return render(<AccountSection user={makeUser()} signOut={vi.fn()} />);
}

beforeEach(() => {
  useAuthMock.mockReset();
});

afterEach(cleanup);

describe("AccountSection — P0b Apple subscription warning", () => {
  it("goes straight to the DELETE-typing modal for users without an Apple subscription", () => {
    // Free user or web-only (Stripe) Pro user. No Apple warning
    // should appear; the existing typed-DELETE confirmation is
    // the only gate. This is the regression guard for the
    // non-iOS path.
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: {},
      loading: false,
    });
    renderSection();

    fireEvent.click(screen.getByText(/Data & Account/i));
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));

    expect(screen.getByPlaceholderText("Type DELETE")).toBeInTheDocument();
    expect(
      screen.queryByText(/Cancel your App Store subscription first/i)
    ).not.toBeInTheDocument();
  });

  it("progresses to the DELETE-typing confirmation when the user taps 'Delete anyway'", async () => {
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: { appleOriginalTransactionId: "1000000000000001" },
      loading: false,
    });
    renderSection();

    fireEvent.click(screen.getByText(/Data & Account/i));
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));

    // Apple warning shown first.
    expect(
      screen.getByText(/Cancel your App Store subscription first/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type DELETE")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete anyway/i }));

    // Apple warning gone, typed-DELETE modal now visible. User
    // proceeded despite the active iOS subscription (still has to
    // type DELETE to confirm). The warning is now a Dialog primitive,
    // so it fades out via AnimatePresence — await its removal.
    await waitFor(() =>
      expect(
        screen.queryByText(/Cancel your App Store subscription first/i)
      ).not.toBeInTheDocument()
    );
    expect(screen.getByPlaceholderText("Type DELETE")).toBeInTheDocument();
  });

  it("opens the App Store subscription deep-link when the user taps 'Open subscription settings'", () => {
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: { appleOriginalTransactionId: "1000000000000001" },
      loading: false,
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderSection();

    fireEvent.click(screen.getByText(/Data & Account/i));
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /Open subscription settings/i })
    );

    // Apple's canonical universal deep-link (works iOS + web).
    expect(openSpy).toHaveBeenCalledWith(
      "https://apps.apple.com/account/subscriptions",
      "_blank"
    );

    openSpy.mockRestore();
  });

  it("shows the Apple-cancel warning (not the DELETE input) when an active iOS subscription is detected", () => {
    // `appleOriginalTransactionId` on the profile = user purchased
    // Pro via IAP at some point. Pre-deletion we warn them to
    // cancel via App Store first since Apple's APIs won't let us
    // do it server-side.
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: { appleOriginalTransactionId: "1000000000000001" },
      loading: false,
    });
    renderSection();

    // Open the AccordionSection so the Delete button is reachable.
    fireEvent.click(screen.getByText(/Data & Account/i));
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));

    // Apple-cancel warning surface is visible.
    expect(
      screen.getByText(/Cancel your App Store subscription first/i)
    ).toBeInTheDocument();

    // The regular DELETE-typing flow has NOT been opened yet.
    expect(
      screen.queryByPlaceholderText("Type DELETE")
    ).not.toBeInTheDocument();
  });

  /* Found live 2026-07-27 (test account b6768357): the server recent-auth
     gate throws message "Recent reauthentication required: ..." with
     details.errorCode "requires-recent-auth" — but the client branch only
     matched the CLIENT-SDK token "requires-recent-login", so the raw
     server message was dumped in a toast and the reauth prompt never
     opened. This pins the server error SHAPE (accountDeletionAuth.js +
     the index.js HttpsError wrapper) to the reauth flow. */
  it("opens the reauth prompt when the SERVER recent-auth gate rejects", async () => {
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: {},
      loading: false,
    });
    const serverErr = Object.assign(
      new Error(
        "Recent reauthentication required: session is 2158s old, max 300s."
      ),
      {
        code: "functions/failed-precondition",
        details: { errorCode: "requires-recent-auth" },
      }
    );
    vi.mocked(deleteAccount).mockRejectedValueOnce(serverErr);

    renderSection();
    fireEvent.click(screen.getByText(/Data & Account/i));
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));

    fireEvent.change(screen.getByPlaceholderText("Type DELETE"), {
      target: { value: "DELETE" },
    });
    // Confirm button inside the modal shares the "Delete Account" name
    // with the opener — it is the last one rendered.
    const confirmButtons = screen.getAllByRole("button", {
      name: /Delete Account/i,
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    // The reauth prompt must open — NOT a raw toast of the server message.
    await waitFor(() =>
      expect(screen.getByText(/Confirm it's you/i)).toBeInTheDocument()
    );
  });
});
