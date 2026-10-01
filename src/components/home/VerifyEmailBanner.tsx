/**
 * Home's ask to verify an email account's address.
 *
 * Email sign-ups verify after the plan, not before it (owner, 2026-10-01):
 * the link goes out at sign-up, onboarding does not wait for it, and posts
 * and comments open once it is used (firestore.rules and the comment
 * callables check the claim; the compose sheets say so with
 * VerifyEmailNotice). This is the one place that asks without being asked.
 *
 * Shown only while the account needs it. It goes when the app sees the
 * address verified, which the App-level gate rechecks on every return to
 * the app, so tapping the link in Mail and coming back is enough. "Not now"
 * hides it for this account on this device; the compose sheets still ask.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { MailWarning } from "lucide-react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useEmailVerificationGate } from "@/hooks/useEmailVerificationGate";
import { useDismissOnce } from "@/hooks/useDismissOnce";
import {
  resendVerificationErrorMessage,
  sendVerificationEmail,
} from "@/lib/accountSecurity";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";

const VERIFY_EMAIL_DISMISS_KEY = "home-verify-email-v1";

export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const gate = useEmailVerificationGate(user);
  const { dismissed, dismiss } = useDismissOnce(VERIFY_EMAIL_DISMISS_KEY);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  if (!gate.needsVerification || dismissed || !user?.email) return null;

  const resend = async () => {
    setSending(true);
    try {
      await sendVerificationEmail();
      toast.success("Verification email sent");
    } catch (err) {
      logger.error("[VerifyEmailBanner] resend failed", err);
      toast.error(resendVerificationErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    setChecking(true);
    try {
      const verified = await gate.recheck();
      if (verified) toast.success("Email verified");
      else toast.error("Not verified yet. Open the link in the email first.");
    } catch (err) {
      logger.error("[VerifyEmailBanner] verification check failed", err);
      toast.error(
        "Couldn't check verification. Check your connection and try again."
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <Banner
      variant="neutral"
      icon={<MailWarning className="size-4" />}
      title="Verify your email to post and comment"
      description={
        <>
          We sent a link to{" "}
          <strong className="font-medium text-foreground break-all">
            {user.email}
          </strong>
          . Wrong address?{" "}
          <Link
            to="/settings/account"
            className="underline underline-offset-2 text-foreground"
          >
            Change it in Account
          </Link>
          .
        </>
      }
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={sending}
            onClick={resend}
          >
            Resend link
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={checking}
            onClick={confirm}
          >
            I've verified
          </Button>
        </div>
      }
      onDismiss={dismiss}
      dismissLabel="Not now"
    />
  );
}
