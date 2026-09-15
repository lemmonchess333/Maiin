import { useAccountDeletionStatus } from "@/hooks/useAccountDeletionStatus";
import { useEffect, useReducer, useRef, useState } from "react";
import { haptic } from "@/lib/haptic";
import { writeString } from "@/lib/localStore";
import { Download, LogOut, Trash2 } from "lucide-react";
import DataExportSection from "./DataExportSection";
import TrackSettingsSectionView from "./TrackSettingsSectionView";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { deleteAccount } from "@/lib/accountDeletionClient";
import { discardDeletedAccountPushState } from "@/lib/pushNotifications";
import { purgeFoodPhotos } from "@/lib/foodPhotoStore";
import {
  reauthWithPassword,
  reauthWithGoogle,
  reauthWithApple,
  isSupportedReauthProvider,
  type SupportedReauthProviderId,
} from "@/lib/reauth";
import { friendlyAuthError } from "@/lib/authErrors";
import { modalReducer, initialModalState } from "./accountDeletionReducer";
import AccordionSection from "@/components/AccordionSection";
import type { User } from "firebase/auth";
import { Spinner } from "@/components/ui/Spinner";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";

/** Apple manage-subscriptions deep-link. Works on iOS (opens
 *  Settings → Apple ID → Subscriptions) and on web (opens the
 *  App Store account page). Per Apple's official account-
 *  deletion guidance. */
const APPLE_MANAGE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";

interface AccountSectionProps {
  user: User | null;
  signOut: () => Promise<void>;
  inline?: boolean;
}

/**
 * Return the list of providers we can reauth this user with —
 * intersection of `user.providerData` and our supported set.
 * Deduped by providerId so a user with multiple linked accounts
 * of the same type doesn't see duplicate buttons.
 */
function listSupportedProviders(user: User): SupportedReauthProviderId[] {
  const seen = new Set<string>();
  const out: SupportedReauthProviderId[] = [];
  for (const p of user.providerData) {
    if (!isSupportedReauthProvider(p.providerId)) continue;
    if (seen.has(p.providerId)) continue;
    seen.add(p.providerId);
    out.push(p.providerId);
  }
  return out;
}

/**
 * Apple's private-relay addresses are random@privaterelay.appleid.com.
 * Showing that in the "Re-enter password for <email>" line would be
 * confusing; the user can't recognise it. Hide and show a generic
 * fallback instead.
 */
function displayEmail(user: User): string | null {
  const email = user.email;
  if (!email) return null;
  if (email.endsWith("@privaterelay.appleid.com")) return null;
  return email;
}

function providerLabel(providerId: SupportedReauthProviderId): string {
  switch (providerId) {
    case "password":
      return "Confirm with password";
    case "google.com":
      return "Confirm with Google";
    case "apple.com":
      return "Confirm with Apple";
  }
}

export default function AccountSection(props: AccountSectionProps) {
  // A second account must never inherit an accepted request, password, or
  // device-cleanup state from the previous account in this mounted route.
  return (
    <AccountSectionContent key={props.user?.uid ?? "signed-out"} {...props} />
  );
}

function AccountSectionContent({
  user,
  signOut,
  inline = false,
}: AccountSectionProps) {
  const { profile } = useAuth();
  const deletion = useAccountDeletionStatus(user?.uid);
  const [requestPending, setPending] = useState(false);
  const pending = !deletion.completed && (deletion.pending || requestPending);
  const completedFlight = useRef(false);
  const deviceCleanupStarted = useRef(false);
  // Sub1 R1A pin (b) P0b — presence of appleOriginalTransactionId
  // means the user purchased Pro via IAP at some point. Since
  // Apple has no admin-cancellation API, we surface a pre-deletion
  // warning + deep-link so the user knows billing continues until
  // they cancel via App Store settings.
  const hasAppleSubscription =
    !!profile?.appleOriginalTransactionId ||
    profile?.subscriptionSource === "ios_iap";
  const [showAppleWarning, setShowAppleWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [modalState, dispatchModal] = useReducer(
    modalReducer,
    initialModalState
  );

  const inFlight = useRef(false);
  const activeUser = useRef(user);
  useEffect(() => {
    activeUser.current = user;
    return () => {
      activeUser.current = null;
    };
  }, [user]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const linkedProviders = user ? listSupportedProviders(user) : [];
  // Even a fresh session must obtain Apple's revocation credential. Linked
  // Apple accounts use Apple here so another provider cannot skip revocation.
  const usesApple = linkedProviders.includes("apple.com");
  const providers = usesApple ? ["apple.com" as const] : linkedProviders;
  const displayedEmail = user ? displayEmail(user) : null;
  const inReauthFlight = modalState.phase === "reauthenticating";
  const busy =
    inReauthFlight ||
    modalState.phase === "deleting" ||
    modalState.phase === "retrying" ||
    finishing;
  const showPasswordInput = providers.includes("password");

  const closeAndReset = () => {
    setShowDeleteModal(false);
    setPassword("");
    setReauthError(null);
    setDeleteError(null);
    dispatchModal({ type: "CANCEL_REAUTH" });
  };
  const dismiss = () => {
    if (!inFlight.current && !accountDeleted) closeAndReset();
  };
  const openDeletion = () => {
    dispatchModal({ type: "CANCEL_REAUTH" });
    setDeleteError(null);
    setShowDeleteModal(true);
  };
  const safeSignOut = async () => {
    if (user && activeUser.current?.uid !== user.uid) return;
    try {
      await signOut();
    } catch (error) {
      logger.error("AccountSection sign-out failed", error);
      toast.error("Couldn't sign out. Please try again.");
    }
  };

  // Server deletion and device cleanup have different outcomes. A device
  // error must never turn a confirmed server deletion into a failure/retry
  // of the destructive call. Always attempt sign-out and await its result.
  const finishDeletion = async () => {
    if (!user || activeUser.current?.uid !== user.uid) return;
    setAccountDeleted(true);
    setPending(false);
    setFinishing(true);
    const cleanup = await Promise.allSettled([
      discardDeletedAccountPushState(user.uid),
      purgeFoodPhotos(user.uid),
    ]);
    cleanup.forEach((result) => {
      if (result.status === "rejected") {
        logger.error("Deleted-account device cleanup failed", result.reason);
      }
    });
    if (activeUser.current?.uid !== user.uid) return;
    writeString("tropos.account_deleted", "1");
    if (cleanup.some((result) => result.status === "rejected")) {
      toast.error(
        "Account deleted. Some saved data on this device couldn't be cleared.",
        {
          duration: 10000,
        }
      );
    } else {
      toast.success("Account deleted. Signing you out…", { duration: 4000 });
    }
    try {
      await signOut();
      closeAndReset();
    } catch (error) {
      logger.error("Deleted-account sign-out failed", error);
      setDeleteError(
        "Your account has been deleted. Sign-out didn't finish. Please try again."
      );
    } finally {
      setFinishing(false);
    }
  };

  const runDeleteAccount = async (isRetry: boolean): Promise<void> => {
    if (!user || activeUser.current?.uid !== user.uid) return;
    try {
      const result = await deleteAccount(user.uid);
      if (activeUser.current?.uid !== user.uid) return;
      if (result === "pending") {
        setPending(true);
        dispatchModal({ type: "CANCEL_REAUTH" });
        return;
      }
    } catch (err) {
      if (activeUser.current?.uid !== user.uid) return;
      const fe = err as {
        code?: string;
        details?: { reason?: string; errorCode?: string };
      } | null;
      const msg = err instanceof Error ? err.message : "";
      if (
        fe?.details?.reason === "executor-disabled" ||
        msg.includes("executor-disabled")
      ) {
        toast.error(
          "Account deletion is temporarily paused. Please try again later."
        );
        closeAndReset();
      } else if (
        fe?.details?.errorCode === "requires-recent-auth" ||
        msg.includes("Recent reauthentication required") ||
        msg.includes("requires-recent-login")
      ) {
        if (isRetry) {
          toast.error("Sign in again to delete your account.", {
            action: {
              label: "Sign out",
              onClick: () => {
                void safeSignOut();
              },
            },
            duration: 10000,
          });
          closeAndReset();
        } else {
          dispatchModal({ type: "REQUIRE_REAUTH" });
        }
      } else {
        logger.error("Account deletion failed", err);
        const message =
          fe?.details?.reason === "deletion-in-progress"
            ? "Deletion is already running on the server. You can close the app and check back later."
            : fe?.details?.errorCode === "token-revoked" ||
                fe?.code === "functions/unauthenticated"
              ? "Your session has expired. Sign out and back in, then retry account deletion."
              : fe?.code === "functions/deadline-exceeded" ||
                  fe?.code === "functions/unavailable"
                ? "We couldn't confirm deletion. Check your connection and retry. If cleanup is still running, it will continue on the server."
                : "Account cleanup couldn't finish. Please retry account deletion. Your sign-in is kept until cleanup succeeds.";
        setDeleteError(message);
        dispatchModal({ type: "CANCEL_REAUTH" });
      }
      return;
    }
    await finishDeletion();
  };

  const handleReauth = async (
    provider: SupportedReauthProviderId
  ): Promise<void> => {
    if (!user || inFlight.current || modalState.phase !== "needs-reauth")
      return;
    inFlight.current = true;
    const failedAttempts = modalState.failedAttempts;
    setReauthError(null);
    dispatchModal({ type: "REAUTH_START", provider });
    try {
      if (provider === "password") await reauthWithPassword(user, password);
      else if (provider === "google.com") await reauthWithGoogle(user);
      else await reauthWithApple(user, { forDeletion: true });
      if (activeUser.current?.uid !== user.uid) return;
      setPassword("");
      dispatchModal({ type: "REAUTH_SUCCESS" });
      await runDeleteAccount(true);
    } catch (err) {
      if (activeUser.current?.uid !== user.uid) return;
      const code = String((err as { code?: string } | null)?.code ?? "");
      const msg = err instanceof Error ? err.message : "";
      if (
        /popup-closed-by-user|cancelled-popup-request|canceled|cancelled|1001/i.test(
          code + " " + msg
        )
      ) {
        dispatchModal({ type: "REAUTH_CANCEL" });
        return;
      }
      logger.error("AccountSection reauth failed", err);
      if (failedAttempts + 1 >= 3) {
        toast.error(
          "Couldn't verify your identity. Sign out and back in, then try again.",
          {
            action: {
              label: "Sign out",
              onClick: () => {
                void safeSignOut();
              },
            },
            duration: 10000,
          }
        );
        closeAndReset();
        return;
      }
      const friendly = friendlyAuthError(code || msg);
      setReauthError(
        friendly === (code || msg)
          ? "Couldn't confirm your identity. Use the same sign-in account and try again."
          : friendly
      );
      dispatchModal({ type: "REAUTH_FAIL" });
    } finally {
      inFlight.current = false;
    }
  };

  const handleSubmitDelete = async () => {
    if (!user || inFlight.current || accountDeleted) return;
    inFlight.current = true;
    setDeleteError(null);
    if (usesApple) {
      dispatchModal({ type: "REQUIRE_REAUTH" });
      inFlight.current = false;
      return;
    }
    dispatchModal({ type: "DELETE_START" });
    try {
      await runDeleteAccount(false);
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    if (
      !user ||
      deviceCleanupStarted.current ||
      !(requestPending || (deletion.pending && deletion.confirmed))
    )
      return;
    deviceCleanupStarted.current = true;
    // The request is durably accepted and cannot be undone. Clear this
    // phone's private photos even if it closes before cloud cleanup finishes.
    void Promise.allSettled([
      discardDeletedAccountPushState(user.uid),
      purgeFoodPhotos(user.uid),
    ]).then((results) => {
      if (
        results.some((result) => result.status === "rejected") &&
        activeUser.current?.uid === user.uid
      ) {
        setDeleteError(
          "Deletion continues on the server. Some saved data on this device couldn't be cleared; you can clear it by removing the app."
        );
      }
    });
  }, [user, requestPending, deletion.pending, deletion.confirmed]);
  useEffect(() => {
    if (!deletion.completed || completedFlight.current || inFlight.current)
      return;
    completedFlight.current = true;
    void finishDeletion();
  });

  return (
    <>
      <AccordionSection
        inline={inline}
        icon={<Download className="size-5 text-primary" />}
        title="Data & account"
        subtitle="Export, sign out, delete account"
      >
        {/*
          The extracted component, not a second inline copy.

          This block used to be ~40 lines of export buttons duplicated
          verbatim in DataExportSection — which is why that component read
          as an orphan: it was the EXTRACTED version, never adopted, while
          the copy that shipped stayed here. #1923 mistook it for an
          unwired feature and rendered it on the page as well, so the
          Account screen showed six export rows. Caught by a screenshot,
          not by a test: both copies work perfectly in isolation.

          Pointing at the component keeps one implementation and gives it
          the tests DataExportSection.test.tsx already has (uid binding,
          per-button routing, failure toast, signed-out no-op) — none of
          which covered this copy while it was the live one.
        */}
        <TrackSettingsSectionView section="data_storage">
          <DataExportSection user={user} />
        </TrackSettingsSectionView>

        {/* Sign out is `outline`, Delete account is `destructive` — the
            way round the actions actually rank. It was the reverse: Sign
            Out wore a filled `bg-destructive` at 16px/46px and shouted
            louder than anything else on the page, while the irreversible
            one sat underneath it as a 42px outline a type step smaller —
            below the 44px floor as well as below its neighbour. Signing
            out is reversible in one tap; deleting an account is not.

            Both now route through the `Button` primitive, which is where
            the 44px floor, the focus ring and the 0.97 press live. */}
        <Button
          variant="outline"
          fullWidth
          disabled={busy}
          onClick={safeSignOut}
        >
          <LogOut className="size-4" /> Sign out
        </Button>

        {/* Account Deletion (App Store Guideline 5.1.1(v)) */}
        <Button
          variant="destructive"
          fullWidth
          disabled={busy || accountDeleted}
          onClick={() => {
            haptic("error");
            // P0b: route through the Apple-cancel warning when the
            // user has an IAP-originated subscription. Apple's API
            // doesn't expose admin cancellation; we must hand them
            // off to the App Store before purge.
            if (hasAppleSubscription) {
              setShowAppleWarning(true);
            } else {
              openDeletion();
            }
          }}
        >
          <Trash2 className="size-4" /> Delete account
        </Button>
      </AccordionSection>

      {/* P0b — Apple-subscription pre-deletion warning. Surfaces
          only when the profile carries `appleOriginalTransactionId`.
          Required by Apple's "Offering account deletion" guidance
          since standard IAP subs can't be cancelled via the
          App Store Server API. */}
      <Dialog
        open={showAppleWarning}
        onClose={() => setShowAppleWarning(false)}
        title="Cancel your App Store subscription first"
        description="Tropos can't cancel your iOS subscription for you — Apple bills your account directly. Open subscription settings to cancel before deleting your account, or delete anyway and continue to be charged until you cancel."
        role="alertdialog"
      >
        {/* All three on the primitive. They were three bespoke class
            strings landing at 44px, 42px and 36px — two of them under the
            floor, in a dialog whose whole job is to make the user pause and
            choose deliberately. `destructive-tinted` for "Delete anyway"
            rather than filled red: it does not delete, it advances to the
            final confirmation, which is precisely the gated-danger case
            that variant documents. */}
        <div className="space-y-2">
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              window.open(APPLE_MANAGE_SUBSCRIPTIONS_URL, "_blank");
            }}
          >
            Open subscription settings
          </Button>
          <Button
            variant="destructive-tinted"
            fullWidth
            onClick={() => {
              setShowAppleWarning(false);
              openDeletion();
            }}
          >
            Delete anyway
          </Button>
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setShowAppleWarning(false)}
          >
            Cancel
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={showDeleteModal || pending || deletion.completed}
        onClose={dismiss}
        closeOnBackdrop={!busy && !accountDeleted}
        closeOnEscape={!busy && !accountDeleted}
        title={
          accountDeleted
            ? "Account deleted"
            : pending
              ? "Account deletion in progress"
              : inReauthFlight || modalState.phase === "needs-reauth"
                ? "Confirm it's you"
                : "Delete account"
        }
        size="md"
        role="alertdialog"
      >
        <div className="space-y-4" aria-busy={busy}>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive-strong">
              {deleteError}
            </p>
          )}
          {accountDeleted ? (
            <Button fullWidth loading={finishing} onClick={finishDeletion}>
              {finishing ? "Signing out…" : "Try signing out again"}
            </Button>
          ) : pending ? (
            <div className="space-y-4">
              <p role="status" className="text-sm text-muted-foreground">
                Your deletion request has been saved. Cleanup continues on the
                server, including automatic retries if a service is unavailable.
                You can close the app. Your sign-in is removed after cleanup
                completes.
              </p>
              {deletion.supportCode && (
                <p className="text-sm text-muted-foreground">
                  Support reference: {deletion.supportCode}
                </p>
              )}
              <Button variant="outline" fullWidth onClick={safeSignOut}>
                Sign out
              </Button>
              <a
                href="mailto:support@troposfit.com"
                className="min-h-11 flex items-center justify-center text-sm underline"
              >
                Contact support
              </a>
            </div>
          ) : modalState.phase === "confirm" ||
            modalState.phase === "deleting" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmitDelete();
              }}
            >
              <p className="text-sm text-muted-foreground">
                This permanently deletes your account, workouts, meals, runs,
                photos, and public social content. Limited billing and safety
                records are retained for their stated periods in our privacy
                policy. This cannot be undone. Export anything you want to keep
                first.
              </p>
              {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                  Removing your data. Larger accounts can take several minutes.
                  You can close the app; cleanup continues on the server.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={dismiss}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="flex-1"
                  loading={busy}
                >
                  {busy ? "Deleting…" : "Delete account"}
                </Button>
              </div>
            </form>
          ) : modalState.phase === "needs-reauth" || inReauthFlight ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (showPasswordInput) void handleReauth("password");
              }}
            >
              <p className="text-sm text-muted-foreground">
                Confirm your identity{" "}
                {displayedEmail ? `for ${displayedEmail}` : "for this account"}{" "}
                to finish deleting your account.
              </p>
              {usesApple && (
                <p className="text-sm text-muted-foreground">
                  This also disconnects Sign in with Apple from Tropos.
                </p>
              )}
              {reauthError && (
                <p role="alert" className="text-sm text-destructive-strong">
                  {reauthError}
                </p>
              )}
              {showPasswordInput && (
                <input
                  type="password"
                  autoComplete="current-password"
                  aria-label="Current password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  disabled={busy}
                  className="min-h-11 w-full px-3 py-2.5 rounded-xl bg-background border border-border text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                />
              )}
              <div className="space-y-2">
                {providers.map((provider) => (
                  <Button
                    key={provider}
                    fullWidth
                    type={provider === "password" ? "submit" : "button"}
                    onClick={
                      provider === "password"
                        ? undefined
                        : () => {
                            void handleReauth(provider);
                          }
                    }
                    disabled={busy || (provider === "password" && !password)}
                    loading={inReauthFlight && modalState.provider === provider}
                  >
                    {inReauthFlight && modalState.provider === provider
                      ? "Confirming…"
                      : providerLabel(provider)}
                  </Button>
                ))}
                {providers.length === 0 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Sign out, then sign in with your usual provider and return
                      here to delete your account.
                    </p>
                    <Button fullWidth onClick={safeSignOut}>
                      Sign out to confirm
                    </Button>
                  </>
                )}
              </div>
              <Button
                variant="outline"
                fullWidth
                onClick={dismiss}
                disabled={busy}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div role="status" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Identity confirmed. Removing your data. Larger accounts can take
                several minutes. You can close the app; cleanup continues on the
                server.
              </p>
              <div className="flex justify-center py-3">
                <Spinner size="md" label="Deleting account" />
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
