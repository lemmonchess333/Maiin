vi.mock("@/hooks/useAccountDeletionStatus", () => ({
  useAccountDeletionStatus: () => ({ pending: false, completed: false }),
}));
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
  within,
  act,
} from "@testing-library/react";

vi.mock("@/lib/accountDeletionClient", () => ({
  deleteAccount: vi.fn(),
}));
import { deleteAccount } from "@/lib/accountDeletionClient";

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
  useUid: () => useAuthMock().user?.uid ?? null,
}));

import AccountSection from "../AccountSection";
import {
  reauthWithPassword,
  reauthWithGoogle,
  reauthWithApple,
} from "@/lib/reauth";
import { toast } from "sonner";
import { purgeFoodPhotos } from "@/lib/foodPhotoStore";
import { discardDeletedAccountPushState } from "@/lib/pushNotifications";
vi.mock("@/lib/foodPhotoStore", () => ({ purgeFoodPhotos: vi.fn() }));
vi.mock("@/lib/pushNotifications", () => ({
  discardDeletedAccountPushState: vi.fn(),
}));

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
  vi.clearAllMocks();
  vi.mocked(deleteAccount).mockReset().mockResolvedValue("completed");
  vi.mocked(reauthWithPassword).mockReset().mockResolvedValue(undefined);
  vi.mocked(reauthWithGoogle).mockReset().mockResolvedValue(undefined);
  vi.mocked(reauthWithApple).mockReset().mockResolvedValue(undefined);
  vi.mocked(purgeFoodPhotos).mockReset().mockResolvedValue(undefined);
  vi.mocked(discardDeletedAccountPushState)
    .mockReset()
    .mockResolvedValue(undefined);
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: makeUser(), profile: {} });
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

    fireEvent.click(screen.getByText(/Data & account/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete account$/i }));

    expect(
      screen.getByRole("alertdialog", { name: "Delete account" })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type DELETE")
    ).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByText(/Data & account/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete account$/i }));

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
    expect(
      screen.getByRole("alertdialog", { name: "Delete account" })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Type DELETE")
    ).not.toBeInTheDocument();
  });

  it("opens the App Store subscription deep-link when the user taps 'Open subscription settings'", () => {
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: { appleOriginalTransactionId: "1000000000000001" },
      loading: false,
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderSection();

    fireEvent.click(screen.getByText(/Data & account/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete account$/i }));
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
    fireEvent.click(screen.getByText(/Data & account/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete account$/i }));

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
    fireEvent.click(screen.getByText(/Data & account/i));
    fireEvent.click(screen.getByRole("button", { name: /^Delete account$/i }));
    // Confirm button inside the modal shares the "Delete account" name
    // with the opener — it is the last one rendered.
    const confirmButtons = screen.getAllByRole("button", {
      name: /^Delete account$/i,
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    // The reauth prompt must open — NOT a raw toast of the server message.
    await waitFor(() =>
      expect(screen.getByText(/Confirm it's you/i)).toBeInTheDocument()
    );
  });
});

const recentAuthError = Object.assign(new Error("Reauthentication required"), {
  code: "functions/failed-precondition",
  details: { errorCode: "requires-recent-auth" },
});

function openConfirm(
  user = makeUser(),
  signOut = vi.fn().mockResolvedValue(undefined)
) {
  const view = render(<AccountSection inline user={user} signOut={signOut} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return { ...view, signOut };
}
function submitDeletion() {
  fireEvent.click(
    within(
      screen.getByRole("alertdialog", { name: "Delete account" })
    ).getByRole("button", { name: "Delete account" })
  );
}

describe("AccountSection deletion recovery", () => {
  it("reopens with an enabled confirmation after a cleanup failure and cancel", async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(
      new Error("internal diagnostics")
    );
    const { signOut } = openConfirm();
    submitDeletion();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "internal diagnostics"
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    submitDeletion();
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });

  it("cannot dismiss or start another deletion while cleanup runs", async () => {
    let resolve!: (value: "completed") => void;
    vi.mocked(deleteAccount).mockReturnValue(
      new Promise<"completed" | "pending">((done) => {
        resolve = done;
      })
    );
    openConfirm();
    submitDeletion();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.submit(
      screen
        .getByRole("alertdialog", { name: "Delete account" })
        .querySelector("form")!
    );
    expect(deleteAccount).toHaveBeenCalledOnce();
    await act(async () => {
      resolve("completed");
    });
  });

  it("still signs out after successful server deletion if device cleanup fails", async () => {
    vi.mocked(purgeFoodPhotos).mockRejectedValueOnce(
      new Error("device unavailable")
    );
    const { signOut } = openConfirm();
    submitDeletion();
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(discardDeletedAccountPushState).toHaveBeenCalledWith("user-abc");
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Account deleted"),
      expect.anything()
    );
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("retries sign-out without repeating deletion", async () => {
    const signOut = vi
      .fn()
      .mockRejectedValueOnce(new Error("sign-out failed"))
      .mockResolvedValue(undefined);
    openConfirm(makeUser(), signOut);
    submitDeletion();
    fireEvent.click(
      await screen.findByRole("button", { name: "Try signing out again" })
    );
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(2));
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("does not sign out a replacement account when an old request completes", async () => {
    let resolve!: (value: "completed") => void;
    vi.mocked(deleteAccount).mockReturnValue(
      new Promise<"completed" | "pending">((done) => {
        resolve = done;
      })
    );
    const { rerender, signOut } = openConfirm();
    submitDeletion();
    rerender(
      <AccountSection
        inline
        user={makeUser({ uid: "new-user" })}
        signOut={signOut}
      />
    );
    await act(async () => {
      resolve("completed");
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(purgeFoodPhotos).not.toHaveBeenCalled();
  });

  it("does not carry a pending deletion or device cleanup over to a replacement account", async () => {
    vi.mocked(deleteAccount).mockResolvedValueOnce("pending");
    const { rerender, signOut } = openConfirm();
    submitDeletion();
    await screen.findByRole("alertdialog", {
      name: "Account deletion in progress",
    });
    await waitFor(() =>
      expect(purgeFoodPhotos).toHaveBeenCalledWith("user-abc")
    );
    rerender(
      <AccountSection
        inline
        user={makeUser({ uid: "new-user" })}
        signOut={signOut}
      />
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await act(async () => {});
    expect(purgeFoodPhotos).not.toHaveBeenCalledWith("new-user");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers sign-in recovery after three failed password attempts", async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(recentAuthError);
    vi.mocked(reauthWithPassword).mockRejectedValue(
      Object.assign(new Error("wrong password"), {
        code: "auth/invalid-credential",
      })
    );
    openConfirm();
    submitDeletion();
    fireEvent.change(await screen.findByLabelText("Current password"), {
      target: { value: "wrong" },
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      fireEvent.click(
        screen.getByRole("button", { name: "Confirm with password" })
      );
      await waitFor(() =>
        expect(reauthWithPassword).toHaveBeenCalledTimes(attempt)
      );
      if (attempt < 3)
        await screen.findByRole("button", { name: "Confirm with password" });
    }
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't verify your identity"),
        expect.anything()
      )
    );
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("a cancelled provider sheet does not consume failed attempts", async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(recentAuthError);
    vi.mocked(reauthWithGoogle).mockRejectedValue(
      Object.assign(new Error("Cancelled"), { code: "ERR_CANCELED" })
    );
    openConfirm(makeUser({ providerData: [{ providerId: "google.com" }] }));
    submitDeletion();
    for (let attempt = 1; attempt <= 3; attempt++) {
      fireEvent.click(
        await screen.findByRole("button", { name: "Confirm with Google" })
      );
      await waitFor(() =>
        expect(reauthWithGoogle).toHaveBeenCalledTimes(attempt)
      );
    }
    await screen.findByRole("button", { name: "Confirm with Google" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("requires Apple revocation even for a fresh session linked to another provider", async () => {
    openConfirm(
      makeUser({
        providerData: [{ providerId: "password" }, { providerId: "apple.com" }],
      })
    );
    submitDeletion();
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm with Apple" })
    );
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledOnce());
    expect(reauthWithApple).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-abc" }),
      { forDeletion: true }
    );
    expect(vi.mocked(reauthWithApple).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteAccount).mock.invocationCallOrder[0]
    );
  });

  it("does not delete if Apple revocation fails", async () => {
    vi.mocked(reauthWithApple).mockRejectedValueOnce(
      new Error("revoke failed")
    );
    openConfirm(makeUser({ providerData: [{ providerId: "apple.com" }] }));
    submitDeletion();
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm with Apple" })
    );
    await screen.findByRole("alert");
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("warns RevenueCat iOS subscribers even without a legacy Apple transaction ID", () => {
    useAuthMock.mockReturnValue({
      user: makeUser(),
      profile: { subscriptionSource: "ios_iap" },
    });
    openConfirm();
    expect(
      screen.getByRole("alertdialog", {
        name: "Cancel your App Store subscription first",
      })
    ).toBeInTheDocument();
  });
});
