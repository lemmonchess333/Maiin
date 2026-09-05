/**
 * Verified-email notice for the public compose surfaces — feed shares,
 * space posts and both comment sheets.
 *
 * Rendered only while `needsEmailVerification(user)` holds; the parent owns
 * that decision and disables its primary action alongside, so the reason
 * the button is off is always on screen with it. The server refuses the
 * write regardless (`firestore.rules` isEmailVerified() and the two comment
 * callables) — this exists so the refusal is explained before it happens.
 *
 * Two actions, both verbs: resend the link (the same callable Settings
 * uses) and confirm verification (`recheck` from useEmailVerificationGate:
 * reload + token refresh, so the rules see the fresh claim on the very next
 * write). Copy is one calm sentence — the fact, then what to do.
 */
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { logger } from "@/lib/logger";
import {
  sendVerificationEmail,
  resendVerificationErrorMessage,
} from "@/lib/accountSecurity";

interface VerifyEmailNoticeProps {
  /** The verb being held: "post" for shares and space posts, "comment" for
   *  the comment sheets. */
  action?: "post" | "comment";
  /** Reload + token refresh; resolves true once the account reads verified. */
  onRecheck: () => Promise<boolean>;
}

export default function VerifyEmailNotice({
  action = "post",
  onRecheck,
}: VerifyEmailNoticeProps) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);

  const resend = async () => {
    setSending(true);
    try {
      await sendVerificationEmail();
      toast.success("Verification email sent — check your inbox");
    } catch (err) {
      logger.error("[VerifyEmailNotice] resend failed", err);
      toast.error(resendVerificationErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const confirm = async () => {
    setChecking(true);
    try {
      const verified = await onRecheck();
      if (verified) toast.success("Email verified");
      else toast.error("Not verified yet — tap the link in the email first");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div role="status" className="rounded-xl bg-muted/50 px-3.5 py-3 space-y-3">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <MailWarning
          className="size-4 shrink-0 mt-0.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span>
          Verify your email to {action} — check your inbox for the link.
        </span>
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          loading={sending}
          onClick={resend}
        >
          Resend link
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          loading={checking}
          onClick={confirm}
        >
          I have verified
        </Button>
      </div>
    </div>
  );
}
