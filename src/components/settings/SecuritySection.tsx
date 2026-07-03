import { useState } from "react";
import { KeyRound, CheckCircle2, MailWarning } from "lucide-react";
import type { User } from "firebase/auth";
import AccordionSection from "@/components/AccordionSection";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import { friendlyAuthError } from "@/lib/authErrors";
import {
  sendVerificationEmail,
  changePassword,
  requestEmailChange,
} from "@/lib/accountSecurity";

interface SecuritySectionProps {
  user: User | null;
  inline?: boolean;
}

const INPUT_CLASS =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

function oauthLabel(user: User): string | null {
  if (user.providerData.some((p) => p.providerId === "google.com"))
    return "Google";
  if (user.providerData.some((p) => p.providerId === "apple.com"))
    return "Apple";
  return null;
}

/**
 * Sign-in & security (account table-stakes pass, 2026-07): email
 * verification status + resend, change password, change email.
 *
 * Password/email changes are offered only to accounts with the "password"
 * provider — both reauth with the CURRENT password first (accountSecurity),
 * so `requires-recent-login` can't surface. OAuth-only users get a pointer
 * to the forgot-password flow, which mints a set-password link for any
 * account (adding the password provider).
 */
export default function SecuritySection({
  user,
  inline,
}: SecuritySectionProps) {
  const [dialog, setDialog] = useState<null | "password" | "email">(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingVerify, setSendingVerify] = useState(false);
  // Bumped after user.reload() so emailVerified re-reads fresh.
  const [, setRefreshTick] = useState(0);

  if (!user) return null;

  const hasPassword = user.providerData.some(
    (p) => p.providerId === "password"
  );
  const provider = oauthLabel(user);

  const closeDialog = () => {
    setDialog(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setNewEmail("");
    setFormError("");
  };

  const handleResendVerification = async () => {
    setSendingVerify(true);
    try {
      await sendVerificationEmail();
      toast.success("Verification email sent — check your inbox");
    } catch (err) {
      logger.error("[SecuritySection] resend verification failed", err);
      // Callable errors (rate limit etc.) carry a user-facing message.
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("Too many")
          ? msg
          : "Couldn't send the email. Try again in a moment."
      );
    } finally {
      setSendingVerify(false);
    }
  };

  const handleVerifiedRefresh = async () => {
    try {
      await user.reload();
    } catch {
      /* offline — fall through to the current state */
    }
    setRefreshTick((t) => t + 1);
    if (user.emailVerified) toast.success("Email verified — thanks!");
    else toast.error("Not verified yet — tap the link in the email first");
  };

  const handleChangePassword = async () => {
    setFormError("");
    if (newPassword.length < 6) {
      setFormError("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("New passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await changePassword(user, currentPassword, newPassword);
      toast.success("Password updated");
      closeDialog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setFormError(friendlyAuthError(msg));
    } finally {
      setBusy(false);
    }
  };

  const handleChangeEmail = async () => {
    setFormError("");
    const email = newEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError("Enter a valid email address");
      return;
    }
    if (email.toLowerCase() === (user.email ?? "").toLowerCase()) {
      setFormError("That's already your email");
      return;
    }
    setBusy(true);
    try {
      await requestEmailChange(user, currentPassword, email);
      toast.success(`Confirmation sent to ${email}`);
      closeDialog();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setFormError(friendlyAuthError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AccordionSection
        inline={inline}
        icon={<KeyRound className="size-5 text-primary" />}
        title="Sign-in & security"
        subtitle="Email, password"
      >
        {/* Email + verification status */}
        {user.email && (
          <div className="rounded-xl bg-card border border-border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm text-foreground truncate">
                  {user.email}
                </p>
              </div>
              {user.emailVerified ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  <MailWarning className="size-3.5" aria-hidden="true" />
                  Not verified
                </span>
              )}
            </div>
            {!user.emailVerified && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  loading={sendingVerify}
                  onClick={handleResendVerification}
                >
                  Resend email
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                  onClick={handleVerifiedRefresh}
                >
                  I've verified
                </Button>
              </div>
            )}
          </div>
        )}

        {hasPassword ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setDialog("password")}
              className="w-full p-3 rounded-xl bg-card border border-border text-sm text-left hover:bg-muted transition-colors"
            >
              Change password
            </button>
            <button
              type="button"
              onClick={() => setDialog("email")}
              className="w-full p-3 rounded-xl bg-card border border-border text-sm text-left hover:bg-muted transition-colors"
            >
              Change email
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            You sign in with {provider ?? "an external provider"}. To add a
            password, use "Forgot password" on the sign-in screen — we'll
            email you a set-password link.
          </p>
        )}
      </AccordionSection>

      {/* Change password */}
      <Dialog
        open={dialog === "password"}
        onClose={busy ? () => {} : closeDialog}
        title="Change password"
        description="Enter your current password, then choose a new one."
      >
        <div className="space-y-3">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (min 6 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
          />
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={busy}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              onClick={handleChangePassword}
            >
              Update
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Change email */}
      <Dialog
        open={dialog === "email"}
        onClose={busy ? () => {} : closeDialog}
        title="Change email"
        description="We'll send a confirmation link to the new address — your sign-in email changes once you tap it."
      >
        <div className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            placeholder="New email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
          />
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              loading={busy}
              disabled={!newEmail || !currentPassword}
              onClick={handleChangeEmail}
            >
              Send confirmation
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
