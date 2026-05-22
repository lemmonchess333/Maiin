import { useReducer, useState } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptic";
import {
  Download,
  LogOut,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { exportWorkoutsCSV, exportMealsCSV, exportBodyweightCSV, downloadCSV } from "@/lib/export";
import { deleteAccount } from "@/lib/socialApi";
import {
  reauthWithPassword,
  reauthWithGoogle,
  reauthWithApple,
  isSupportedReauthProvider,
  type SupportedReauthProviderId,
} from "@/lib/reauth";
import { friendlyAuthError } from "@/lib/authErrors";
import AccordionSection from "@/components/AccordionSection";
import type { User } from "firebase/auth";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Spinner } from "@/components/ui/Spinner";

interface AccountSectionProps {
  user: User | null;
  signOut: () => Promise<void>;
  inline?: boolean;
}

/* ════════════════════════════════════════════════════════════════
   Deletion-modal state machine
   ════════════════════════════════════════════════════════════════

   Phases:
     'confirm'           — initial state when modal is open; user
                           types DELETE.
     'deleting'          — first deletion call in flight.
     'needs-reauth'      — recent-auth gate (R1A Chunk 2) rejected
                           the deletion; user picks a provider to
                           reauth with. Tracks failedAttempts for
                           the 3-strike fallback.
     'reauthenticating'  — provider tap in flight (OAuth popup
                           open, or password being submitted).
     'retrying'          — auto-retry deletion after successful
                           reauth. Different label from 'deleting'
                           so users see the implicit retry as a
                           distinct step.
     (success closes the modal entirely.)

   Cancel from any phase returns to 'confirm' with the DELETE word
   reset — the user has to type it again before another attempt.
   This is intentional friction: the destructive confirmation
   shouldn't be replayed implicitly. */
type ModalPhase =
  | { phase: "confirm" }
  | { phase: "deleting" }
  | { phase: "needs-reauth"; failedAttempts: 0 | 1 | 2 }
  | { phase: "reauthenticating"; provider: SupportedReauthProviderId; failedAttempts: 0 | 1 | 2 }
  | { phase: "retrying" };

type ModalAction =
  | { type: "DELETE_START" }
  | { type: "REQUIRE_REAUTH" }
  | { type: "REAUTH_START"; provider: SupportedReauthProviderId }
  | { type: "REAUTH_FAIL" }
  | { type: "REAUTH_SUCCESS" }
  | { type: "CANCEL_REAUTH" };

function modalReducer(state: ModalPhase, action: ModalAction): ModalPhase {
  switch (action.type) {
    case "DELETE_START":
      return { phase: "deleting" };
    case "REQUIRE_REAUTH":
      return { phase: "needs-reauth", failedAttempts: 0 };
    case "REAUTH_START":
      if (state.phase !== "needs-reauth") return state;
      return {
        phase: "reauthenticating",
        provider: action.provider,
        failedAttempts: state.failedAttempts,
      };
    case "REAUTH_FAIL": {
      if (state.phase !== "reauthenticating") return state;
      /* Increment failed-attempt counter; clamp at 2 so the
         caller can decide whether to surface the strikeout
         fallback. */
      const next = Math.min(state.failedAttempts + 1, 2) as 0 | 1 | 2;
      return { phase: "needs-reauth", failedAttempts: next };
    }
    case "REAUTH_SUCCESS":
      return { phase: "retrying" };
    case "CANCEL_REAUTH":
      return { phase: "confirm" };
    default:
      return state;
  }
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

export default function AccountSection({
  user,
  signOut,
  inline = false,
}: AccountSectionProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [modalState, dispatchModal] = useReducer(
    modalReducer,
    { phase: "confirm" } as ModalPhase,
  );
  const deleteModalRef = useFocusTrap<HTMLDivElement>(showDeleteModal);

  const closeAndReset = () => {
    setShowDeleteModal(false);
    setDeleteConfirmText("");
    setPassword("");
    setReauthError(null);
    /* Reducer reset happens implicitly: the modal element is
       unmounted, so the reducer state is collected. Next OPEN
       starts fresh at 'confirm'. */
  };

  /* ── Deletion call ─────────────────────────────────────────────
     Used by both the initial Delete tap and the auto-retry after a
     successful reauth. Pulls out the common error handling. */
  const runDeleteAccount = async (isRetry: boolean): Promise<void> => {
    if (!user) return;
    try {
      await deleteAccount(user.uid);
      /* Server has deleted the Auth user. Firebase client SDK
         won't know until the next token refresh (which can be
         minutes). Sign out programmatically so client state
         immediately matches server state — user lands on login. */
      toast.success("Account deleted. Signing you out…", { duration: 4000 });
      signOut();
    } catch (err) {
      const fe = err as {
        code?: string;
        details?: { reason?: string };
      } | null;
      const msg = err instanceof Error ? err.message : "Failed to delete account";

      if (
        fe?.code === "functions/failed-precondition" &&
        fe?.details?.reason === "executor-disabled"
      ) {
        toast.error("Account deletion is temporarily paused. Please try again later.");
        closeAndReset();
      } else if (msg.includes("requires-recent-login")) {
        /* The reason Chunk 4 exists. If we got here on a retry
           (isRetry === true), the reauth succeeded but the
           recent-auth gate STILL rejected — that's the JWT-not-
           refreshed footgun the reauth.ts module guards against.
           If we hit it on retry, something's wrong upstream; fall
           through to the strikeout flow rather than looping. */
        if (isRetry) {
          logger.error("deleteAccount: recent-auth still required after reauth");
          toast.error(
            "Sign in again to delete your account.",
            {
              action: { label: "Sign out", onClick: () => { signOut(); } },
              duration: 10000,
            },
          );
          closeAndReset();
        } else {
          /* First-pass: switch the modal to reauth mode. */
          dispatchModal({ type: "REQUIRE_REAUTH" });
        }
      } else if (msg.includes("executor-disabled")) {
        toast.error("Account deletion is temporarily paused. Please try again later.");
        closeAndReset();
      } else if (
        msg.includes("no user record") ||
        msg.includes("auth/user-not-found")
      ) {
        toast.success("Account already deleted. Signing you out…", { duration: 4000 });
        signOut();
      } else {
        toast.error(msg);
        closeAndReset();
      }
    }
  };

  /* ── Reauth dispatcher ─────────────────────────────────────────
     Provider-aware. Returns to needs-reauth on failure with the
     attempt counter bumped; on success transitions to retrying
     and fires runDeleteAccount(true). */
  const handleReauth = async (provider: SupportedReauthProviderId): Promise<void> => {
    if (!user) return;
    setReauthError(null);
    dispatchModal({ type: "REAUTH_START", provider });
    try {
      if (provider === "password") {
        await reauthWithPassword(user, password);
      } else if (provider === "google.com") {
        await reauthWithGoogle(user);
      } else if (provider === "apple.com") {
        await reauthWithApple(user);
      }
      dispatchModal({ type: "REAUTH_SUCCESS" });
      await runDeleteAccount(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Reauth failed";
      /* User cancelling the OAuth popup is silent — no error
         toast, just return them to the provider picker. */
      if (
        msg.includes("popup-closed-by-user") ||
        msg.includes("cancelled-popup-request")
      ) {
        dispatchModal({ type: "REAUTH_FAIL" });
        return;
      }
      logger.error("AccountSection reauth failed", err);
      const next = modalState.phase === "reauthenticating"
        ? Math.min(modalState.failedAttempts + 1, 3)
        : 1;
      if (next >= 3) {
        /* 3-strike fallback — don't let users loop. Surface the
           manual sign-out toast and close the modal. */
        toast.error(
          "Couldn't verify your identity. Sign out and back in, then try again.",
          {
            action: { label: "Sign out", onClick: () => { signOut(); } },
            duration: 10000,
          },
        );
        closeAndReset();
        return;
      }
      setReauthError(friendlyAuthError(msg));
      dispatchModal({ type: "REAUTH_FAIL" });
    }
  };

  /* ── Initial deletion submit (from the confirm view) ───────────*/
  const handleSubmitDelete = async () => {
    if (!user || deleteConfirmText !== "DELETE") return;
    dispatchModal({ type: "DELETE_START" });
    await runDeleteAccount(false);
  };

  const providers = user ? listSupportedProviders(user) : [];
  const displayedEmail = user ? displayEmail(user) : null;
  const inReauthFlight = modalState.phase === "reauthenticating";
  const showPasswordInput =
    modalState.phase === "needs-reauth" || modalState.phase === "reauthenticating"
      ? providers.includes("password")
      : false;

  return (
    <>
      <AccordionSection inline={inline} icon={<Download className="w-5 h-5 text-primary" />} title="Data & Account" subtitle="Export, sign out">
        <div className="space-y-2">
          {[
            { label: "Export Workouts (CSV)", key: "workouts" },
            { label: "Export Meals (CSV)", key: "meals" },
            { label: "Export Bodyweight (CSV)", key: "bodyweight" },
          ].map(({ label, key }) => (
            <button
              key={key}
              disabled={exporting !== null}
              onClick={async () => {
                if (!user) return;
                setExporting(key);
                try {
                  let csv: string;
                  if (key === "workouts") csv = await exportWorkoutsCSV(user.uid);
                  else if (key === "meals") csv = await exportMealsCSV(user.uid);
                  else csv = await exportBodyweightCSV(user.uid);
                  downloadCSV(csv, `tropos-${key}-${new Date().toISOString().split("T")[0]}.csv`);
                  toast.success(`${key.charAt(0).toUpperCase() + key.slice(1)} exported!`);
                } catch (err) {
                  toast.error("Export failed");
                  logger.error(err);
                }
                setExporting(null);
              }}
              className="w-full p-3 rounded-xl bg-card border border-border text-sm text-left hover:bg-muted transition-colors disabled:opacity-50"
            >
              {exporting === key ? "Exporting..." : label}
            </button>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={signOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </motion.button>

        {/* Account Deletion (App Store Guideline 5.1.1(v)) */}
        <button
          onClick={() => { haptic("error"); setShowDeleteModal(true); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Delete Account
        </button>
      </AccordionSection>

      {/* Delete Account Modal (App Store Guideline 5.1.1(v)) */}
      {showDeleteModal && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[1000]"
            role="button" tabIndex={0} aria-label="Close dialog"
            onClick={inReauthFlight ? undefined : closeAndReset}
            onKeyDown={(e) => {
              if (inReauthFlight) return;
              if (e.key === 'Enter' || e.key === ' ') closeAndReset();
            }}
          />
          <div
            ref={deleteModalRef}
            role="dialog"
            aria-modal="true"
            aria-live="polite"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[1001] bg-card rounded-2xl p-5 space-y-4 max-w-sm mx-auto shadow-xl"
          >
            {/* ── Phase: confirm / deleting ────────────────────────*/}
            {(modalState.phase === "confirm" || modalState.phase === "deleting") && (
              <>
                <h3 className="text-base font-semibold text-destructive">Delete Account</h3>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete your account and all associated data including workouts, meals, runs, and social activity. This action cannot be undone.
                </p>
                <p className="text-sm text-foreground font-medium">
                  Type <span className="text-destructive font-bold">DELETE</span> to confirm:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  disabled={modalState.phase === "deleting"}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground disabled:opacity-50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={closeAndReset}
                    disabled={modalState.phase === "deleting"}
                    className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitDelete}
                    disabled={deleteConfirmText !== "DELETE" || modalState.phase === "deleting"}
                    className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {modalState.phase === "deleting" ? (
                      <>
                        <Spinner size="sm" variant="inverse" label="Deleting account" />
                        Deleting…
                      </>
                    ) : (
                      "Delete Account"
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ── Phase: needs-reauth / reauthenticating ───────────*/}
            {(modalState.phase === "needs-reauth" || modalState.phase === "reauthenticating") && (
              <>
                <h3 className="text-base font-semibold text-foreground">Confirm it's you</h3>
                <p className="text-sm text-muted-foreground">
                  For security, re-confirm your identity {displayedEmail
                    ? <>for <span className="font-medium text-foreground">{displayedEmail}</span></>
                    : "for this account"} before deleting. You won't be charged for anything new.
                </p>

                {reauthError && (
                  <p className="text-sm text-destructive">{reauthError}</p>
                )}

                {showPasswordInput && (
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    disabled={inReauthFlight}
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-foreground text-sm placeholder:text-muted-foreground disabled:opacity-50"
                  />
                )}

                <div className="space-y-2">
                  {providers.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleReauth(p)}
                      disabled={
                        inReauthFlight ||
                        (p === "password" && password.length === 0)
                      }
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {inReauthFlight && modalState.provider === p ? (
                        <>
                          <Spinner size="sm" variant="inverse" label="Confirming" />
                          Confirming…
                        </>
                      ) : (
                        providerLabel(p)
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={closeAndReset}
                  disabled={inReauthFlight}
                  className="w-full py-2.5 rounded-xl bg-muted text-foreground text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            )}

            {/* ── Phase: retrying (post-reauth, deletion in flight) */}
            {modalState.phase === "retrying" && (
              <>
                <h3 className="text-base font-semibold text-destructive">Deleting account…</h3>
                <p className="text-sm text-muted-foreground">
                  Confirmed. Removing your data — this should take a few seconds.
                </p>
                <div className="flex justify-center py-3">
                  <Spinner size="md" label="Deleting account" />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
