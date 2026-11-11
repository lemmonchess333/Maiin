/**
 * InviteCodeEntry — "Invited by a friend?" on People, for an account in its
 * first 14 days that has not used an invite (Soc15 call 4).
 *
 * Setup offers the same field; this is the way back for someone who
 * skipped it, mistyped it, or opened the friend's link after setting up.
 * It starts from a code an invite link left on this device. Using the
 * code makes the friend follow this person at once, and this person follow
 * them or ask to, by the friend's Approve followers (redeemInvite); the
 * line that says which replaces the field.
 *
 * Nothing shows for an older account, one that already joined from an
 * invite, or a restricted one.
 */
import { useId, useState, type FormEvent } from "react";
import { useInviteCodeInput } from "@/hooks/usePendingInvite";
import { UserCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import { isWithinInviteWindow, normaliseInviteCode } from "@/lib/inviteCode";
import {
  clearPendingInvite,
  pendingInviteRevision,
  pendingInviteUnchanged,
  savePendingInvite,
  snapshotPendingInvite,
} from "@/lib/pendingInvite";
import {
  describeInviteRefusal,
  inviteJoinedLine,
  isFinalInviteRefusal,
  NOT_A_CODE,
  redeemInviteCode,
} from "@/lib/invites";

export default function InviteCodeEntry({ disabled }: { disabled: boolean }) {
  const { user, profile, refreshProfile } = useAuth();
  const [now] = useState(() => Date.now());
  const [value, setValue, revision] = useInviteCodeInput();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{
    code: string;
    revision: number;
    text: string;
  } | null>(null);
  const message =
    error?.revision === revision &&
    error.code === (normaliseInviteCode(value) ?? value)
      ? error.text
      : null;
  const [joined, setJoined] = useState<string | null>(null);
  const inputId = useId();
  const messageId = useId();

  if (joined) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 p-3 rounded-xl bg-card"
      >
        <UserCheck
          className="size-5 shrink-0 text-success-strong"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-foreground">{joined}</p>
      </div>
    );
  }

  const createdAt = Date.parse(user?.metadata?.creationTime ?? "");
  if (
    disabled ||
    !user ||
    !profile ||
    profile.invitedAt != null ||
    !isWithinInviteWindow(createdAt, now)
  ) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const code = normaliseInviteCode(value);
    if (!code) {
      setError({ code: value, revision, text: NOT_A_CODE });
      return;
    }
    setSaving(true);
    setError(null);
    const pending = snapshotPendingInvite();
    try {
      const result = await redeemInviteCode(code);
      clearPendingInvite(pending);
      setJoined(inviteJoinedLine(result.inviterName, result.requested));
      // So the field stays away when People opens again.
      void refreshProfile({ until: (d) => d.invitedAt != null }).catch(
        () => {}
      );
    } catch (err) {
      const unchanged = pendingInviteUnchanged(pending);
      if (isFinalInviteRefusal(err)) clearPendingInvite(pending);
      else if (unchanged) savePendingInvite(code);
      if (unchanged)
        setError({
          code,
          revision: pendingInviteRevision(),
          text: describeInviteRefusal(err, "people"),
        });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-heading`}>
      <SectionHeading id={`${inputId}-heading`}>
        Invited by a friend?
      </SectionHeading>
      <form onSubmit={submit} className="space-y-2" noValidate>
        <label
          htmlFor={inputId}
          className="block text-sm text-muted-foreground"
        >
          Enter their invite code and they’ll follow you.
        </label>
        {/* The button drops under the field when the two no longer fit
            (larger text), rather than squeezing the code. Wide-first. */}
        <div className="flex flex-wrap gap-2">
          <input
            id={inputId}
            className="ds-input flex-1 min-w-[min(100%,10em)] min-h-11 font-mono"
            value={value}
            disabled={saving}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="ABCD-2345"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            aria-invalid={message !== null}
            aria-describedby={message ? messageId : undefined}
          />
          <Button type="submit" loading={saving} className="shrink-0">
            Use code
          </Button>
        </div>
        {message && (
          <p
            id={messageId}
            role="alert"
            className="text-sm text-destructive-strong"
          >
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
